import { rangeEvidence } from "./analysis-evidence.js";
import { OwnedTaskQueue } from "./owned-task-queue.js";
const inferenceQueue = new OwnedTaskQueue();
import { dirname } from "node:path";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { StringDecoder } from "node:string_decoder";
import { mkdir } from "node:fs/promises";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { AnalysisResultSet, ConceptScoreProfile } from "./analysis-types.js";
import {
  CONCEPT_MODEL,
  CONCEPT_PASSAGE_OVERLAP_CHARS,
  CONCEPT_REVISION,
  MAX_CONCEPT_CHARS,
  MAX_CONCEPT_WORKER_OUTPUT_BYTES,
  conceptCacheDirectory,
} from "./concept-model.js";
import { abortError, ConceptUnavailableError, SignalGrepError } from "./errors.js";
import { runOwnedProcess } from "./owned-process.js";
import { rpcRecord } from "./owned-json-rpc.js";
import { normalizeRequest } from "./request.js";
import type { SignalGrepInput } from "./service.js";
import { SourceAccess } from "./source-access.js";
import type { SourceDocument, ByteRange } from "./source-document.js";
import {
  createConceptSourceGeneration,
  conceptSourceSummary,
  verifyConceptSourceGeneration,
  type ConceptSourceGeneration,
} from "./concept-source-generation.js";
import type { OperationProgress } from "./operation-lifecycle.js";

export interface Passage {
  document: SourceDocument;
  range: ByteRange;
  text: string;
}

/** Soft planning signal: large enumerations should narrow path/glob before interactive inference. */
const MAX_CONCEPT_FILES_WARN = 500;

function conciseWorkerError(stderr: string): string {
  const errorLine = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^(?:[A-Za-z_$][\w$]*Error|Error|error):\s*\S/i.test(line));
  if (errorLine) return errorLine.replace(/^[^:]+(?:Error|error):\s*/i, "").slice(0, 512);
  const diagnostic = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (diagnostic) return diagnostic.slice(0, 512);
  return "worker returned no concise diagnostic";
}

/** A worker that disappears without a protocol result can be restarted once by the owner. */
export class ConceptWorkerExitError extends SignalGrepError {
  readonly exitCode: number | null;

  constructor(exitCode: number | null, diagnostic: string) {
    super(`Local concept worker exited unexpectedly (${String(exitCode)}): ${diagnostic}`);
    this.name = "ConceptWorkerExitError";
    this.exitCode = exitCode;
  }
}

function scoreProfile(scores: readonly number[]): ConceptScoreProfile {
  const ordered = scores.toSorted((a, b) => b - a);
  const count = ordered.length;
  const top = ordered[0];
  const min = ordered.at(-1);
  if (top === undefined || min === undefined || count === 0)
    throw new Error("Concept score profile requires at least one score");
  const middle = Math.floor(count / 2);
  const middleValue = ordered[middle] ?? top;
  const median = count % 2 === 1 ? middleValue : ((ordered[middle - 1] ?? top) + middleValue) / 2;
  const second = ordered[1];
  return {
    count,
    top,
    ...(second !== undefined ? { second, topMargin: top - second } : {}),
    median: median ?? top,
    min,
    spread: top - min,
  };
}

function passage(document: SourceDocument, start: number): { value: Passage; next: number } {
  let end = Math.min(document.text.length, start + MAX_CONCEPT_CHARS);
  if (end < document.text.length) {
    const newline = document.text.lastIndexOf("\n", end);
    if (newline > start + MAX_CONCEPT_CHARS / 2) end = newline + 1;
    const code = document.text.charCodeAt(end);
    if (code >= 0xdc00 && code <= 0xdfff) end -= 1;
  }
  const range = { start: document.toByteOffset(start), end: document.toByteOffset(end) };
  let next = end;
  if (end < document.text.length) {
    next = Math.max(start + 1, end - CONCEPT_PASSAGE_OVERLAP_CHARS);
    const code = document.text.charCodeAt(next);
    if (code >= 0xdc00 && code <= 0xdfff) next += 1;
  }
  return {
    value: {
      document,
      range,
      text: document.text.slice(start, end),
    },
    next,
  };
}

export interface ConceptInferenceResult {
  scores: number[];
  cacheHits: number;
  cacheMisses: number;
  cacheMaxBytes: number;
  cacheBytes?: number;
  windowsRanked: number;
  warnings: string[];
  peakRssBytes: number;
}

