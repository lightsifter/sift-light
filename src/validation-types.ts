import type { SourceReference } from "./source-document.js";

export type EvidenceValidity = "current" | "stale" | "unknown";

export type EvidenceComparisonTarget = "current-worktree" | "recorded-git" | "mixed";

export type EvidenceCoverageStatus = "complete" | "partial" | "skipped" | "not-applicable";

export interface EvidenceSourceScope {
  /** Saved evidence root, expressed as an absolute or search-relative path. */
  root: string;
  include?: readonly string[];
  exclude?: readonly string[];
  /** Whether hidden files are admitted by the search source inventory. */
  hidden?: boolean;
}

export type EvidenceDependencyRole = "source";

export interface EvidenceSourceStatus {
  path: string;
  role: EvidenceDependencyRole;
  status: EvidenceValidity;
  expected?: SourceReference;
  current?: SourceReference;
  /** Actual source origin used for this item when it can be determined. */
  actualTarget?: EvidenceComparisonTarget;
  reason?: string;
}

export interface EvidenceRecheck {
  validity: EvidenceValidity;
  coverage: EvidenceCoverageStatus;
  sources: readonly EvidenceSourceStatus[];
  reasons: readonly string[];
}

export interface ValidationDetails {
  freshness: EvidenceValidity;
  coverage: EvidenceCoverageStatus;
  scope: EvidenceSourceScope;
  comparisonTarget: EvidenceComparisonTarget;
  checked: readonly EvidenceSourceStatus[];
  unchecked: readonly EvidenceSourceStatus[];
  sourceOmitted?: number;
  truncation: { truncated: boolean; reasons: readonly string[] };
  checkInterval: { start: number; end: number; selected?: number };
}
