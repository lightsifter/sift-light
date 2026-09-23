import { DEFAULT_HYBRID_CONCEPT_LIMIT, MAX_HYBRID_CONCEPT_LIMIT } from "./analysis-limits.js";
import { resolve } from "node:path";
import type { AnalysisItem, AnalysisResultSet, CoverageStatus } from "./analysis-types.js";
import type { ConceptSearchExecution } from "./concept-search.js";
import {
  conceptSourceSummary,
  ConceptSourceChangedError,
  verifyConceptSourceGeneration,
} from "./concept-source-generation.js";
import { SiftLightError } from "./errors.js";
import { SourceAccess, SourceBudgetError } from "./source-access.js";
import { SourceDocumentError, type ByteRange, type SourceDocument } from "./source-document.js";
import { sameSourceRevision } from "./source.js";
import type { SearchScan } from "./types.js";
import { applySemanticJudge, type SemanticJudgeIntegration } from "./semantic-judge.js";

export class HybridSourceChangedError extends ConceptSourceChangedError {
  constructor(
    message = "Hybrid source changed while exact and concept evidence were being merged",
  ) {
    super(message);
    this.name = "HybridSourceChangedError";
  }
}

export function sameHybridLiteralScan(left: SearchScan, right: SearchScan): boolean {
  if (
    left.totalMatches !== right.totalMatches ||
    left.snapshotComplete !== right.snapshotComplete ||
    left.fileCounts.size !== right.fileCounts.size
  )
    return false;

  // A scan can retain file counts without retaining source revisions. Build the
  // lookup once so a large exact-result page does not repeatedly scan matches
  // while comparing its admitted inventory.
  const leftMatchesByDisplayPath = new Map<string, SearchScan["matches"][number]>();
  for (const match of left.matches) {
    if (!leftMatchesByDisplayPath.has(match.displayPath)) {
      leftMatchesByDisplayPath.set(match.displayPath, match);
    }
  }
  const rightMatchesByDisplayPath = new Map<string, SearchScan["matches"][number]>();
  for (const match of right.matches) {
    if (!rightMatchesByDisplayPath.has(match.displayPath)) {
      rightMatchesByDisplayPath.set(match.displayPath, match);
    }
  }

  for (const [path, count] of left.fileCounts) {
    if (right.fileCounts.get(path) !== count) return false;
    const leftMatch = leftMatchesByDisplayPath.get(path);
    const rightMatch = rightMatchesByDisplayPath.get(path);
    if (leftMatch?.absolutePath !== rightMatch?.absolutePath) return false;
    if (!leftMatch || !rightMatch) continue;
    const leftRevision = left.sourceRevisions.get(leftMatch.absolutePath);
    const rightRevision = right.sourceRevisions.get(rightMatch.absolutePath);
    // Missing revision metadata is unknown coverage, not evidence that the
    // source changed. literalEvidence carries that uncertainty as partial.
    if (leftRevision === undefined || rightRevision === undefined) continue;
    if (!sameSourceRevision(leftRevision, rightRevision)) return false;
  }
  return true;
}

function rangesOverlap(left: ByteRange, right: ByteRange): boolean {
  return left.start < right.end && right.start < left.end;
}

export function hybridConceptLimit(value: number | undefined): number {
  const candidate = value ?? DEFAULT_HYBRID_CONCEPT_LIMIT;
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > MAX_HYBRID_CONCEPT_LIMIT) {
    throw new SiftLightError(
      `conceptLimit must be an integer from 1 through ${String(MAX_HYBRID_CONCEPT_LIMIT)}`,
    );
  }
  return candidate;
}

function absoluteOccurrenceRanges(
  document: SourceDocument,
  line: number,
  match: SearchScan["matches"][number],
): ByteRange[] {
  const lineRange = document.lineRange(line);
  return match.occurrences.map((occurrence) => ({
    start: lineRange.start + occurrence.byteStart,
    end: lineRange.start + occurrence.byteEnd,
  }));
}

