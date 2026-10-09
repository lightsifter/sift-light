#!/usr/bin/env node
import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { isUtf8 } from "node:buffer";
import {
  conceptEmbeddingKey,
  enforceConceptCacheLimit,
  readConceptEmbedding,
  writeConceptEmbedding,
  type CachedConceptEmbedding,
} from "./concept-embedding-cache.js";
import {
  cosineSimilarity,
  embedConceptInputs,
  meanNormalized,
  type PendingConceptEmbedding,
} from "./concept-inference.js";
import {
  CONCEPT_ASSETS,
  CONCEPT_CACHE_MAX_BYTES,
  MAX_CONCEPT_CHARS,
  MAX_CONCEPT_WORKER_INPUT_BYTES,
  conceptCacheDirectory,
  conceptModelDirectory,
  verifyConceptModel,
} from "./concept-model.js";
import { installConceptModel } from "./concept-setup.js";
import { isRecordValue } from "./record-value.js";

const CACHE_IO_CONCURRENCY = 64;
let activeRequestId: string | undefined;
let extractor: FeatureExtractionPipeline | undefined;
let modelVerified = false;
let modelLoads = 0;

interface WorkerProgress {
  phase: "cache-read" | "model-loading" | "embedding" | "cache-write" | "cache-cleanup";
  completed?: number;
  total?: number;
  uniqueEmbeddings: number;
  passages: number;
}

function emitProgress(progress: WorkerProgress): void {
  process.stdout.write(
    `${JSON.stringify({ type: "progress", id: activeRequestId, ...progress })}\n`,
  );
}

async function readCachedEmbeddings(
  root: string,
  requested: readonly PendingConceptEmbedding[],
  onProgress?: (completed: number, total: number) => void,
) {
  const cached = [];
  for (let offset = 0; offset < requested.length; offset += CACHE_IO_CONCURRENCY) {
    // oxlint-disable-next-line no-await-in-loop -- bounded batches avoid exhausting file descriptors.
    const batch = await Promise.all(
      requested
        .slice(offset, offset + CACHE_IO_CONCURRENCY)
        .map((item) => readConceptEmbedding(root, item.key)),
    );
    cached.push(...batch);
    onProgress?.(Math.min(offset + batch.length, requested.length), requested.length);
  }
  return cached;
}

async function readSingleRequest(): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buffer);
    bytes += buffer.length;
    if (bytes > MAX_CONCEPT_WORKER_INPUT_BYTES)
      throw new Error("Concept worker input exceeds its 64 MiB source protocol budget");
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function decodeRequest(request: unknown): { query: string; passages: string[] } {
  if (
    !isRecordValue(request) ||
    typeof request.query !== "string" ||
    request.query.length === 0 ||
    request.query.length > 256 ||
    !request.query.isWellFormed() ||
    /[\r\n\0]/u.test(request.query) ||
    !Array.isArray(request.encodedPassages) ||
    request.encodedPassages.some(
      (item) =>
        typeof item !== "string" ||
        item.length === 0 ||
        item.length % 4 !== 0 ||
        item.length > Math.ceil((((MAX_CONCEPT_CHARS + 256) * 4) / 3) * 4) + 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/u.test(item),
    )
  )
    throw new Error("Invalid concept worker input");
  const encodedPassages = request.encodedPassages.filter(
    (item): item is string => typeof item === "string",
  );
  const buffers = encodedPassages.map((item) => Buffer.from(item, "base64"));
  if (buffers.some((item) => !isUtf8(item)))
    throw new Error("Invalid UTF-8 concept worker passage");
  const passages = buffers.map((item) => item.toString("utf8"));
  if (
    passages.some(
      (item) => !item.length || item.length > MAX_CONCEPT_CHARS + 256 || !item.isWellFormed(),
    )
  )
    throw new Error("Invalid decoded concept worker passage");
  return { query: request.query, passages };
}

