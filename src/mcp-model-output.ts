import type { AnalysisDetails } from "./analysis-types.js";
import type { SiftLightDetails, SiftLightResult } from "./types.js";

import { formatStatistics } from "./result-statistics.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactSemanticMetadata(details: SiftLightDetails, analysis: AnalysisDetails): string[] {
  const counts = analysis.counts;
  const stats = analysis.stats;
  const judge = analysis.semanticJudge;
  const coverage = analysis.coverage;
  return [
    ...(counts || stats
      ? [
          `Search: ${String(counts?.filesAdmitted ?? stats?.filesAdmitted ?? 0)} files, ${String(stats?.passagesRanked ?? counts?.passagesQueued ?? 0)} passages; ${String(stats?.elapsedMs ?? 0)} ms; peak inference RSS ${String(stats?.inferencePeakRssBytes ?? 0)} bytes; cache ${String(stats?.conceptCacheHits ?? 0)} hits/${String(stats?.conceptCacheMisses ?? 0)} misses.`,
        ]
      : []),
    ...(coverage
      ? [
          `Coverage: ${Object.entries(coverage)
            .map(([name, status]) => `${name}=${status}`)
            .join(", ")}.`,
        ]
      : []),
    ...(analysis.scope
      ? [`Scope: ${analysis.scope.path}; ignore=${analysis.scope.ignorePolicy}.`]
      : []),
    ...(analysis.sourceGeneration
      ? [
          `Source: ${analysis.sourceGeneration.verification}; ${String(analysis.sourceGeneration.filesUnavailable)} unavailable.`,
        ]
      : []),
    ...(judge
      ? [
          `Semantic judge: ${judge.status}; ${String(judge.judgedCandidates)}/${String(judge.candidatesConsidered)} judged, ${String(judge.candidatesUnjudged)} unjudged; batches ${String(judge.batchesCompleted)}/${String(judge.batchesAttempted)} completed; classes ${JSON.stringify(judge.classificationCounts)}${judge.reason ? `; ${judge.reason}` : ""}.`,
        ]
      : []),
    ...(details.operation
      ? [`Operation: ${details.operation.state}; id=${details.operation.id}.`]
      : []),
    ...analysis.reasons.map((reason) => `[${reason}]`),
    ...(details.redactionApplied ? ["[Display redaction applied.]"] : []),
  ];
}

function compactMetadata(details: SiftLightDetails, analysis: AnalysisDetails): string[] {
  if (analysis.kind === "concept" || analysis.kind === "hybrid")
    return compactSemanticMetadata(details, analysis);
  return [
    ...(analysis.statistics ? formatStatistics(analysis.statistics) : []),
    analysis.counts ? `Counts: ${JSON.stringify(analysis.counts)}` : undefined,
    analysis.termCounts ? `Term counts: ${JSON.stringify(analysis.termCounts)}` : undefined,
    analysis.termCountsNextRequest
      ? `More term counts: ${JSON.stringify(analysis.termCountsNextRequest)}`
      : undefined,
    analysis.matchesRequest
      ? `Matches request: ${JSON.stringify(analysis.matchesRequest)}`
      : undefined,
    analysis.changes ? `Changes: ${JSON.stringify(analysis.changes)}` : undefined,
    analysis.scope ? `Scope: ${JSON.stringify(analysis.scope)}` : undefined,
    analysis.chunks ? `Chunks: ${JSON.stringify(analysis.chunks)}` : undefined,
    analysis.coverage ? `Coverage: ${JSON.stringify(analysis.coverage)}` : undefined,
    analysis.stats ? `Stats: ${JSON.stringify(analysis.stats)}` : undefined,
    analysis.sourceGeneration
      ? `Source generation: ${JSON.stringify(analysis.sourceGeneration)}`
      : undefined,
    analysis.semanticJudge
      ? `Semantic judge: ${JSON.stringify(analysis.semanticJudge)}`
      : undefined,
    details.operation ? `Operation: ${JSON.stringify(details.operation)}` : undefined,
    analysis.kind === "outline" && analysis.modelOutput
      ? "[Outline signatures are deferred; use version-checked inspection for source excerpts.]"
      : undefined,
    ...analysis.reasons.map((reason) => `[${reason}]`),
    details.redactionApplied ? "[Display redaction applied.]" : undefined,
  ].filter((line): line is string => line !== undefined);
}

