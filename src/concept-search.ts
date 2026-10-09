import { acquireConceptWorker, singleConceptInference } from "./concept-worker-client.js";
import type { ConceptInferenceResult } from "./concept-worker-protocol.js";
export { ConceptWorkerExitError } from "./concept-worker-protocol.js";
export type { ConceptInferenceResult } from "./concept-worker-protocol.js";
import {
  QueryLexicalIndex,
  passageIdentity,
  rankRelevance,
  distinctPassages,
} from "./relevance-ranking.js";
import { rangeEvidence, sourceEvidence } from "./analysis-evidence.js";
import { OwnedTaskQueue } from "./owned-task-queue.js";
const inferenceQueue = new OwnedTaskQueue();
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { AnalysisResultSet, ConceptScoreProfile } from "./analysis-types.js";
import {
  CONCEPT_MODEL,
  CONCEPT_PASSAGE_OVERLAP_CHARS,
  CONCEPT_REVISION,
  MAX_CONCEPT_CHARS,
} from "./concept-model.js";
import { abortError, SiftLightError } from "./errors.js";
import { normalizeRequest } from "./request.js";
import type { SiftLightInput } from "./service.js";
import { syntaxLanguage } from "./syntax.js";
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

/** E5 cosine scores favor very short, generic passages in close races. Keep the
 * raw cosine as evidence and apply a bounded length correction only to rank. */
