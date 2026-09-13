import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { sourceEvidence } from "./analysis-evidence.js";
import type { AnalysisItem, AnalysisResultSet } from "./analysis-types.js";
import { abortError, SignalGrepError } from "./errors.js";
import {
  DEFAULT_LANGUAGE_CAPABILITIES,
  descriptorForPath,
} from "./language-capability-definitions.js";
import type {
  RelationshipOperation,
  RelationshipOutlineItem,
  RelationshipRecheck,
  RelationshipSourceScope,
  RelationshipView,
} from "./relationship-types.js";
import type {
  RelationshipProviderRegistration,
  RelationshipProviderRegistrationOptions,
} from "./relationship-provider-registry.js";
import type { RelationshipScopeResolution } from "./relationship-service.js";
import { publicRelationshipDetails } from "./relationship-output.js";
import { isSemanticMode, type SemanticMode } from "./semantic-protocol.js";
import type { SourceAccess } from "./source-access.js";
import type { SignalGrepInput } from "./service.js";

type RelationshipScopeResolver = (
  cwd: string,
  target: string,
  input: SignalGrepInput,
  signal?: AbortSignal,
) => Promise<RelationshipScopeResolution>;

function scopeFromResolution(resolved: RelationshipScopeResolution): RelationshipSourceScope {
  return {
    root: resolved.root,
    ...(resolved.filters.glob.length ? { include: resolved.filters.glob } : {}),
    ...(resolved.filters.exclude.length ? { exclude: resolved.filters.exclude } : {}),
    hidden: resolved.filters.hidden,
  };
}

async function searchScope(
  cwd: string,
  target: string,
  scope: RelationshipSourceScope,
): Promise<NonNullable<AnalysisResultSet["scope"]>> {
  const [canonicalCwd, canonicalRoot] = await Promise.all([
    realpath(resolve(cwd)).catch(() => resolve(cwd)),
    realpath(scope.root).catch(() => resolve(scope.root)),
  ]);
  const isProjectRoot = canonicalRoot === canonicalCwd;
  return {
    path: isProjectRoot ? "." : canonicalRoot,
    requestedPath: target,
    glob: [...(scope.include ?? [])],
    exclude: [...(scope.exclude ?? [])],
    hidden: scope.hidden ?? false,
    expandedToProjectRoot: false,
    assertion: isProjectRoot ? "project-wide" : "requested-scope",
  };
}

function relatedNode(
  operation: RelationshipOperation,
  edge: Awaited<ReturnType<RelationshipView["expand"]>>["edges"][number],
) {
  return operation === "definitions" || operation === "implementations" || operation === "callees"
    ? edge.to
    : edge.from;
}

const RELATIONSHIP_OPERATIONS = [
  "definitions",
  "references",
  "implementations",
  "callers",
  "callees",
] as const satisfies readonly RelationshipOperation[];

function isRelationshipOperation(mode: SemanticMode): mode is RelationshipOperation {
  return RELATIONSHIP_OPERATIONS.some((candidate) => candidate === mode);
}

async function itemFor(
  access: SourceAccess,
  operation: RelationshipOperation,
  edge: Awaited<ReturnType<RelationshipView["expand"]>>["edges"][number],
): Promise<AnalysisItem> {
  const node = relatedNode(operation, edge);
  const document = await access.load(node.path, node.source);
  const evidence = sourceEvidence(document, node.range);
  return {
    path: node.path,
    line: node.start.line,
    label: `Compiler-bound ${operation}`,
    excerpt: evidence.excerpt,
    ...(node.source ? { source: node.source } : {}),
    range: node.range,
    details: {
      kind: "semantic",
      relation: operation,
      binding: edge.evidence[0]?.providerBasis ?? edge.from.identity.providerId,
      certainty: edge.confidence,
      runtimeDispatch: "unproven",
      evidence: edge.evidence.map(({ reason, level, basis, providerBasis }) => ({
        reason,
        level,
        basis,
        ...(providerBasis ? { providerBasis } : {}),
      })),
      excerptRange: evidence.excerptRange,
      excerptTruncated: evidence.excerptTruncated,
    },
  };
}

