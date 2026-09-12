import type {
  ByteRange,
  SourceDocument,
  SourcePosition,
  SourceReference,
} from "./source-document.js";

/** Static navigation operations supported by the relationship providers. */
export type RelationshipOperation =
  | "definitions"
  | "references"
  | "implementations"
  | "callers"
  | "callees";

/** A provider may use a more specific identifier, but it is never assumed stable across views. */
export type RelationshipProviderId = string;

/** The three facts used when combining per-source validation outcomes. */
export type RelationshipValidity = "current" | "stale" | "unknown";

/** Evidence may be compared with the live worktree, a recorded Git object, or both. */
export type RelationshipComparisonTarget = "current-worktree" | "recorded-git" | "mixed";

/** Evidence strength describes the static parser/semantic basis, not runtime execution. */
export type RelationshipEvidenceLevel = "compiler" | "syntax" | "candidate";

export type RelationshipCoverageStatus = "complete" | "partial" | "skipped" | "not-applicable";

/** A relationship can be statically useful without being a proven runtime dispatch. */
export type RelationshipConfidence = "verified-static" | "ambiguous" | "dynamic" | "unknown";

export interface RelationshipSourceScope {
  /** Provider-owned project root, expressed as an absolute or provider-relative path. */
  root: string;
  include?: readonly string[];
  exclude?: readonly string[];
  /** Whether hidden files are admitted by the provider's source inventory. */
  hidden?: boolean;
}

export type RelationshipDependencyRole = "source" | "config" | "manifest" | "metadata";

export interface RelationshipDependency {
  path: string;
  role: RelationshipDependencyRole;
  reference?: SourceReference;
  /** Configuration, manifest, and environment inputs are evidence dependencies too. */
  fingerprint?: string;
  exists?: boolean;
  reason?: string;
}

export interface RelationshipSourceLocation {
  path: string;
  range: ByteRange;
  start: SourcePosition;
  end?: SourcePosition;
  source?: SourceReference;
}

export interface RelationshipEvidence {
  /** Human-readable explanation retained with the edge for review and diagnostics. */
  reason: string;
  level: RelationshipEvidenceLevel;
  basis: "semantic" | "syntax" | "candidate";
  /** Provider-specific parser or service name, for example `gopls` or `tsserver`. */
  providerBasis?: string;
  location?: RelationshipSourceLocation;
}

export interface RelationshipNodeIdentity {
  providerId: RelationshipProviderId;
  analysisViewId: string;
  sourceScope: string;
  /** Provider-local key. It must not be treated as stable across analysis views. */
  localKey: string;
}

export interface RelationshipNode {
  identity: RelationshipNodeIdentity;
  path: string;
  name: string;
  kind: string;
  range: ByteRange;
  start: SourcePosition;
  end?: SourcePosition;
  source?: SourceReference;
  evidence: readonly RelationshipEvidence[];
}

export interface RelationshipEdge {
  /** Unique only within one analysis view; callers must not persist it across views. */
  edgeKey: string;
  operation: RelationshipOperation;
  from: RelationshipNode;
  to: RelationshipNode;
  callSite?: RelationshipSourceLocation;
  evidence: readonly RelationshipEvidence[];
  confidence: RelationshipConfidence;
  dependencies: readonly RelationshipDependency[];
}

export interface RelationshipResolution {
  status: "resolved" | "ambiguous" | "unsupported" | "unknown";
  node?: RelationshipNode;
  candidates?: readonly RelationshipNode[];
  reasons: readonly string[];
  dependencies: readonly RelationshipDependency[];
}

export interface RelationshipExpansion {
  edges: readonly RelationshipEdge[];
  nodes: readonly RelationshipNode[];
  unresolved: readonly RelationshipUnresolved[];
  dependencies: readonly RelationshipDependency[];
  coverage: RelationshipCoverage;
}

export interface RelationshipUnresolved {
  operation: RelationshipOperation;
  source?: RelationshipSourceLocation;
  reason: string;
  confidence: Extract<RelationshipConfidence, "ambiguous" | "dynamic" | "unknown">;
}

export interface RelationshipSourceStatus {
  path: string;
  role: RelationshipDependencyRole;
  status: RelationshipValidity;
  expected?: SourceReference;
  current?: SourceReference;
  /** Actual source origin used for this item when it can be determined. */
  actualTarget?: RelationshipComparisonTarget;
  reason?: string;
}

