import { isRecordValue } from "./record-value.js";
import { SiftLightError } from "./errors.js";
import type { OperationProgress } from "./operation-lifecycle.js";

export interface ConceptInferenceResult {
  scores: number[];
  cacheHits: number;
  cacheMisses: number;
  cacheMaxBytes: number;
  cacheBytes?: number;
  windowsRanked: number;
  warnings: string[];
  peakRssBytes: number;
  modelLoads?: number;
  modelReused?: boolean;
}

export class ConceptWorkerExitError extends SiftLightError {
  readonly exitCode: number | null;
  constructor(exitCode: number | null, diagnostic: string) {
    super(`Local concept worker exited unexpectedly (${String(exitCode)}): ${diagnostic}`);
    this.name = "ConceptWorkerExitError";
    this.exitCode = exitCode;
  }
}

export function parseConceptResult(value: unknown, passageCount: number): ConceptInferenceResult {
  if (
    !isRecordValue(value) ||
    !Array.isArray(value.scores) ||
    value.scores.length !== passageCount ||
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
    value.windowsRanked < passageCount ||
    !Array.isArray(value.warnings) ||
    value.warnings.some((warning) => typeof warning !== "string") ||
    typeof value.peakRssBytes !== "number" ||
    !Number.isFinite(value.peakRssBytes) ||
    value.peakRssBytes < 0
  )
    throw new SiftLightError("Invalid concept inference response");
  return {
    scores: value.scores.filter((score): score is number => typeof score === "number"),
    cacheHits: value.cacheHits,
    cacheMisses: value.cacheMisses,
    cacheMaxBytes: value.cacheMaxBytes,
    ...(typeof value.cacheBytes === "number" ? { cacheBytes: value.cacheBytes } : {}),
    windowsRanked: value.windowsRanked,
    warnings: value.warnings.filter((warning): warning is string => typeof warning === "string"),
    peakRssBytes: value.peakRssBytes,
    ...(typeof value.modelLoads === "number" ? { modelLoads: value.modelLoads } : {}),
    ...(typeof value.modelReused === "boolean" ? { modelReused: value.modelReused } : {}),
  };
}

export function parseConceptProgress(value: Record<string, unknown>): OperationProgress {
  if (
    typeof value.phase !== "string" ||
    value.phase.length > 128 ||
    [value.completed, value.total].some(
      (count) =>
        count !== undefined &&
        (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0),
    )
  )
    throw new SiftLightError("Invalid concept worker progress response");
  return {
    phase: value.phase,
    ...(typeof value.completed === "number" ? { completed: value.completed } : {}),
    ...(typeof value.total === "number" ? { total: value.total } : {}),
  };
}