async function literalEvidence(
  scan: SearchScan,
  access: SourceAccess,
  generation: ConceptSearchExecution["sourceGeneration"],
): Promise<{
  items: AnalysisItem[];
  rangesByPath: Map<string, ByteRange[]>;
  sourceCoverage: CoverageStatus;
  reasons: string[];
  reusedDocuments: number;
  loadedDocuments: number;
}> {
  const documents = new Map<string, SourceDocument>();
  const unavailable = new Map<string, string>();
  const generatedDocuments = new Map(
    generation.documents.map((document) => [resolve(access.cwd, document.path), document]),
  );
  let reusedDocuments = 0;
  let loadedDocuments = 0;
  for (const match of scan.matches) {
    if (documents.has(match.absolutePath) || unavailable.has(match.absolutePath)) continue;
    try {
      const generated = generatedDocuments.get(resolve(access.cwd, match.absolutePath));
      // Reuse the document admitted by the unified source generation; only unmatched literal
      // files need a bounded inspection read.
      // oxlint-disable-next-line no-await-in-loop -- source reads share one bounded access budget.
      const document = generated ?? (await access.load(match.absolutePath));
      if (generated) reusedDocuments += 1;
      else loadedDocuments += 1;
      const expected = scan.sourceRevisions.get(match.absolutePath);
      if (!expected) {
        unavailable.set(match.absolutePath, "source revision metadata was unavailable");
        continue;
      }
      if (document.reference.origin.kind !== "worktree") {
        unavailable.set(match.absolutePath, "source revision origin was unavailable");
        continue;
      }
      if (!sameSourceRevision(expected, document.reference.origin.revision)) {
        throw new HybridSourceChangedError(
          `${match.displayPath}: source revision changed while preparing hybrid evidence`,
        );
      }
      documents.set(match.absolutePath, document);
    } catch (error) {
      if (error instanceof SourceDocumentError && error.reason === "source-changed")
        throw new HybridSourceChangedError(`${match.displayPath}: ${error.message}`);
      if (error instanceof SourceBudgetError || error instanceof SourceDocumentError) {
        unavailable.set(match.absolutePath, error.message);
        continue;
      }
      throw error;
    }
  }

  const rangesByPath = new Map<string, ByteRange[]>();
  const items = scan.matches.map((match): AnalysisItem => {
    const document = documents.get(match.absolutePath);
    const path = document?.path ?? match.displayPath;
    const ranges = document ? absoluteOccurrenceRanges(document, match.lineNumber, match) : [];
    if (ranges.length) {
      const existing = rangesByPath.get(path) ?? [];
      existing.push(...ranges);
      rangesByPath.set(path, existing);
    }
    const primary = ranges[0];
    return {
      path,
      line: match.lineNumber,
      label: `Literal exact match (${String(match.occurrences.length)} occurrence${match.occurrences.length === 1 ? "" : "s"})${document && primary ? "" : "; source inspection unavailable"}`,
      excerpt: match.lineContent,
      ...(document && primary ? { source: document.reference, range: primary } : {}),
      details: {
        kind: "literal-match",
        source: "literal",
        certainty: "exact",
        sourceVerified: Boolean(document && primary),
        occurrenceCount: match.occurrences.length,
        ranges,
        lineContentTruncated: match.lineTruncated,
      },
    };
  });
  const reasons = [...new Set(unavailable.values())].map(
    (reason) => `Literal source inspection is unavailable for retained evidence: ${reason}`,
  );
  return {
    items,
    rangesByPath,
    sourceCoverage: unavailable.size ? "partial" : "complete",
    reasons,
    reusedDocuments,
    loadedDocuments,
  };
}

function isLiteralOverlap(item: AnalysisItem, rangesByPath: Map<string, ByteRange[]>): boolean {
  const itemRange = item.range;
  if (!itemRange) return false;
  return (rangesByPath.get(item.path) ?? []).some((range) => rangesOverlap(range, itemRange));
}