async function search(raw: unknown): Promise<void> {
  const request = decodeRequest(raw);
  const directory = conceptModelDirectory();
  const cacheRoot = conceptCacheDirectory();
  const stagingRoot = process.env.SIFT_LIGHT_CONCEPT_CACHE_STAGING_DIR ?? cacheRoot;
  if (!modelVerified) {
    await verifyConceptModel(directory);
    modelVerified = true;
  }
  const modelReused = extractor !== undefined;
  const requested: PendingConceptEmbedding[] = [
    { key: conceptEmbeddingKey("query", request.query), role: "query", text: request.query },
    ...request.passages.map((text): PendingConceptEmbedding => ({
      key: conceptEmbeddingKey("passage", text),
      role: "passage",
      text,
    })),
  ];
  const uniqueRequested = [...new Map(requested.map((item) => [item.key, item])).values()];
  const progressContext = {
    uniqueEmbeddings: uniqueRequested.length,
    passages: request.passages.length,
  };
  const cached = await readCachedEmbeddings(cacheRoot, uniqueRequested, (completed, total) =>
    emitProgress({ phase: "cache-read", completed, total, ...progressContext }),
  );
  const missing = uniqueRequested.filter((_item, index) => !cached[index]);
  const warnings: string[] = [];
  let created: CachedConceptEmbedding[] = [];
  let cacheWriteFailed = false;
  if (missing.length) {
    env.allowRemoteModels = false;
    env.useFSCache = false;
    env.useBrowserCache = false;
    env.localModelPath = "/";
    if (!extractor) {
      emitProgress({ phase: "model-loading", ...progressContext });
      extractor = await pipeline("feature-extraction", directory, {
        local_files_only: true,
        dtype: "q8",
        device: "cpu",
        session_options: { intraOpNumThreads: 4, interOpNumThreads: 1 },
      });
      modelLoads += 1;
    }
    created = await embedConceptInputs(extractor, missing, {
      onCompletedEmbedding: async (embedding, completed, total) => {
        try {
          await writeConceptEmbedding(cacheRoot, embedding, stagingRoot);
        } catch {
          cacheWriteFailed = true;
        }
        emitProgress({ phase: "cache-write", completed, total, ...progressContext });
      },
      onBatch: (completed, total) =>
        emitProgress({ phase: "embedding", completed, total, ...progressContext }),
    });
    if (cacheWriteFailed)
      warnings.push(
        "Concept embedding cache write failed; ranking completed but some work may repeat",
      );
  }
  const createdByKey = new Map(created.map((item) => [item.key, item]));
  const embeddingsByKey = new Map(
    uniqueRequested.map((item, index) => [item.key, cached[index] ?? createdByKey.get(item.key)]),
  );
  const embeddings = requested.map((item) => embeddingsByKey.get(item.key));
  if (embeddings.some((item) => !item)) throw new Error("Missing concept embedding result");
  const queryWindows = embeddings[0]?.windows;
  if (!queryWindows?.length) throw new Error("Missing concept query embedding");
  const query = meanNormalized(queryWindows.map((window) => window.vector));
  const passageEmbeddings = embeddings.slice(1);
  const scores = passageEmbeddings.map((embedding) => {
    if (!embedding?.windows.length) throw new Error("Missing concept passage embedding");
    return Math.max(...embedding.windows.map((window) => cosineSimilarity(query, window.vector)));
  });
  let cacheBytes: number | undefined;
  try {
    emitProgress({ phase: "cache-cleanup", ...progressContext });
    cacheBytes = await enforceConceptCacheLimit(cacheRoot);
  } catch {
    warnings.push(
      "Concept embedding cache cleanup failed; the configured 512 MiB bound was not verified",
    );
  }
  process.stdout.write(
    JSON.stringify({
      type: "result",
      id: activeRequestId,
      modelLoads,
      modelReused,
      scores,
      cacheHits: cached.filter(Boolean).length,
      cacheMisses: missing.length,
      cacheMaxBytes: CONCEPT_CACHE_MAX_BYTES,
      ...(cacheBytes === undefined ? {} : { cacheBytes }),
      windowsRanked: passageEmbeddings.reduce(
        (total, embedding) => total + (embedding?.windows.length ?? 0),
        0,
      ),
      warnings: [...new Set(warnings)],
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
      modelBytes: CONCEPT_ASSETS.reduce((sum, asset) => sum + asset.bytes, 0),
    }) + "\n",
  );
}

async function serve(): Promise<void> {
  let buffer = Buffer.alloc(0);
  for await (const chunk of process.stdin) {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    if (buffer.length > MAX_CONCEPT_WORKER_INPUT_BYTES)
      throw new Error("Concept request frame exceeds 64 MiB");
    let newline = buffer.indexOf(10);
    while (newline >= 0) {
      const line = buffer.subarray(0, newline);
      buffer = buffer.subarray(newline + 1);
      const raw: unknown = JSON.parse(line.toString("utf8"));
      if (!isRecordValue(raw) || typeof raw.id !== "string" || !/^[a-f0-9-]{36}$/u.test(raw.id))
        throw new Error("Invalid concept request identity");
      activeRequestId = raw.id;
      try {
        // oxlint-disable-next-line no-await-in-loop -- exactly one inference request is active per resident worker.
        await search(raw);
      } catch (error) {
        process.stdout.write(
          JSON.stringify({
            type: "error",
            id: activeRequestId,
            message:
              error instanceof Error ? error.message.slice(0, 512) : "Concept inference failed",
          }) + "\n",
        );
        return;
      }
      newline = buffer.indexOf(10);
    }
  }
  if (buffer.length) throw new Error("Incomplete concept request frame");
}

try {
  if (process.argv.includes("--install-model")) await installConceptModel();
  else if (process.argv.includes("--infer")) await search(await readSingleRequest());
  else if (process.argv.includes("--serve")) await serve();
  else throw new Error("Usage: sift-light-model --install-model");
} finally {
  await extractor?.dispose();
}