export async function navigateRelationship(
  registration: RelationshipProviderRegistration,
  input: SignalGrepInput,
  access: SourceAccess,
  resolveScope: RelationshipScopeResolver,
  queue: RelationshipProviderRegistrationOptions["queue"],
): Promise<AnalysisResultSet> {
  if (!isSemanticMode(input.mode))
    throw new SignalGrepError("A semantic provider requires a semantic mode");
  const mode = input.mode;
  if (!isRelationshipOperation(mode))
    throw new SignalGrepError(
      `Provider ${registration.providerId} does not implement mode=${mode}; use mode=capabilities`,
    );
  if (!input.path) throw new SignalGrepError(`mode=${mode} requires a workspace path`);
  if (!registration.operations.includes(mode))
    throw new SignalGrepError(
      `Provider ${registration.providerId} does not implement mode=${mode}; use mode=capabilities`,
    );
  if (access.signal?.aborted) throw abortError();
  const target = input.path.replace(/^@/, "");
  const resolved = await resolveScope(access.cwd, target, input, access.signal);
  const scope = scopeFromResolution(resolved);
  const options: RelationshipProviderRegistrationOptions = {
    cwd: access.cwd,
    scope,
    signal: access.signal ?? new AbortController().signal,
    queue,
    maxFiles: access.maxFiles,
    ...(registration.limitsForOperation ? { limits: registration.limitsForOperation(mode) } : {}),
  };
  const view = await registration.open(options);
  try {
    const resolution = await view.resolveNode(
      {
        path: target,
        ...(input.line === undefined ? {} : { line: input.line }),
        ...(input.column === undefined ? {} : { column: input.column }),
        ...(input.symbol === undefined ? {} : { symbol: input.symbol }),
      },
      access.signal,
    );
    if (!resolution.node) {
      const relationship = publicRelationshipDetails(scope, [], {
        operation: mode,
        providerId: registration.providerId,
        freshness: "unknown",
        coverage: "partial",
        comparisonTarget: "current-worktree",
        truncation: { truncated: false, reasons: resolution.reasons },
      });
      return {
        kind: mode,
        unit: "relationships",
        items: [],
        partial: true,
        reasons: [
          ...resolution.reasons,
          `Semantic provider returned ${resolution.status} without a resolved target`,
        ],
        filesRead: access.filesRead,
        bytesRead: access.bytesRead,
        scope: await searchScope(access.cwd, target, scope),
        coverage: { compilerBindings: "partial" },
        relationship,
        redact: input.redact ?? false,
      };
    }
    const expansion = await view.expand(resolution.node, mode, access.signal);
    const items = await Promise.all(expansion.edges.map((edge) => itemFor(access, mode, edge)));
    const recheck: RelationshipRecheck = await view.recheck(access.signal);
    const reasons = [
      ...resolution.reasons,
      ...expansion.coverage.reasons,
      ...expansion.unresolved.map((item) => item.reason),
      ...recheck.reasons,
    ];
    const partial =
      resolution.status !== "resolved" ||
      expansion.coverage.status !== "complete" ||
      expansion.unresolved.length > 0 ||
      recheck.validity !== "current";
    const relationship = publicRelationshipDetails(scope, recheck.sources, {
      operation: mode,
      providerId: registration.providerId,
      freshness: recheck.validity,
      coverage: partial ? "partial" : "complete",
      comparisonTarget: "current-worktree",
      truncation: { truncated: false, reasons: [...new Set(reasons)] },
    });
    return {
      kind: mode,
      unit: "relationships",
      items,
      partial,
      reasons: [...new Set(reasons)],
      filesRead: access.filesRead,
      bytesRead: access.bytesRead,
      scope: await searchScope(access.cwd, target, scope),
      coverage: {
        compilerBindings: partial ? "partial" : "complete",
        freshness: recheck.validity === "current" ? "complete" : "partial",
      },
      relationship,
      redact: input.redact ?? false,
    };
  } finally {
    await view.close();
  }
}

function outlineItems(nodes: readonly RelationshipOutlineItem[], depth = 0): AnalysisItem[] {
  return nodes.flatMap((node) => [
    {
      path: node.path,
      line: node.start.line,
      label: `${"  ".repeat(depth)}${node.kind} ${node.name}`,
      ...(node.source ? { source: node.source } : {}),
      range: node.range,
      details: {
        kind: "symbol",
        name: node.name,
        syntax: "provider-owned outline; it does not prove runtime relationships",
      },
    },
    ...outlineItems(node.children, depth + 1),
  ]);
}

export async function navigateOutline(
  registration: RelationshipProviderRegistration,
  input: SignalGrepInput,
  access: SourceAccess,
  resolveScope: RelationshipScopeResolver,
  queue: RelationshipProviderRegistrationOptions["queue"],
): Promise<AnalysisResultSet> {
  if (!input.path) throw new SignalGrepError("mode=outline requires a workspace path");
  const target = input.path.replace(/^@/, "");
  const resolved = await resolveScope(access.cwd, target, input, access.signal);
  const scope = scopeFromResolution(resolved);
  const view = await registration.open({
    cwd: access.cwd,
    scope,
    signal: access.signal ?? new AbortController().signal,
    queue,
    maxFiles: access.maxFiles,
  });
  try {
    if (!view.outline)
      throw new SignalGrepError(
        `Provider ${registration.providerId} does not implement mode=outline; use mode=capabilities`,
      );
    const nodes = await view.outline(target);
    const allItems = outlineItems(nodes);
    const selectedItems = allItems.filter((item) => {
      const matchesLine = input.line === undefined || item.line === input.line;
      const matchesSymbol = input.symbol === undefined || item.details?.name === input.symbol;
      return matchesLine && matchesSymbol;
    });
    const selectorRequested = input.line !== undefined || input.symbol !== undefined;
    const recheck = await view.recheck(access.signal);
    const reasons = [...recheck.reasons];
    if (selectorRequested && selectedItems.length === 0)
      reasons.push("Outline selector did not match an admitted symbol");
    const partial =
      recheck.validity !== "current" ||
      recheck.coverage !== "complete" ||
      (selectorRequested && selectedItems.length === 0);
    return {
      kind: "outline",
      unit: "symbols",
      items: selectedItems,
      partial,
      reasons: [...new Set(reasons)],
      filesRead: access.filesRead,
      bytesRead: access.bytesRead,
      scope: await searchScope(access.cwd, target, scope),
      coverage: { outline: partial ? "partial" : "complete" },
      redact: input.redact ?? false,
    };
  } finally {
    await view.close();
  }
}

export function outlineProviderSupports(
  relationship: RelationshipProviderRegistration,
  path: string,
): boolean {
  return (
    relationship.supports(path) &&
    Boolean(
      descriptorForPath(DEFAULT_LANGUAGE_CAPABILITIES, path)?.capabilities.some(
        (capability) =>
          capability.name === "outline" &&
          capability.provider === relationship.providerId &&
          capability.availability !== "unavailable",
      ),
    )
  );
}

export function hasDeclaredOutlineProvider(
  relationship: RelationshipProviderRegistration,
): boolean {
  return DEFAULT_LANGUAGE_CAPABILITIES.some((descriptor) =>
    descriptor.capabilities.some(
      (capability) =>
        capability.name === "outline" && capability.provider === relationship.providerId,
    ),
  );
}
