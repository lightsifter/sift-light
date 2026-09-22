import { rangeEvidence } from "./analysis-evidence.js";
import { OwnedTaskQueue } from "./owned-task-queue.js";
const inferenceQueue = new OwnedTaskQueue();
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StringDecoder } from "node:string_decoder";
import { mkdir } from "node:fs/promises";
import { rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import type { AnalysisResultSet, ConceptScoreProfile } from "./analysis-types.js";
import {
  CONCEPT_MODEL,
  CONCEPT_PASSAGE_OVERLAP_CHARS,
  CONCEPT_REVISION,
  MAX_CONCEPT_CHARS,
  MAX_CONCEPT_WORKER_OUTPUT_BYTES,
  conceptCacheDirectory,
} from "./concept-model.js";
import { abortError, ConceptUnavailableError, SiftlightError } from "./errors.js";
import { runOwnedProcess } from "./owned-process.js";
import { scriptRuntimeEnvironment } from "./script-runtime.js";
import { isRecordValue } from "./record-value.js";
import { normalizeRequest } from "./request.js";
import type { SiftlightInput } from "./service.js";
import { SourceAccess } from "./source-access.js";
import type { SourceDocument, ByteRange } from "./source-document.js";
import {
  createConceptSourceGeneration,
  conceptSourceSummary,
  verifyConceptSourceGeneration,
  type ConceptSourceGeneration,
} from "./concept-source-generation.js";
import type { OperationProgress } from "./operation-lifecycle.js";
import { MAX_ANALYSIS_RESULTS, MAX_STRUCTURE_FILES } from "./analysis-limits.js";
import { listWorkspaceFiles } from "./workspace-files.js";

export interface Passage {
  document: SourceDocument;
  range: ByteRange;
  text: string;
}

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
export class ConceptWorkerExitError extends SiftlightError {
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

export interface ConceptSearchOptions {
  retainPaths?: ReadonlySet<string> | PromiseLike<ReadonlySet<string>>;
  verifySourceGeneration?: boolean;
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
  const env = scriptRuntimeEnvironment();
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
        env: { ...env, SIFTLIGHT_CONCEPT_CACHE_STAGING_DIR: stagingRoot },
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
            throw new SiftlightError("Concept worker exceeded its 4 MiB response budget");
          lineBuffer += decoder.write(Buffer.from(chunk));
          let newline = lineBuffer.indexOf("\n");
          while (newline >= 0) {
            const line = lineBuffer.slice(0, newline).trim();
            lineBuffer = lineBuffer.slice(newline + 1);
            newline = lineBuffer.indexOf("\n");
            if (!line) continue;
            const parsed: unknown = JSON.parse(line);
            if (!isRecordValue(parsed) || typeof parsed.type !== "string")
              throw new SiftlightError("Invalid concept worker progress response");
            if (parsed.type === "progress") {
              if (sawFinal)
                throw new SiftlightError("Concept worker emitted progress after its result");
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
                throw new SiftlightError("Invalid concept worker progress response");
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
              if (sawFinal) throw new SiftlightError("Concept worker emitted more than one result");
              sawFinal = true;
              finalValue = parsed;
            } else {
              throw new SiftlightError("Invalid concept worker response type");
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
      if (!isRecordValue(parsed) || parsed.type !== "result")
        throw new SiftlightError("Concept worker did not return a result record");
      if (sawFinal) throw new SiftlightError("Concept worker emitted more than one result");
      finalValue = parsed;
      sawFinal = true;
    }
    const value: unknown = finalValue;
    if (
      !isRecordValue(value) ||
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
      throw new SiftlightError("Invalid concept inference response");
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
    throw new SiftlightError(
      "Concept query requires nonempty, single-line well-formed text of at most 256 characters",
    );
  return query;
}

async function runConceptSearch(
  input: SiftlightInput,
  access: SourceAccess,
  infer: ConceptInferenceRunner,
  onProgress?: (progress: OperationProgress) => void,
  options: ConceptSearchOptions = {},
): Promise<ConceptSearchExecution> {
  const query = validateConceptQuery(input.query);
  const retainPaths =
    options.retainPaths === undefined ? undefined : Promise.resolve(options.retainPaths);
  const started = performance.now();
  const request = normalizeRequest({ ...input, pattern: "" });
  const filters = {
    ...(request.path ? { path: request.path } : {}),
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden,
  };
  const files = await listWorkspaceFiles(access.cwd, access.signal, {
    ...filters,
    maxFiles: access.maxFiles,
  });
  const fileBatches = Array.from(
    { length: Math.ceil(files.paths.length / MAX_STRUCTURE_FILES) },
    (_, index) => files.paths.slice(index * MAX_STRUCTURE_FILES, (index + 1) * MAX_STRUCTURE_FILES),
  );
  const result: AnalysisResultSet = {
    kind: "concept",
    unit: "evidence-items",
    items: [],
    partial: files.partial,
    reasons: [...files.reasons],
    redact: input.redact ?? false,
  };
  const inventory: ConceptSourceGeneration["inventory"][number][] = [];
  const retainedDocuments: SourceDocument[] = [];
  const sourceReasons = [...files.reasons];
  let sourcePartial = files.partial;
  const allScores: number[] = [];
  let filesAdmitted = 0;
  let filesSkippedEmpty = 0;
  let filesSkippedBinary = 0;
  let filesUnavailable = 0;
  let filesRead = 0;
  let bytesRead = 0;
  let passagesQueued = 0;
  let conceptWindowsRanked = 0;
  let conceptCacheHits = 0;
  let conceptCacheMisses = 0;
  let conceptCacheMaxBytes = 0;
  let conceptCacheBytes: number | undefined;
  let inferencePeakRssBytes = 0;
  let retentionTruncated = false;
  const generationStartedAt = Date.now();
  for (const [batchIndex, paths] of fileBatches.entries()) {
    const batchAccess = access.batch(paths.length);
    // oxlint-disable-next-line no-await-in-loop -- sequential batches bound live source documents and model memory.
    const generation = await createConceptSourceGeneration(batchAccess, filters, {
      paths,
      partial: false,
      reasons: [],
    });
    inventory.push(...generation.inventory);
    filesAdmitted += generation.filesAdmitted;
    filesSkippedEmpty += generation.filesSkippedEmpty;
    filesSkippedBinary += generation.filesSkippedBinary;
    filesUnavailable += generation.filesUnavailable;
    filesRead += batchAccess.filesRead;
    bytesRead += batchAccess.bytesRead;
    sourcePartial ||= generation.partial;
    sourceReasons.push(...generation.reasons);
    result.partial ||= generation.partial;
    result.reasons.push(...generation.reasons);
    onProgress?.({
      phase: "source-generation",
      completed: Math.min((batchIndex + 1) * MAX_STRUCTURE_FILES, files.paths.length),
      total: files.paths.length,
      detail: `batch ${String(batchIndex + 1)} of ${String(fileBatches.length)}; admitted ${String(filesAdmitted)}, unavailable ${String(filesUnavailable)}`,
    });

    const documents = generation.documents.map((document) => ({ document, next: 0 }));
    const passages: Passage[] = [];
    while (documents.some((item) => item.next < item.document.text.length)) {
      for (const item of documents) {
        if (item.next >= item.document.text.length) continue;
        const chunk = passage(item.document, item.next);
        passages.push(chunk.value);
        item.next = chunk.next;
      }
    }
    passagesQueued += passages.length;
    onProgress?.({
      phase: "passage-queue",
      completed: passagesQueued,
      detail: `batch ${String(batchIndex + 1)} of ${String(fileBatches.length)}`,
    });
    if (!passages.length) continue;
    // oxlint-disable-next-line no-await-in-loop -- one owned inference batch runs at a time and feeds one global ranking.
    const inferred = await infer(query, passages, access.signal, onProgress);
    // Literal discovery and this first Concept batch start together. Resolve the literal file set
    // only when this batch is ready to release its documents, then retain matching documents only.
    // oxlint-disable-next-line no-await-in-loop -- every sequential batch reuses the same settled literal path promise.
    const retainedPathSet = retainPaths === undefined ? undefined : await retainPaths;
    for (const document of generation.documents) {
      if (retainedPathSet?.has(resolve(access.cwd, document.path))) {
        retainedDocuments.push(document);
      }
    }
    result.reasons.push(...inferred.warnings);
    allScores.push(...inferred.scores);
    conceptWindowsRanked += inferred.windowsRanked;
    conceptCacheHits += inferred.cacheHits;
    conceptCacheMisses += inferred.cacheMisses;
    conceptCacheMaxBytes = Math.max(conceptCacheMaxBytes, inferred.cacheMaxBytes);
    conceptCacheBytes = inferred.cacheBytes ?? conceptCacheBytes;
    inferencePeakRssBytes = Math.max(inferencePeakRssBytes, inferred.peakRssBytes);
    const batchItems = passages.map((item, index) => {
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
      } satisfies AnalysisResultSet["items"][number];
    });
    const ranked = [...result.items, ...batchItems].toSorted(
      (a, b) =>
        Number(b.details?.score) - Number(a.details?.score) ||
        a.path.localeCompare(b.path) ||
        a.line - b.line,
    );
    if (ranked.length > MAX_ANALYSIS_RESULTS) retentionTruncated = true;
    result.items = ranked.slice(0, MAX_ANALYSIS_RESULTS);
  }
  if (retentionTruncated) {
    result.partial = true;
    result.reasons.push(
      `Concept ranking retained the top ${String(MAX_ANALYSIS_RESULTS)} candidates from ${String(passagesQueued)} passages`,
    );
  }
  const sourceGeneration: ConceptSourceGeneration = {
    cwd: access.cwd,
    filters,
    files,
    inventory,
    documents: retainedDocuments,
    partial: sourcePartial,
    reasons: [...new Set(sourceReasons)],
    filesSkippedEmpty,
    filesSkippedBinary,
    filesUnavailable,
    filesAdmitted,
    batches: fileBatches.length,
    batchFileLimit: MAX_STRUCTURE_FILES,
    fileLimit: access.maxFiles,
    startedAt: generationStartedAt,
    inventoryHash: createHash("sha256")
      .update(JSON.stringify(inventory))
      .digest("hex")
      .slice(0, 32),
  };
  result.counts = {
    filesEnumerated: files.paths.length,
    filesAdmitted,
    filesSkippedEmpty,
    filesSkippedBinary,
    filesUnavailable,
    passagesQueued,
    batchesPlanned: fileBatches.length,
    batchesCompleted: fileBatches.length,
    batchFileLimit: MAX_STRUCTURE_FILES,
  };
  if (allScores.length) {
    result.stats = {
      inferencePeakRssBytes,
      passagesRanked: passagesQueued,
      conceptWindowsRanked,
      conceptCacheHits,
      conceptCacheMisses,
      conceptCacheMaxBytes,
      ...(conceptCacheBytes === undefined ? {} : { conceptCacheBytes }),
      scoreProfile: scoreProfile(allScores),
    };
  }
  result.filesRead = filesRead;
  result.bytesRead = bytesRead;
  result.stats = {
    ...result.stats,
    elapsedMs: Math.round(performance.now() - started),
    filesEnumerated: files.paths.length,
    filesAdmitted,
  };
  result.coverage = {
    conceptCandidates: result.partial ? "partial" : "complete",
    admissionPlan: sourcePartial ? "partial" : "complete",
    retention: retentionTruncated ? "partial" : "complete",
    compilerBindings: "not-applicable",
  };
  result.scope = {
    path: request.path ?? ".",
    requestedPath: request.path ?? ".",
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden,
    ignorePolicy: request.ignorePolicy ?? "respect",
    expandedToProjectRoot: false,
    assertion: request.path && request.path !== "." ? "requested-scope" : "project-wide",
  };
  if (options.verifySourceGeneration !== false) {
    await verifyConceptSourceGeneration(sourceGeneration, access);
  }
  result.sourceGeneration = conceptSourceSummary(sourceGeneration);
  return { analysis: result, sourceGeneration };
}

export function conceptSearch(
  input: SiftlightInput,
  access: SourceAccess,
  onProgress?: (progress: OperationProgress) => void,
  options?: ConceptSearchOptions,
): Promise<ConceptSearchExecution> {
  return runConceptSearchQueued(input, access, similarities, onProgress, options);
}

export type ConceptSearchRunner = typeof conceptSearch;

async function runConceptSearchQueued(
  input: SiftlightInput,
  access: SourceAccess,
  infer: ConceptInferenceRunner,
  onProgress?: (progress: OperationProgress) => void,
  options?: ConceptSearchOptions,
): Promise<ConceptSearchExecution> {
  return inferenceQueue
    .run(() => runConceptSearch(input, access, infer, onProgress, options), access.signal)
    .catch((error: unknown) => {
      if (access.signal?.aborted) throw abortError();
      throw error;
    });
}

export function createConceptSearchRunner(infer: ConceptInferenceRunner): ConceptSearchRunner {
  return (input, access, onProgress, options) =>
    runConceptSearchQueued(input, access, infer, onProgress, options);
}
