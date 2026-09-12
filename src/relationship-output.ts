import { createHash } from "node:crypto";
import type { AnalysisItem, AnalysisDetails } from "./analysis-types.js";
import type { SignalGrepInput } from "./service.js";
import type { SignalGrepDetails, SignalGrepResult } from "./types.js";
import type {
  RelationshipEdge,
  RelationshipDependency,
  RelationshipPublicDetails,
  RelationshipRecheck,
  RelationshipSourceStatus,
  RelationshipSourceScope,
  RelationshipComparisonTarget,
} from "./relationship-types.js";
import type { RelationshipChangeHint } from "./change-awareness.js";
import type { RelationshipWatchHealth } from "./change-awareness.js";
import type { RelationshipPage, StoredRelationshipResult } from "./relationship-store.js";

function sourceItem(status: RelationshipSourceStatus, index: number): AnalysisItem {
  return {
    path: status.path,
    line: index + 1,
    label: `${status.role} source ${status.status}`,
    details: {
      role: status.role,
      status: status.status,
      ...(status.reason ? { reason: status.reason } : {}),
      index,
    },
  };
}

function publicSourceStatus(status: RelationshipSourceStatus): RelationshipSourceStatus {
  const reference = status.current ?? status.expected;
  const actualTarget =
    status.actualTarget ??
    (reference === undefined
      ? undefined
      : reference.origin.kind === "git"
        ? "recorded-git"
        : "current-worktree");
  return {
    path: status.path,
    role: status.role,
    status: status.status,
    ...(actualTarget ? { actualTarget } : {}),
    ...(status.reason ? { reason: status.reason } : {}),
  };
}

function sourceStatusRank(status: RelationshipSourceStatus["status"]): number {
  return status === "stale" ? 0 : status === "unknown" ? 1 : 2;
}

function dependencyKey(dependency: RelationshipDependency): string {
  return JSON.stringify([
    dependency.path,
    dependency.role,
    dependency.fingerprint ?? null,
    dependency.exists ?? null,
    dependency.reason ?? null,
  ]);
}

function publicEdgeKey(edge: RelationshipEdge): string {
  return createHash("sha256").update(edge.edgeKey).digest("hex").slice(0, 20);
}

function publicNodeKey(node: RelationshipEdge["from"]): string {
  return createHash("sha256").update(JSON.stringify(node.identity)).digest("hex").slice(0, 20);
}

function displayName(value: string): { value: string; truncated: boolean } {
  const limit = 96;
  if (value.length <= limit) return { value, truncated: false };
  return { value: `${value.slice(0, limit - 1)}…`, truncated: true };
}

function dependencyTable(edges: readonly RelationshipEdge[]): {
  table: NonNullable<RelationshipPublicDetails["dependencyTable"]>;
  ids: Map<string, number>;
} {
  const ids = new Map<string, number>();
  const table: Array<NonNullable<RelationshipPublicDetails["dependencyTable"]>[number]> = [];
  for (const dependency of edges
    .flatMap((edge) => edge.dependencies)
    .filter((item) => item.role !== "source")) {
    const key = dependencyKey(dependency);
    if (ids.has(key)) continue;
    const id = table.length;
    ids.set(key, id);
    table.push({
      id,
      path: dependency.path,
      role: dependency.role,
      ...(dependency.fingerprint ? { fingerprint: dependency.fingerprint } : {}),
      ...(dependency.exists === undefined ? {} : { exists: dependency.exists }),
      ...(dependency.reason ? { reason: dependency.reason } : {}),
    });
  }
  return { table, ids };
}

function evidenceKey(evidence: RelationshipEdge["evidence"][number]): string {
  return JSON.stringify([
    evidence.reason,
    evidence.level,
    evidence.basis,
    evidence.providerBasis ?? null,
  ]);
}