export interface ConceptSearchExecution {
  analysis: AnalysisResultSet;
  sourceGeneration: ConceptSourceGeneration;
}

export type ConceptInferenceRunner = (
  query: string,
  passages: Passage[],
  parent?: AbortSignal,
  onProgress?: (progress: OperationProgress) => void,
) => Promise<ConceptInferenceResult>;

async function similarities(
  query: string,
  passages: Passage[],
  parent?: AbortSignal,
  onProgress?: (progress: OperationProgress) => void,
): Promise<ConceptInferenceResult> {
  const worker = fileURLToPath(new URL("./concept-worker.mjs", import.meta.url));
  const config = fileURLToPath(new URL("./syntax-worker.toml", import.meta.url));
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const stagingRoot = join(conceptCacheDirectory(), ".staging", randomUUID());
  await mkdir(stagingRoot, { recursive: true });
  let bytes = 0;
  let lineBuffer = "";
  let finalValue: Record<string, unknown> | undefined;
  let sawFinal = false;
  const decoder = new StringDecoder("utf8");
  try {
    const processResult = await runOwnedProcess(
      {
        executable: process.execPath,
        args: process.versions.bun
          ? [
              `--config=${config}`,
              "--no-env-file",
              "--no-macros",
              "--no-install",
              worker,
              "--infer",
            ]
          : [worker, "--infer"],
        cwd: dirname(worker),
        env: { ...env, SIGNAL_GREP_CONCEPT_CACHE_STAGING_DIR: stagingRoot },
        ...(parent ? { signal: parent } : {}),
        input: Buffer.from(
          JSON.stringify({
            query,
            encodedPassages: passages.map((item) => Buffer.from(item.text).toString("base64")),
          }),
        ),
      },
      async (stdout) => {
        for await (const chunk of stdout) {
          bytes += chunk.byteLength;
          if (bytes > MAX_CONCEPT_WORKER_OUTPUT_BYTES)
            throw new SignalGrepError("Concept worker exceeded its 4 MiB response budget");
          lineBuffer += decoder.write(Buffer.from(chunk));
          let newline = lineBuffer.indexOf("\n");
          while (newline >= 0) {
            const line = lineBuffer.slice(0, newline).trim();
            lineBuffer = lineBuffer.slice(newline + 1);
            newline = lineBuffer.indexOf("\n");
            if (!line) continue;
            const parsed: unknown = JSON.parse(line);
            if (!rpcRecord(parsed) || typeof parsed.type !== "string")
              throw new SignalGrepError("Invalid concept worker progress response");
            if (parsed.type === "progress") {
              if (sawFinal)
                throw new SignalGrepError("Concept worker emitted progress after its result");
              if (
                typeof parsed.phase !== "string" ||
                (parsed.completed !== undefined &&
                  (typeof parsed.completed !== "number" ||
                    !Number.isSafeInteger(parsed.completed) ||
                    parsed.completed < 0)) ||
                (parsed.total !== undefined &&
                  (typeof parsed.total !== "number" ||
                    !Number.isSafeInteger(parsed.total) ||
                    parsed.total < 0))
              )
                throw new SignalGrepError("Invalid concept worker progress response");
              const progress: OperationProgress = { phase: parsed.phase };
              if (typeof parsed.completed === "number") progress.completed = parsed.completed;
              if (typeof parsed.total === "number") progress.total = parsed.total;
              if (
                typeof parsed.uniqueEmbeddings === "number" &&
                typeof parsed.passages === "number"
              )
                progress.detail = `unique embeddings ${String(parsed.uniqueEmbeddings)}, passages ${String(parsed.passages)}`;
              onProgress?.(progress);
            } else if (parsed.type === "result") {
              if (sawFinal)
                throw new SignalGrepError("Concept worker emitted more than one result");
              sawFinal = true;
              finalValue = parsed;
            } else {
              throw new SignalGrepError("Invalid concept worker response type");
            }
          }
        }
      },
    );
    if (processResult.code === null)
      throw new ConceptWorkerExitError(
        processResult.code,
        conciseWorkerError(processResult.stderr),
      );
    if (processResult.code !== 0)
      throw new ConceptUnavailableError(
        `Local concept inference failed (${String(processResult.code)}): ${conciseWorkerError(processResult.stderr)}`,
      );
    lineBuffer += decoder.end();
    if (lineBuffer.trim()) {
      const parsed: unknown = JSON.parse(lineBuffer.trim());
      if (!rpcRecord(parsed) || parsed.type !== "result")
        throw new SignalGrepError("Concept worker did not return a result record");
      if (sawFinal) throw new SignalGrepError("Concept worker emitted more than one result");
      finalValue = parsed;
      sawFinal = true;
    }
    const value: unknown = finalValue;
    if (
      !rpcRecord(value) ||
      !Array.isArray(value.scores) ||
      value.scores.length !== passages.length ||
      value.scores.some((score) => typeof score !== "number" || !Number.isFinite(score)) ||
      typeof value.cacheHits !== "number" ||
      !Number.isSafeInteger(value.cacheHits) ||
      value.cacheHits < 0 ||
      typeof value.cacheMisses !== "number" ||
      !Number.isSafeInteger(value.cacheMisses) ||
      value.cacheMisses < 0 ||
      typeof value.cacheMaxBytes !== "number" ||
      !Number.isSafeInteger(value.cacheMaxBytes) ||
      value.cacheMaxBytes <= 0 ||
      (value.cacheBytes !== undefined &&
        (typeof value.cacheBytes !== "number" ||
          !Number.isSafeInteger(value.cacheBytes) ||
          value.cacheBytes < 0)) ||
      typeof value.windowsRanked !== "number" ||
      !Number.isSafeInteger(value.windowsRanked) ||
      value.windowsRanked < passages.length ||
      !Array.isArray(value.warnings) ||
      value.warnings.some((warning) => typeof warning !== "string") ||
      typeof value.peakRssBytes !== "number" ||
      !Number.isFinite(value.peakRssBytes) ||
      value.peakRssBytes < 0
    )
      throw new SignalGrepError("Invalid concept inference response");
    return {
      scores: value.scores.filter((score): score is number => typeof score === "number"),
      cacheHits: value.cacheHits,
      cacheMisses: value.cacheMisses,
      cacheMaxBytes: value.cacheMaxBytes,
      ...(typeof value.cacheBytes === "number" ? { cacheBytes: value.cacheBytes } : {}),
      windowsRanked: value.windowsRanked,
      warnings: value.warnings.filter((warning): warning is string => typeof warning === "string"),
      peakRssBytes: value.peakRssBytes,
    };
  } catch (error) {
    if (parent?.aborted) throw abortError();
    if (error instanceof ConceptWorkerExitError) throw error;
    if (error instanceof ConceptUnavailableError) throw error;
    const message = error instanceof Error ? error.message : "unknown provider failure";
    throw new ConceptUnavailableError(`Local concept inference failed: ${message}`, {
      cause: error,
    });
  } finally {
    try {
      await rm(stagingRoot, { recursive: true, force: true });
    } catch (error) {
      // oxlint-disable-next-line no-unsafe-finally -- owner staging cleanup must report failure.
      throw new ConceptUnavailableError("Unable to clean up concept worker staging files", {
        cause: error,
      });
    }
  }
}

