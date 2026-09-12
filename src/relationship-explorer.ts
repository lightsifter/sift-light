import { abortError, SignalGrepError } from "./errors.js";
import { relationshipCoverage, aggregateRelationshipValidity } from "./evidence-validity.js";
import type {
  RelationshipCoverage,
  RelationshipEdge,
  RelationshipExpansion,
  RelationshipNode,
  RelationshipOperation,
  RelationshipProvider,
  RelationshipRecheck,
  RelationshipResolution,
  RelationshipSourceScope,
  RelationshipView,
} from "./relationship-types.js";
import { relationshipEdgeKey, relationshipNodeKey } from "./relationship-types.js";

export interface RelationshipTraceBudget {
  maxDepth: number;
  maxNodes: number;
  maxEdges: number;
  maxExpansions: number;
}

export const DEFAULT_RELATIONSHIP_TRACE_BUDGET: RelationshipTraceBudget = {
  maxDepth: 3,
  maxNodes: 200,
  maxEdges: 400,
  maxExpansions: 200,
};

export const RELATIONSHIP_TRACE_LIMITS = {
  maxDepth: { minimum: 1, maximum: 8 },
  maxNodes: { minimum: 1, maximum: 2_000 },
  maxEdges: { minimum: 1, maximum: 4_000 },
  maxExpansions: { minimum: 1, maximum: 2_000 },
} as const;

export interface RelationshipTraceRequest {
  root?: RelationshipResolution | RelationshipNode;
  operation: RelationshipOperation;
  budget: RelationshipTraceBudget;
  signal?: AbortSignal;
  scope?: RelationshipSourceScope;
}

interface FrontierItem {
  node: RelationshipNode;
  depth: number;
}

export interface RelationshipExplorationState {
  readonly scope: RelationshipSourceScope;
  readonly operation: RelationshipOperation;
  readonly budget: RelationshipTraceBudget;
  readonly nodes: readonly RelationshipNode[];
  readonly edges: readonly RelationshipEdge[];
  readonly unresolved: readonly RelationshipExpansion["unresolved"][number][];
  readonly frontier: readonly { node: RelationshipNode; depth: number }[];
  readonly expanded: readonly string[];
  readonly reasons: readonly string[];
  readonly coverage: RelationshipCoverage;
  readonly depthReached: number;
  readonly expansions: number;
  readonly truncated: boolean;
}

export interface RelationshipTraceResult extends RelationshipExplorationState {
  readonly status: "complete" | "partial";
}

export interface RelationshipContinuationOptions {
  /** Extends the cumulative depth cap; expansion and node/edge caps never reset. */
  extendDepth?: number;
}

function validateBudget(budget: RelationshipTraceBudget): void {
  for (const [name, value] of Object.entries(budget)) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new SignalGrepError(`Relationship ${name} must be a positive integer`);
  }
}

function resolvedRoot(
  root: RelationshipResolution | RelationshipNode | undefined,
): RelationshipNode {
  if (!root) throw new SignalGrepError("Relationship trace root was not resolved");
  if ("identity" in root) return root;
  if (root.status !== "resolved" || !root.node)
    throw new SignalGrepError(
      `Relationship target could not be resolved: ${root.reasons.join("; ")}`,
    );
  return root.node;
}

function mergeDependencies(
  expansions: readonly RelationshipExpansion[],
): RelationshipCoverage["sources"] {
  const status = expansions.flatMap((expansion) => expansion.coverage.sources);
  return [...new Map(status.map((item) => [`${item.role}:${item.path}`, item])).values()];
}

/** Owns bounded breadth-first traversal and its frontier; providers only expand one hop. */
export class RelationshipExplorer {
  async start(
    view: RelationshipView,
    request: RelationshipTraceRequest,
  ): Promise<RelationshipTraceResult> {
    validateBudget(request.budget);
    if (request.signal?.aborted) throw abortError();
    const root = resolvedRoot(request.root);
    const state: RelationshipExplorationState = {
      scope: request.scope ?? view.sourceScope,
      operation: request.operation,
      budget: { ...request.budget },
      nodes: [root],
      edges: [],
      unresolved: [],
      frontier: [{ node: root, depth: 0 }],
      expanded: [],
      reasons: [],
      coverage: relationshipCoverage([], [], "not-applicable"),
      depthReached: 0,
      expansions: 0,
      truncated: false,
    };
    return this.continue(view, state, request.signal);
  }

