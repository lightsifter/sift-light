import type {
  RelationshipCoverage,
  RelationshipCoverageStatus,
  RelationshipRecheck,
  RelationshipSourceStatus,
  RelationshipValidity,
} from "./relationship-types.js";

/**
 * Combine independent source checks without making missing evidence look current.
 * Stale evidence has the highest user-visible priority, while unknown is retained
 * whenever any dependency could not be verified.
 */
export function aggregateRelationshipValidity(
  sources: readonly RelationshipSourceStatus[],
): RelationshipValidity {
  if (sources.some((source) => source.status === "stale")) return "stale";
  if (sources.length === 0 || sources.some((source) => source.status === "unknown"))
    return "unknown";
  return "current";
}

export function relationshipCoverage(
  sources: readonly RelationshipSourceStatus[],
  reasons: readonly string[] = [],
  status: RelationshipCoverageStatus = sources.length > 0 ? "complete" : "not-applicable",
): RelationshipCoverage {
  return {
    status,
    freshness: aggregateRelationshipValidity(sources),
    sources: [...sources],
    reasons: [...new Set(reasons)],
  };
}

export function relationshipRecheck(
  sources: readonly RelationshipSourceStatus[],
  affectedNodeKeys: readonly string[] = [],
  affectedEdgeKeys: readonly string[] = [],
  reasons: readonly string[] = [],
  coverage: RelationshipCoverageStatus = sources.length > 0 ? "complete" : "not-applicable",
): RelationshipRecheck {
  return {
    validity: aggregateRelationshipValidity(sources),
    coverage,
    sources: [...sources],
    affectedNodeKeys: [...new Set(affectedNodeKeys)],
    affectedEdgeKeys: [...new Set(affectedEdgeKeys)],
    reasons: [...new Set(reasons)],
  };
}