export async function combineHybridSearch(
  scan: SearchScan,
  execution: ConceptSearchExecution,
  access: SourceAccess,
  conceptLimit: number,
  query: string,
  semanticJudge?: SemanticJudgeIntegration,
  signal?: AbortSignal,
): Promise<AnalysisResultSet> {
  const concept = execution.analysis;
  if (concept.kind !== "concept") throw new Error("Hybrid search requires concept evidence");
  await verifyConceptSourceGeneration(execution.sourceGeneration, access);
  const literal = await literalEvidence(scan, access, execution.sourceGeneration);
  // Concept passages deliberately overlap at chunk boundaries. Deduplicate in
  // rank order before applying the supplement limit, keeping the best evidence.
  const retainedRanges = new Map<string, ByteRange[]>();
  const eligibleConcept = concept.items.filter((item) => {
    if (isLiteralOverlap(item, literal.rangesByPath)) return false;
    const range = item.range;
    if (!range) return true;
    const ranges = retainedRanges.get(item.path) ?? [];
    let low = 0;
    let high = ranges.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (ranges[middle]!.start < range.start) low = middle + 1;
      else high = middle;
    }
    const previous = ranges[low - 1];
    const next = ranges[low];
    if ((previous && rangesOverlap(previous, range)) || (next && rangesOverlap(next, range)))
      return false;
    ranges.splice(low, 0, range);
    retainedRanges.set(item.path, ranges);
    return true;
  });
  const duplicateConceptCandidates = concept.items.length - eligibleConcept.length;
  const judgedConcept = await applySemanticJudge(
    {
      kind: "hybrid",
      unit: "evidence-items",
      items: eligibleConcept,
      partial: false,
      reasons: [],
    },
    query,
    semanticJudge,
    signal,
  );
  const selectedConcept = judgedConcept.items.slice(0, conceptLimit).map((item) =>
    Object.assign({}, item, {
      details: Object.assign({}, item.details, { source: "concept" }),
    }),
  );
  const conceptCandidatesOmitted = Math.max(0, eligibleConcept.length - selectedConcept.length);
  const literalOccurrencesRetained = scan.matches.reduce(
    (total, match) => total + match.occurrences.length,
    0,
  );
  const literalCoverage: CoverageStatus = scan.snapshotComplete ? "complete" : "partial";
  const conceptCoverage =
    concept.coverage?.conceptCandidates ?? (concept.partial ? "partial" : "complete");
  const conceptSourceCoverage: CoverageStatus = execution.sourceGeneration.partial
    ? "partial"
    : "complete";
  const deduplicationCoverage: CoverageStatus =
    scan.snapshotComplete &&
    literal.sourceCoverage === "complete" &&
    conceptSourceCoverage === "complete"
      ? "complete"
      : "partial";
  const partial =
    !scan.snapshotComplete ||
    concept.partial ||
    conceptCoverage === "skipped" ||
    conceptSourceCoverage === "partial" ||
    literal.sourceCoverage === "partial" ||
    deduplicationCoverage === "partial" ||
    judgedConcept.semanticJudge?.status === "failed" ||
    judgedConcept.semanticJudge?.status === "partial";
  const selectionReason = conceptCandidatesOmitted
    ? `Hybrid concept limit retained the top ${String(selectedConcept.length)} of ${String(eligibleConcept.length)} non-overlapping semantic candidates`
    : undefined;
  const firstScore = Number(
    eligibleConcept[0]?.details?.rankingScore ?? eligibleConcept[0]?.details?.score,
  );
  const secondScore = Number(
    eligibleConcept[1]?.details?.rankingScore ?? eligibleConcept[1]?.details?.score,
  );
  const closeRanking =
    Number.isFinite(firstScore) && Number.isFinite(secondScore) && firstScore - secondScore < 0.01;
  return {
    kind: "hybrid",
    unit: "evidence-items",
    items: [...literal.items, ...selectedConcept],
    partial,
    reasons: [
      ...(scan.retention?.reasons ?? []),
      ...concept.reasons,
      ...literal.reasons,
      ...execution.sourceGeneration.reasons,
      ...(selectionReason ? [selectionReason] : []),
      ...(closeRanking
        ? [
            "Semantic ranks are close; verify the leading candidates with source inspection or literal terms.",
          ]
        : []),
      ...(judgedConcept.semanticJudge?.reason ? [judgedConcept.semanticJudge.reason] : []),
    ],
    filesRead: (concept.filesRead ?? 0) + access.filesRead,
    bytesRead: (concept.bytesRead ?? 0) + access.bytesRead,
    counts: {
      ...concept.counts,
      literalMatchingLinesFound: scan.totalMatches,
      literalMatchingLinesPrepared: literal.items.length,
      literalOccurrencesRetained,
      conceptCandidatesRanked: concept.items.length,
      conceptCandidatesDeduplicated: duplicateConceptCandidates,
      conceptCandidatesEligible: eligibleConcept.length,
      conceptCandidatesSelected: selectedConcept.length,
      conceptCandidatesOmitted,
      literalItemsRetained: literal.items.length,
      conceptItemsRetained: selectedConcept.length,
      literalDocumentsReused: literal.reusedDocuments,
      literalDocumentsLoaded: literal.loadedDocuments,
      ...(judgedConcept.semanticJudge
        ? {
            semanticJudgeCandidatesConsidered: judgedConcept.semanticJudge.candidatesConsidered,
            semanticJudgeCandidatesJudged: judgedConcept.semanticJudge.judgedCandidates,
          }
        : {}),
    },
    ...(concept.scope ? { scope: concept.scope } : {}),
    coverage: {
      literalMatches: literalCoverage,
      conceptCandidates: conceptCoverage,
      crossSourceDeduplication: deduplicationCoverage,
      sourceInspection: literal.sourceCoverage,
      conceptSourceInspection: conceptSourceCoverage,
      retention: concept.coverage?.retention ?? "complete",
    },
    ...(concept.stats ? { stats: concept.stats } : {}),
    ...(concept.redact !== undefined ? { redact: concept.redact } : {}),
    sourceGeneration: conceptSourceSummary(execution.sourceGeneration),
    ...(judgedConcept.semanticJudge ? { semanticJudge: judgedConcept.semanticJudge } : {}),
  };
}

export function retainedHybridCounts(
  original: Readonly<Record<string, number>>,
  items: readonly AnalysisItem[],
): Record<string, number> {
  let literalItemsRetained = 0;
  let conceptItemsRetained = 0;
  for (const item of items) {
    if (item.details?.source === "literal") literalItemsRetained += 1;
    if (item.details?.source === "concept") conceptItemsRetained += 1;
  }
  return { ...original, literalItemsRetained, conceptItemsRetained };
}