  async continue(
    view: RelationshipView,
    previous: RelationshipExplorationState,
    signal?: AbortSignal,
    options: RelationshipContinuationOptions = {},
  ): Promise<RelationshipTraceResult> {
    const budget = {
      ...previous.budget,
      maxDepth: previous.budget.maxDepth + (options.extendDepth ?? 0),
    };
    validateBudget(budget);
    if (signal?.aborted) throw abortError();
    const nodes = new Map(previous.nodes.map((node) => [relationshipNodeKey(node), node]));
    const edges = new Map(previous.edges.map((edge) => [relationshipEdgeKey(edge), edge]));
    const expanded = new Set(previous.expanded);
    const frontier: FrontierItem[] = previous.frontier.map((item) => ({ ...item }));
    const unresolved = [...previous.unresolved];
    const reasons = [...previous.reasons];
    const expansions = previous.expansions;
    let usedExpansions = expansions;
    let depthReached = previous.depthReached;
    let truncated = false;
    const expansionFacts: RelationshipExpansion[] = [];
    while (frontier.length > 0) {
      if (signal?.aborted) throw abortError();
      const current = frontier.shift();
      if (!current) break;
      if (current.depth >= budget.maxDepth) {
        frontier.unshift(current);
        truncated = true;
        break;
      }
      const key = `${relationshipNodeKey(current.node)}\u0000${previous.operation}`;
      if (expanded.has(key)) continue;
      if (usedExpansions >= budget.maxExpansions) {
        frontier.unshift(current);
        truncated = true;
        break;
      }
      usedExpansions += 1;
      expanded.add(key);
      // oxlint-disable-next-line no-await-in-loop -- breadth-first expansion is budgeted and ordered.
      const expansion = await view.expand(current.node, previous.operation, signal);
      expansionFacts.push(expansion);
      depthReached = Math.max(depthReached, current.depth + 1);
      for (const item of expansion.unresolved) unresolved.push(item);
      for (const edge of expansion.edges) {
        if (edges.has(edge.edgeKey)) continue;
        const missingNodeKeys = [edge.from, edge.to]
          .map(relationshipNodeKey)
          .filter((missingKey) => !nodes.has(missingKey));
        if (
          edges.size >= budget.maxEdges ||
          nodes.size + new Set(missingNodeKeys).size > budget.maxNodes
        ) {
          truncated = true;
          reasons.push(
            edges.size >= budget.maxEdges
              ? "Relationship edge budget reached; remaining edges were not retained and cannot be continued"
              : "Relationship node budget reached; remaining edges were not retained and cannot be continued",
          );
          frontier.length = 0;
          break;
        }
        edges.set(edge.edgeKey, edge);
        for (const node of [edge.from, edge.to]) {
          const nodeKey = relationshipNodeKey(node);
          if (!nodes.has(nodeKey)) {
            nodes.set(nodeKey, node);
          }
          if (!expanded.has(`${nodeKey}\u0000${previous.operation}`))
            frontier.push({ node, depth: current.depth + 1 });
        }
      }
      if (nodes.size >= budget.maxNodes || edges.size >= budget.maxEdges) {
        truncated = true;
        frontier.length = 0;
        reasons.push("Relationship traversal reached its retained node/edge budget");
        break;
      }
    }
    const previousSources = previous.coverage.sources;
    const sources = [
      ...new Map(
        [...previousSources, ...mergeDependencies(expansionFacts)].map((source) => [
          `${source.role}:${source.path}`,
          source,
        ]),
      ).values(),
    ];
    const allReasons = [...new Set([...previous.coverage.reasons, ...reasons])];
    const freshness =
      expansionFacts.length === 0 ? "unknown" : aggregateRelationshipValidity(sources);
    const coverage = relationshipCoverage(
      sources,
      allReasons,
      truncated || unresolved.length > 0 ? "partial" : "complete",
    );
    coverage.freshness = freshness;
    return {
      scope: previous.scope,
      operation: previous.operation,
      budget,
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      unresolved,
      frontier,
      expanded: [...expanded],
      reasons: allReasons,
      coverage,
      depthReached,
      expansions: usedExpansions,
      truncated,
      status: truncated || unresolved.length > 0 ? "partial" : "complete",
    };
  }
}

export async function validateRelationshipView(
  view: RelationshipView,
  signal?: AbortSignal,
): Promise<RelationshipRecheck> {
  if (signal?.aborted) throw abortError();
  return view.recheck(signal);
}

export function providerForRelationship(
  provider: RelationshipProvider,
  options: Parameters<RelationshipProvider["open"]>[0],
): Promise<RelationshipView> {
  return provider.open(options);
}