export interface RelationshipCoverage {
  status: RelationshipCoverageStatus;
  freshness: RelationshipValidity;
  sources: readonly RelationshipSourceStatus[];
  reasons: readonly string[];
}

export interface RelationshipRecheck {
  validity: RelationshipValidity;
  coverage: RelationshipCoverageStatus;
  sources: readonly RelationshipSourceStatus[];
  affectedNodeKeys: readonly string[];
  affectedEdgeKeys: readonly string[];
  reasons: readonly string[];
}

export interface RelationshipPublicDetails {
  operation?: RelationshipOperation;
  providerId?: RelationshipProviderId;
  analysisViewId?: string;
  freshness: RelationshipValidity;
  coverage: RelationshipCoverageStatus;
  scope: RelationshipSourceScope;
  comparisonTarget: RelationshipComparisonTarget;
  checked: readonly RelationshipSourceStatus[];
  unchecked: readonly RelationshipSourceStatus[];
  sourceOmitted?: number;
  truncation: { truncated: boolean; reasons: readonly string[] };
  depth?: number;
  depthReached?: number;
  expansions?: number;
  affectedNodeKeys?: readonly string[];
  affectedEdgeKeys?: readonly string[];
  /** Wall-clock bounds (Unix milliseconds) of the authoritative recheck. */
  checkInterval?: { start: number; end: number; selected?: number };
  sourceTable?: readonly {
    id: number;
    path: string;
    role: RelationshipDependencyRole;
    status: RelationshipValidity;
    reason?: string;
  }[];
  dependencyTable?: readonly {
    id: number;
    path: string;
    role: RelationshipDependencyRole;
    fingerprint?: string;
    exists?: boolean;
    reason?: string;
  }[];
  evidenceTable?: readonly {
    id: number;
    reason: string;
    level: RelationshipEvidenceLevel;
    basis: "semantic" | "syntax" | "candidate";
    providerBasis?: string;
  }[];
  /** Best-effort filesystem notifications; recheck remains authoritative. */
  changeHints?: readonly {
    path: string;
    role: RelationshipDependencyRole;
    observedAt: number;
    reason?: string;
  }[];
  watchHealth?: {
    status: "healthy" | "degraded" | "unknown" | "closed";
    activeSources: number;
    activeWatchers: number;
    maxSources: number;
    retainedHints: number;
    maxHints: number;
    droppedHints: number;
    watcherErrors: number;
    partialStarts: number;
    reasons: readonly string[];
  };
}

export interface RelationshipSourceReader {
  load(path: string, expected?: SourceReference): Promise<SourceDocument>;
  refresh(path: string, expected: SourceReference): Promise<SourceDocument>;
}

export interface RelationshipProviderOptions {
  cwd: string;
  scope: RelationshipSourceScope;
  source: RelationshipSourceReader;
  signal: AbortSignal;
  /** Reused only within one stored analysis snapshot when a provider is reopened. */
  analysisViewId?: string;
  /** Provider-specific limits are deliberately opaque to the common explorer. */
  limits?: Readonly<Record<string, number>>;
}

export interface RelationshipView {
  readonly providerId: RelationshipProviderId;
  readonly analysisViewId: string;
  readonly sourceScope: RelationshipSourceScope;
  resolveNode(
    input: { path: string; line: number; column?: number; symbol?: string },
    signal?: AbortSignal,
  ): Promise<RelationshipResolution>;
  expand(
    node: RelationshipNode,
    operation: RelationshipOperation,
    signal?: AbortSignal,
  ): Promise<RelationshipExpansion>;
  /** Recheck all source/config/manifest/metadata dependencies used by this view. */
  recheck(signal?: AbortSignal): Promise<RelationshipRecheck>;
  close(): Promise<void>;
}

export interface RelationshipProvider {
  readonly providerId: RelationshipProviderId;
  open(options: RelationshipProviderOptions): Promise<RelationshipView>;
}

/** Reopenable provider handle kept by the bounded store; it must not capture a live view or compiler. */
export interface RelationshipViewFactory {
  readonly providerId: RelationshipProviderId;
  open(signal?: AbortSignal, analysisViewId?: string): Promise<RelationshipView>;
}

export function relationshipNodeKey(node: RelationshipNode): string {
  const identity = node.identity;
  return JSON.stringify([
    identity.providerId,
    identity.analysisViewId,
    identity.sourceScope,
    identity.localKey,
  ]);
}

export function relationshipEdgeKey(edge: RelationshipEdge): string {
  return edge.edgeKey;
}
