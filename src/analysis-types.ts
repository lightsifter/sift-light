import type { ByteRange, SourceReference } from "./source-document.js";
import type { SignalGrepInput } from "./service.js";
import type { SearchScopeDetails, ResultStatistics } from "./types.js";
import type { ValidationDetails } from "./validation-types.js";
import type { ConceptSourceSummary } from "./concept-source-generation.js";

export type CoverageStatus = "complete" | "partial" | "skipped" | "not-applicable";

export const SEMANTIC_JUDGE_CLASSIFICATIONS = [
  "implementation-candidate",
  "caller-candidate",
  "mention-only",
  "documentation",
  "test-only",
  "irrelevant",
  "uncertain",
] as const;

export type SemanticJudgeClassification = (typeof SEMANTIC_JUDGE_CLASSIFICATIONS)[number];

export const SEMANTIC_JUDGE_NON_PROOF_CLAIM =
  "semantic classification only; local static and runtime verification is not asserted";

export type SemanticJudgeStatus = "disabled" | "complete" | "partial" | "failed";

export interface SemanticJudgeJudgment {
  candidateIndex: number;
  classification: SemanticJudgeClassification;
  probability: number;
  confidence?: number;
}

export interface SemanticJudgeDetails {
  enabled: boolean;
  provider: string;
  status: SemanticJudgeStatus;
  model?: string;
  maxCandidates: number;
  candidatesConsidered: number;
  judgedCandidates: number;
  candidatesUnjudged: number;
  batchesAttempted: number;
  batchesCompleted: number;
  batchesFailed: number;
  batchesSplit: number;
  classificationCounts: Record<string, number>;
  inputTokens?: number;
  outputTokens?: number;
  elapsedMs?: number;
  reason?: string;
}

export interface ConceptScoreProfile {
  count: number;
  top: number;
  second?: number;
  median: number;
  min: number;
  spread: number;
  topMargin?: number;
}

export interface AnalysisItem {
  path: string;
  line: number;
  label: string;
  excerpt?: string;
  source?: SourceReference;
  range?: ByteRange;
  details?: Record<string, unknown>;
}

export interface AnalysisDetails {
  kind:
    | "concept"
    | "hybrid"
    | "structure"
    | "files"
    | "roles"
    | "file-and"
    | "function-and"
    | "changes"
    | "outline"
    | "imports"
    | "tests"
    | "any-of"
    | "validate";
  unit:
    | "occurrences"
    | "files"
    | "functions"
    | "symbols"
    | "relationships"
    | "test-candidates"
    | "evidence-items";
  totalItems: number;
  returnedItems: number;
  modelOutput?: boolean;
  semanticJudge?: SemanticJudgeDetails;
  statistics?: ResultStatistics;
  items: (AnalysisItem & { index: number; sourceId?: number; inspect?: SignalGrepInput })[];
  sources?: SourceReference[];
  inspectCursor?: string;
  reasons: string[];
  filesRead?: number;
  bytesRead?: number;
  counts?: Record<string, number>;
  termCounts?: { term: string; retainedOccurrences: number }[];
  termCountsOffset?: number;
  totalTerms?: number;
  termCountsNextRequest?: SignalGrepInput;
  matchesRequest?: SignalGrepInput;
  changes?: { base: string; target: string; scope: string; side: string };
  scope?: SearchScopeDetails;
  chunks?: {
    chunked: boolean;
    count: number;
    maxTermsPerChunk: number;
    execution: "single" | "bounded-parallel";
  };
  coverage?: Record<string, CoverageStatus>;
  validation?: ValidationDetails;
  stats?: {
    inferencePeakRssBytes?: number;
    passagesRanked?: number;
    elapsedMs?: number;
    filesEnumerated?: number;
    filesAdmitted?: number;
    filesParsed?: number;
    filesSkipped?: number;
    cacheHits?: number;
    conceptCacheHits?: number;
    conceptCacheMisses?: number;
    conceptCacheBytes?: number;
    conceptCacheMaxBytes?: number;
    conceptWindowsRanked?: number;
    parseMs?: number;
    budgetExhausted?: boolean;
    scoreProfile?: ConceptScoreProfile;
  };
  sourceGeneration?: ConceptSourceSummary;
}

export interface AnalysisResultSet {
  kind: AnalysisDetails["kind"];
  unit: AnalysisDetails["unit"];
  items: AnalysisItem[];
  partial: boolean;
  reasons: string[];
  semanticJudge?: SemanticJudgeDetails;
  filesRead?: number;
  bytesRead?: number;
  counts?: Record<string, number>;
  termCounts?: { term: string; retainedOccurrences: number }[];
  changes?: AnalysisDetails["changes"];
  scope?: SearchScopeDetails;
  chunks?: AnalysisDetails["chunks"];
  coverage?: Record<string, CoverageStatus>;
  stats?: AnalysisDetails["stats"];
  sourceGeneration?: ConceptSourceSummary;
  redact?: boolean;
}