export function conceptRankingScore(cosine: number, passageLength: number): number {
  const referenceLength = 500;
  const maximumCorrection = 0.02;
  return cosine - maximumCorrection * (1 - Math.sqrt(Math.min(passageLength / referenceLength, 1)));
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

export function validateConceptQuery(query: string | undefined): string {
  if (!query?.trim() || query.length > 256 || !query.isWellFormed() || /[\r\n\0]/.test(query))
    throw new SiftLightError(
      "Concept query requires nonempty, single-line well-formed text of at most 256 characters",
    );
  return query;
}

async function runConceptSearch(
  input: SiftLightInput,
  access: SourceAccess,
  infer: ConceptInferenceRunner,
  onProgress?: (progress: OperationProgress) => void,
  options: ConceptSearchOptions = {},
): Promise<ConceptSearchExecution> {
  const query = validateConceptQuery(input.query);
  const lexical = input.ranking === "relevance" ? new QueryLexicalIndex(query) : undefined;
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
  let conceptModelLoads = 0;
  let conceptModelReused = false;
  let conceptCacheMisses = 0;
  let conceptCacheMaxBytes = 0;
  let conceptCacheBytes: number | undefined;
  let inferencePeakRssBytes = 0;
  let retentionTruncated = false;
  let declarationPartial = false;
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
    const declarationRanges = new Map<SourceDocument, ByteRange[]>();
    if (lexical?.identifier) {
      for (const { document } of documents) {
        if (!syntaxLanguage(document.path) || !document.text.includes(lexical.identifier)) continue;
        // oxlint-disable-next-line no-await-in-loop -- The existing parser owner serializes bounded candidate documents.
        const syntax = await batchAccess.syntax(document);
        if (syntax.status !== "ok") {
          declarationPartial = true;
          result.partial = true;
          result.reasons.push(
            `Identifier declaration ranking unavailable for ${document.path}: ${syntax.status}; BM25 and semantic ranking remain available`,
          );
        } else {
          declarationRanges.set(
            document,
            syntax.roles
              .filter(
                (role) =>
                  role.role === "declaration" &&
                  role.certainty === "syntax" &&
                  document.text.slice(role.start, role.end) === lexical.identifier,
              )
              .map((role) => ({
                start: document.toByteOffset(role.start),
                end: document.toByteOffset(role.end),
              })),
          );
        }
        batchAccess.releaseSyntax(document);
      }
    }
    for (const item of passages)
      lexical?.add(
        passageIdentity({
          path: item.document.path,
          range: item.range,
          line: item.document.lineAt(item.range.start),
        }),
        item.text,
        declarationRanges
          .get(item.document)
          ?.some((range) => range.start >= item.range.start && range.end <= item.range.end) ??
          false,
      );
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
    conceptModelLoads = Math.max(conceptModelLoads, inferred.modelLoads ?? 0);
    conceptModelReused ||= inferred.modelReused ?? false;
    conceptCacheMisses += inferred.cacheMisses;
    conceptCacheMaxBytes = Math.max(conceptCacheMaxBytes, inferred.cacheMaxBytes);
    conceptCacheBytes = inferred.cacheBytes ?? conceptCacheBytes;
    inferencePeakRssBytes = Math.max(inferencePeakRssBytes, inferred.peakRssBytes);
    const batchItems = passages.map((item, index) => {
      const similarity = inferred.scores[index];
      if (similarity === undefined) throw new Error("Missing concept similarity");
      const rankingScore = conceptRankingScore(similarity, item.text.length);
      const declaration = declarationRanges
        .get(item.document)
        ?.find((range) => range.start >= item.range.start && range.end <= item.range.end);
      const evidence = declaration
        ? sourceEvidence(item.document, declaration)
        : rangeEvidence(item.document, item.range);
      return {
        path: item.document.path,
        line: item.document.lineAt(declaration?.start ?? item.range.start),
        source: item.document.reference,
        range: item.range,
        label: `Concept candidate (cosine ${similarity.toFixed(4)})`,
        excerpt: evidence.excerpt,
        details: {
          kind: "concept-candidate",
          certainty: "candidate",
          score: similarity,
          rankingScore,
          rankingReason:
            "local multilingual E5 cosine similarity with bounded short-passage rank correction; relevance candidate, no binding or execution claim",
          model: CONCEPT_MODEL,
          revision: CONCEPT_REVISION,
          tokenTruncated: false,
          ...(declaration ? { identifierOffset: declaration.start } : {}),
          excerptRange: evidence.excerptRange,
          excerptTruncated: evidence.excerptTruncated,
        },
      } satisfies AnalysisResultSet["items"][number];
    });
    const ranked = lexical
      ? [...result.items, ...batchItems]
      : [...result.items, ...batchItems].toSorted(
          (a, b) =>
            Number(b.details?.rankingScore) - Number(a.details?.rankingScore) ||
            a.path.localeCompare(b.path) ||
            a.line - b.line,
        );
    if (ranked.length > MAX_ANALYSIS_RESULTS) retentionTruncated = true;
    result.items = ranked.slice(0, MAX_ANALYSIS_RESULTS);
  }
  if (lexical) {
    result.kind = "hybrid";
    result.items = distinctPassages(
      rankRelevance(result.items, lexical.scores(), lexical.declarationKeys()),
    );
    result.reasons.push(
      "Relevance strategy: BM25 + semantic rank fusion over admitted passages; not an exhaustive literal occurrence list.",
    );
  }
  if (retentionTruncated) {
    result.partial = true;
    result.reasons.push(
      `Concept candidate budget retained ${String(MAX_ANALYSIS_RESULTS)} candidates from ${String(passagesQueued)} passages; ranking coverage is partial`,
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
    ...(lexical ? { relevanceRanking: 1 } : {}),
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
      conceptModelLoads,
      conceptModelReused,
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
    identifierDeclarations: lexical?.identifier
      ? declarationPartial
        ? "partial"
        : "policy-filtered"
      : "not-applicable",
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
  input: SiftLightInput,
  access: SourceAccess,
  onProgress?: (progress: OperationProgress) => void,
  options?: ConceptSearchOptions,
): Promise<ConceptSearchExecution> {
  return runConceptSearchQueued(input, access, singleConceptInference, onProgress, options);
}

export type ConceptSearchRunner = typeof conceptSearch;

async function runConceptSearchQueued(
  input: SiftLightInput,
  access: SourceAccess,
  infer: ConceptInferenceRunner,
  onProgress?: (progress: OperationProgress) => void,
  options?: ConceptSearchOptions,
): Promise<ConceptSearchExecution> {
  const queuedAt = performance.now();
  return inferenceQueue
    .run(async () => {
      const conceptQueueWaitMs = Math.round(performance.now() - queuedAt);
      const execution = await runConceptSearch(input, access, infer, onProgress, options);
      execution.analysis.stats = { ...execution.analysis.stats, conceptQueueWaitMs };
      return execution;
    }, access.signal)
    .catch((error: unknown) => {
      if (access.signal?.aborted) throw abortError();
      throw error;
    });
}

export function createConceptSearchRunner(infer: ConceptInferenceRunner): ConceptSearchRunner {
  return (input, access, onProgress, options) =>
    runConceptSearchQueued(input, access, infer, onProgress, options);
}

/** One shared process across service owners; idle expiry and final owner shutdown release it. */
export function createManagedConceptSearch(): {
  search: ConceptSearchRunner;
  close: () => Promise<void>;
} {
  const worker = acquireConceptWorker();
  return { search: createConceptSearchRunner(worker.infer), close: worker.close };
}