function compactRows(analysis: AnalysisDetails): string[] {
  const rows: string[] = [];
  let previousPath: string | undefined;
  for (const item of analysis.items) {
    if (item.path !== previousPath) {
      rows.push(JSON.stringify(item.path));
      previousPath = item.path;
    }
    const label = analysis.kind === "outline" && analysis.modelOutput ? item.label : "metadata";
    const semanticJudge = item.details?.semanticJudge;
    const judgment =
      isRecord(semanticJudge) &&
      typeof semanticJudge.classification === "string" &&
      typeof semanticJudge.probability === "number" &&
      typeof semanticJudge.model === "string"
        ? ` Jev: ${semanticJudge.classification}; probability=${String(semanticJudge.probability)};${typeof semanticJudge.confidence === "number" ? ` confidence=${String(semanticJudge.confidence)};` : ""} model=${JSON.stringify(semanticJudge.model)}.`
        : "";
    rows.push(`#${String(item.index)} L${String(item.line)} ${label}${judgment}`);
  }
  return rows;
}

function compactInspectInstruction(analysis: AnalysisDetails): string | undefined {
  if (analysis.inspectCursor)
    return `Inspect item #N: mode="inspect", cursor=${JSON.stringify(analysis.inspectCursor)}, matchIndex=N.`;
  const inspect = analysis.items.find((item) => item.inspect !== undefined)?.inspect;
  if (!inspect || typeof inspect.cursor !== "string") return undefined;
  return `Inspect item #N: mode="inspect", cursor=${JSON.stringify(inspect.cursor)}, matchIndex=N${inspect.redact ? ", redact=true" : ""}.`;
}

function compactHeader(details: SiftLightDetails, analysis: AnalysisDetails): string {
  if (
    analysis.termCounts &&
    analysis.termCountsOffset !== undefined &&
    analysis.totalTerms !== undefined
  ) {
    const start = analysis.termCountsOffset + 1;
    const end = analysis.termCountsOffset + analysis.termCounts.length;
    return `${analysis.kind} term inventory ${String(start)}–${String(end)} of ${String(analysis.totalTerms)} (${details.status}).`;
  }
  const first = analysis.items[0]?.index;
  const last = analysis.items.at(-1)?.index;
  const shown =
    first === undefined || last === undefined
      ? "showing none"
      : `showing #${String(first)}–#${String(last)}`;
  return `${analysis.kind}: ${String(analysis.totalItems)} retained ${analysis.unit} (${details.status}); ${shown}.`;
}

function distinctNextRequest(
  details: SiftLightDetails,
  analysis: AnalysisDetails,
): string | undefined {
  if (!details.nextRequest) return undefined;
  const serialized = JSON.stringify(details.nextRequest);
  return serialized === JSON.stringify(analysis.termCountsNextRequest) ||
    serialized === JSON.stringify(analysis.matchesRequest)
    ? undefined
    : serialized;
}

export function compactMcpModelText(result: SiftLightResult): string {
  const analysis = result.details.analysis;
  // Validation is a source-state report, not a pageable syntax/result inventory.
  // Its authoritative text retains freshness, comparison target and check interval.
  if (!analysis || analysis.kind === "validate") return result.text;
  const header = compactHeader(result.details, analysis);
  const inspect = compactInspectInstruction(analysis);
  const nextRequest = distinctNextRequest(result.details, analysis);
  const compact = [
    header,
    ...compactMetadata(result.details, analysis),
    ...compactRows(analysis),
    ...(inspect ? [inspect] : []),
    ...(nextRequest ? [`Next request: ${nextRequest}`] : []),
  ].join("\n");
  const standard = result.text.replace(" Structured output retains per-item evidence details.", "");
  if (analysis.semanticJudge) return compact;
  return Buffer.byteLength(compact) < Buffer.byteLength(standard) ? compact : standard;
}