function evidenceTable(edges: readonly RelationshipEdge[]): {
  table: NonNullable<RelationshipPublicDetails["evidenceTable"]>;
  ids: Map<string, number>;
} {
  const ids = new Map<string, number>();
  const table: Array<NonNullable<RelationshipPublicDetails["evidenceTable"]>[number]> = [];
  for (const evidence of edges.flatMap((edge) => edge.evidence)) {
    const key = evidenceKey(evidence);
    if (ids.has(key)) continue;
    const id = table.length;
    ids.set(key, id);
    table.push({
      id,
      reason: evidence.reason,
      level: evidence.level,
      basis: evidence.basis,
      ...(evidence.providerBasis ? { providerBasis: evidence.providerBasis } : {}),
    });
  }
  return { table, ids };
}

function edgeItem(
  edge: RelationshipEdge,
  index: number,
  dependencyIds: ReadonlyMap<string, number>,
  evidenceIds: ReadonlyMap<string, number>,
): AnalysisItem & { index: number } {
  const nodeSummary = (node: RelationshipEdge["from"]) => ({
    key: publicNodeKey(node),
    name: displayName(node.name).value,
    ...(displayName(node.name).truncated ? { nameTruncated: true } : {}),
  });
  const fromName = displayName(edge.from.name);
  const toName = displayName(edge.to.name);
  return {
    path: edge.to.path,
    line: edge.to.start.line,
    label: `${edge.operation}: ${fromName.value} → ${toName.value}`,
    range: edge.to.range,
    index,
    details: {
      edgeKey: publicEdgeKey(edge),
      operation: edge.operation,
      from: nodeSummary(edge.from),
      to: nodeSummary(edge.to),
      ...(edge.callSite
        ? {
            callSite: {
              path: edge.callSite.path,
              line: edge.callSite.start.line,
            },
          }
        : {}),
      evidence: edge.evidence.map((evidence) => evidenceIds.get(evidenceKey(evidence)) ?? -1),
      confidence: edge.confidence,
      dependencies: edge.dependencies
        .filter((dependency) => dependency.role !== "source")
        .map((dependency) => dependencyIds.get(dependencyKey(dependency)) ?? -1),
      index,
    },
  };
}

function publicDetails(
  scope: RelationshipSourceScope,
  sources: readonly RelationshipSourceStatus[],
  values: Partial<RelationshipPublicDetails> &
    Pick<RelationshipPublicDetails, "freshness" | "coverage" | "truncation" | "comparisonTarget">,
): RelationshipPublicDetails {
  const ordered = [...sources].toSorted((left, right) => {
    return (
      sourceStatusRank(left.status) - sourceStatusRank(right.status) ||
      left.path.localeCompare(right.path)
    );
  });
  const visible: RelationshipSourceStatus[] = [];
  let sourceBytes = 0;
  for (const source of ordered) {
    const compact = publicSourceStatus(source);
    const rowBytes = Buffer.byteLength(JSON.stringify(compact));
    if (visible.length > 0 && sourceBytes + rowBytes > 4_096) break;
    visible.push(compact);
    sourceBytes += rowBytes;
  }
  const omitted = sources.length - visible.length;
  return {
    scope,
    checked: visible.filter((source) => source.status !== "unknown"),
    unchecked: visible.filter((source) => source.status === "unknown"),
    ...(omitted > 0 ? { sourceOmitted: omitted } : {}),
    ...values,
  };
}

function publicChangeHints(
  hints: readonly RelationshipChangeHint[],
): RelationshipPublicDetails["changeHints"] {
  if (hints.length === 0) return undefined;
  return hints
    .toSorted((left, right) => left.observedAt - right.observedAt)
    .slice(-32)
    .map((hint) => {
      const value: NonNullable<RelationshipPublicDetails["changeHints"]>[number] = {
        path: hint.path,
        role: hint.role,
        observedAt: hint.observedAt,
      };
      if (hint.reason) value.reason = hint.reason;
      return value;
    });
}

function changeHintText(hints: readonly RelationshipChangeHint[]): string {
  if (hints.length === 0) return "";
  const visible = hints
    .slice(-4)
    .map((hint) => `${hint.role} ${displayName(hint.path).value}`)
    .join(", ");
  const suffix = hints.length > 4 ? `; ${String(hints.length - 4)} more retained` : "";
  return ` Change hints: ${visible}${suffix}.`;
}

