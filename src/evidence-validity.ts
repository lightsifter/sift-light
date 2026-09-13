import type {
  EvidenceCoverageStatus,
  EvidenceRecheck,
  EvidenceSourceStatus,
  EvidenceValidity,
} from "./validation-types.js";

/**
 * Combine independent source checks without making missing evidence look current.
 * Stale evidence has the highest user-visible priority, while unknown is retained
 * whenever any dependency could not be verified.
 */
export function aggregateEvidenceValidity(
  sources: readonly EvidenceSourceStatus[],
): EvidenceValidity {
  if (sources.some((source) => source.status === "stale")) return "stale";
  if (sources.length === 0 || sources.some((source) => source.status === "unknown"))
    return "unknown";
  return "current";
}

export function evidenceRecheck(
  sources: readonly EvidenceSourceStatus[],
  reasons: readonly string[] = [],
  coverage: EvidenceCoverageStatus = sources.length > 0 ? "complete" : "not-applicable",
): EvidenceRecheck {
  return {
    validity: aggregateEvidenceValidity(sources),
    coverage,
    sources: [...sources],
    reasons: [...new Set(reasons)],
  };
}