export function validateConceptQuery(query: string | undefined): string {
  if (!query?.trim() || query.length > 256 || !query.isWellFormed() || /[\r\n\0]/.test(query))
    throw new SignalGrepError(
      "Concept query requires nonempty, single-line well-formed text of at most 256 characters",
    );
  return query;
}

async function runConceptSearch(
  input: SignalGrepInput,
  access: SourceAccess,
  infer: ConceptInferenceRunner,
  onProgress?: (progress: OperationProgress) => void,
): Promise<ConceptSearchExecution> {
  const query = validateConceptQuery(input.query);
  const started = performance.now();
  const request = normalizeRequest({ ...input, pattern: "" });
  const sourceGeneration = await createConceptSourceGeneration(access, {
    ...(request.path ? { path: request.path } : {}),
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden,
  });
  onProgress?.({
    phase: "source-generation",
    completed: sourceGeneration.files.paths.length,
    total: sourceGeneration.files.paths.length,
    detail: `generation ${sourceGeneration.inventoryHash}; admitted ${String(sourceGeneration.documents.length)}, unavailable ${String(sourceGeneration.filesUnavailable)}`,
  });
  const files = sourceGeneration.files;
  const result: AnalysisResultSet = {
    kind: "concept",
    unit: "evidence-items",
    items: [],
    partial: sourceGeneration.partial,
    reasons: [...sourceGeneration.reasons],
    redact: input.redact ?? false,
  };
  const documents: { document: SourceDocument; next: number }[] = [];
  for (const document of sourceGeneration.documents) documents.push({ document, next: 0 });
  const passages: Passage[] = [];
  while (documents.some((item) => item.next < item.document.text.length)) {
    for (const item of documents) {
      if (item.next >= item.document.text.length) continue;
      const chunk = passage(item.document, item.next);
      passages.push(chunk.value);
      item.next = chunk.next;
    }
  }
  onProgress?.({ phase: "passage-queue", completed: passages.length, total: passages.length });
  const filesAdmitted = documents.length;
  const filesSkippedEmpty = sourceGeneration.filesSkippedEmpty;
  const filesUnavailable = sourceGeneration.filesUnavailable;
  if (files.paths.length > MAX_CONCEPT_FILES_WARN) {
    result.reasons.push(
      `Concept enumerated ${String(files.paths.length)} files; narrow path or glob for faster interactive retrieval`,
    );
  }
  result.counts = {
    filesEnumerated: files.paths.length,
    filesAdmitted,
    filesSkippedEmpty,
    filesUnavailable,
    passagesQueued: passages.length,
  };
  if (passages.length) {
    const inferred = await infer(query, passages, access.signal, onProgress);
    result.reasons.push(...inferred.warnings);
    result.items = passages
      .map((item, index) => {
        const similarity = inferred.scores[index];
        if (similarity === undefined) throw new Error("Missing concept similarity");
        const evidence = rangeEvidence(item.document, item.range);
        return {
          path: item.document.path,
          line: item.document.lineAt(item.range.start),
          source: item.document.reference,
          range: item.range,
          label: `Concept candidate (cosine ${similarity.toFixed(4)})`,
          excerpt: evidence.excerpt,
          details: {
            kind: "concept-candidate",
            certainty: "candidate",
            score: similarity,
            rankingReason:
              "local multilingual E5 cosine similarity; relevance candidate, no binding or execution claim",
            model: CONCEPT_MODEL,
            revision: CONCEPT_REVISION,
            tokenTruncated: false,
            excerptRange: evidence.excerptRange,
            excerptTruncated: evidence.excerptTruncated,
          },
        };
      })
      .toSorted(
        (a, b) =>
          b.details.score - a.details.score || a.path.localeCompare(b.path) || a.line - b.line,
      );
    result.stats = {
      inferencePeakRssBytes: inferred.peakRssBytes,
      passagesRanked: passages.length,
      conceptWindowsRanked: inferred.windowsRanked,
      conceptCacheHits: inferred.cacheHits,
      conceptCacheMisses: inferred.cacheMisses,
      conceptCacheMaxBytes: inferred.cacheMaxBytes,
      ...(inferred.cacheBytes === undefined ? {} : { conceptCacheBytes: inferred.cacheBytes }),
      scoreProfile: scoreProfile(inferred.scores),
    };
  }
  result.filesRead = access.filesRead;
  result.bytesRead = access.bytesRead;
  result.stats = {
    ...result.stats,
    elapsedMs: Math.round(performance.now() - started),
    filesEnumerated: files.paths.length,
    filesAdmitted,
  };
  result.coverage = {
    conceptCandidates: result.partial ? "partial" : "complete",
    admissionPlan: result.partial ? "partial" : "complete",
    compilerBindings: "not-applicable",
  };
  result.scope = {
    path: request.path ?? ".",
    requestedPath: request.path ?? ".",
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden,
    expandedToProjectRoot: false,
    assertion: request.path && request.path !== "." ? "requested-scope" : "project-wide",
  };
  await verifyConceptSourceGeneration(sourceGeneration, access);
  result.sourceGeneration = conceptSourceSummary(sourceGeneration);
  return { analysis: result, sourceGeneration };
}

export function conceptSearch(
  input: SignalGrepInput,
  access: SourceAccess,
  onProgress?: (progress: OperationProgress) => void,
): Promise<ConceptSearchExecution> {
  return runConceptSearchQueued(input, access, similarities, onProgress);
}

export type ConceptSearchRunner = typeof conceptSearch;

async function runConceptSearchQueued(
  input: SignalGrepInput,
  access: SourceAccess,
  infer: ConceptInferenceRunner,
  onProgress?: (progress: OperationProgress) => void,
): Promise<ConceptSearchExecution> {
  return inferenceQueue
    .run(() => runConceptSearch(input, access, infer, onProgress), access.signal)
    .catch((error: unknown) => {
      if (access.signal?.aborted) throw abortError();
      throw error;
    });
}

export function createConceptSearchRunner(infer: ConceptInferenceRunner): ConceptSearchRunner {
  return (input, access, onProgress) => runConceptSearchQueued(input, access, infer, onProgress);
}