function watchHealthText(health: RelationshipWatchHealth | undefined): string {
  if (!health) return "";
  const reasons = health.reasons.length ? ` ${health.reasons.slice(0, 2).join(" ")}` : "";
  return ` Watch health: ${health.status}; ${String(health.retainedHints)} hint(s) retained, ${String(health.droppedHints)} dropped.${reasons}`;
}

function base(
  mode: "trace" | "validate",
  status: "complete" | "partial",
  total: number,
  files: number,
  returned = total,
): SignalGrepDetails {
  return {
    version: 1,
    mode,
    status,
    totalMatches: total,
    storedMatches: total,
    totalFiles: files,
    returnedMatches: returned,
    snapshotComplete: status === "complete",
  };
}

export function traceResult(
  stored: StoredRelationshipResult,
  page: RelationshipPage,
  scope: RelationshipSourceScope,
  input: SignalGrepInput,
  changeHints: readonly RelationshipChangeHint[] = [],
  watchHealth?: RelationshipWatchHealth,
): SignalGrepResult {
  const state = stored.state;
  const paths = new Set(state.edges.flatMap((edge) => [edge.from.path, edge.to.path]));
  const dependencies = dependencyTable(state.edges);
  const evidence = evidenceTable(state.edges);
  const hints = publicChangeHints(changeHints);
  const relationship = publicDetails(scope, state.coverage.sources, {
    operation: state.operation,
    ...(state.nodes[0]
      ? {
          providerId: state.nodes[0].identity.providerId,
          analysisViewId: state.nodes[0].identity.analysisViewId,
        }
      : {}),
    freshness: state.coverage.freshness,
    coverage: state.coverage.status,
    comparisonTarget: "current-worktree",
    truncation: { truncated: state.truncated, reasons: state.reasons },
    depth: state.budget.maxDepth,
    depthReached: state.depthReached,
    expansions: state.expansions,
    dependencyTable: dependencies.table,
    evidenceTable: evidence.table,
    ...(hints ? { changeHints: hints } : {}),
    ...(watchHealth ? { watchHealth } : {}),
  });
  const status =
    state.status === "complete" && state.coverage.freshness === "current" ? "complete" : "partial";
  const details = base("trace", status, page.totalItems, paths.size, page.items.length);
  const analysis: AnalysisDetails = {
    kind: "trace",
    unit: "relationships",
    totalItems: page.totalItems,
    returnedItems: page.items.length,
    items: page.items.map((edge, index) =>
      edgeItem(edge, page.offset + index + 1, dependencies.ids, evidence.ids),
    ),
    reasons: [...state.reasons],
    relationship,
  };
  const pageRequest = page.nextCursor
    ? { mode: "trace" as const, cursor: page.nextCursor }
    : undefined;
  const exploreRequest = stored.exploreCursor
    ? { mode: "trace" as const, exploreCursor: stored.exploreCursor }
    : undefined;
  // Finish immutable page pagination before offering a fresh exploration. On
  // a multi-page snapshot the exploration request remains in its own field so
  // following nextRequest can never replay earlier edges.
  const nextRequest =
    pageRequest ?? (page.totalItems <= page.items.length ? exploreRequest : undefined);
  const visibleSources = [...relationship.checked, ...relationship.unchecked];
  const sourceText = visibleSources.length
    ? ` Sources: ${visibleSources.map((source) => `${source.status} ${source.path}`).join(", ")}${relationship.sourceOmitted ? `; ${String(relationship.sourceOmitted)} source(s) omitted from this page` : ""}.`
    : " Sources: none recorded (freshness is unknown until evidence is checked).";
  const edgeText = page.items.length
    ? ` Edges: ${page.items.map((edge, index) => `${String(page.offset + index + 1)}. ${displayName(edge.from.name).value} → ${displayName(edge.to.name).value} (${edge.to.path}:${String(edge.to.start.line)})`).join("; ")}.`
    : " Edges: none retained on this page.";
  const reasonText = state.reasons.length ? ` ${state.reasons.join(" ")}` : "";
  const requestText = nextRequest
    ? ` Next request: ${JSON.stringify(nextRequest)}`
    : exploreRequest
      ? ` Explore request: ${JSON.stringify(exploreRequest)}`
      : "";
  const text = `Static ${state.operation} trace retained ${String(page.totalItems)} relationship(s); returned ${String(page.items.length)} on this page; depth ${String(state.depthReached)}/${String(state.budget.maxDepth)}.${edgeText}${sourceText}${reasonText}${changeHintText(changeHints)}${watchHealthText(watchHealth)}${requestText}`;
  return {
    text,
    details: {
      ...details,
      cursor: stored.cursor,
      ...(nextRequest ? { nextRequest } : {}),
      ...(exploreRequest ? { exploreRequest } : {}),
      analysis,
      relationship,
      ...(stored.exploreCursor ? { exploreCursor: stored.exploreCursor } : {}),
    },
  };
}

export function validationResult(
  state: {
    coverage: {
      sources: readonly RelationshipSourceStatus[];
      status?: RelationshipPublicDetails["coverage"];
    };
    scope: RelationshipSourceScope;
    status?: "complete" | "partial";
    truncated?: boolean;
    reasons?: readonly string[];
    edges?: readonly RelationshipEdge[];
  },
  cursor: string,
  recheck: RelationshipRecheck,
  checkInterval: { start: number; end: number; selected?: number },
  comparisonTarget: RelationshipComparisonTarget,
  changeHints: readonly RelationshipChangeHint[] = [],
  watchHealth?: RelationshipWatchHealth,
): SignalGrepResult {
  const status =
    state.status === "partial" || recheck.validity !== "current" ? "partial" : "complete";
  const coverage =
    state.coverage.status === "partial" || recheck.coverage === "partial"
      ? "partial"
      : recheck.coverage;
  const reasons = [...new Set([...(state.reasons ?? []), ...recheck.reasons])];
  const hints = publicChangeHints(changeHints);
  const relationship = publicDetails(state.scope, recheck.sources, {
    comparisonTarget,
    freshness: recheck.validity,
    coverage,
    truncation: { truncated: state.truncated ?? false, reasons },
    affectedNodeKeys: recheck.affectedNodeKeys,
    affectedEdgeKeys: (state.edges ?? [])
      .filter((edge) => recheck.affectedEdgeKeys.includes(edge.edgeKey))
      .map(publicEdgeKey),
    checkInterval,
    ...(hints ? { changeHints: hints } : {}),
    ...(watchHealth ? { watchHealth } : {}),
  });
  const analysis: AnalysisDetails = {
    kind: "validate",
    unit: "evidence-items",
    totalItems: recheck.sources.length,
    returnedItems: relationship.checked.length + relationship.unchecked.length,
    items: [...relationship.checked, ...relationship.unchecked].map((source, index) =>
      Object.assign(sourceItem(source, index), { index }),
    ),
    reasons,
    relationship,
  };
  const details = {
    ...base(
      "validate",
      status,
      relationship.checked.length + relationship.unchecked.length,
      new Set(recheck.sources.map((source) => source.path)).size,
      recheck.sources.length,
    ),
    cursor,
    analysis,
    relationship,
  } as SignalGrepDetails;
  return {
    text: `Relationship validation is ${recheck.validity}; checked ${String(relationship.checked.length)} source(s), ${String(relationship.unchecked.length)} require attention; coverage ${coverage}; target ${comparisonTarget}; check interval ${String(checkInterval.start)}-${String(checkInterval.end)}.${relationship.sourceOmitted ? ` ${String(relationship.sourceOmitted)} source(s) omitted from this page.` : ""}${reasons.length ? ` ${reasons.join(" ")}` : ""}${changeHintText(changeHints)}${watchHealthText(watchHealth)}`,
    details,
  };
}
