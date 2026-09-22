import type { AnalysisItem, AnalysisDetails } from "./analysis-types.js";
import type { SiftLightDetails, SiftLightResult } from "./types.js";
import type {
  ValidationDetails,
  EvidenceSourceStatus,
  EvidenceSourceScope,
} from "./validation-types.js";
import type { SavedEvidenceValidationResult } from "./evidence-validation.js";

function sourceItem(status: EvidenceSourceStatus, index: number): AnalysisItem {
  return {
    path: status.path,
    line: 1,
    label: `source ${status.status}`,
    details: {
      role: status.role,
      status: status.status,
      ...(status.reason ? { reason: status.reason } : {}),
      index,
    },
  };
}

function publicSourceStatus(status: EvidenceSourceStatus): EvidenceSourceStatus {
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

function sourceStatusRank(status: EvidenceSourceStatus["status"]): number {
  return status === "stale" ? 0 : status === "unknown" ? 1 : 2;
}

export function publicValidationDetails(
  scope: EvidenceSourceScope,
  sources: readonly EvidenceSourceStatus[],
  values: Partial<ValidationDetails> &
    Pick<
      ValidationDetails,
      "freshness" | "coverage" | "truncation" | "comparisonTarget" | "checkInterval"
    >,
): ValidationDetails {
  const ordered = [...sources].toSorted((left, right) => {
    return (
      sourceStatusRank(left.status) - sourceStatusRank(right.status) ||
      left.path.localeCompare(right.path)
    );
  });
  const visible: EvidenceSourceStatus[] = [];
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

function base(
  mode: "validate",
  status: "complete" | "partial",
  total: number,
  files: number,
  returned = total,
): SiftLightDetails {
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

export function validationResult(
  state: SavedEvidenceValidationResult,
  cursor: string,
  checkInterval: { start: number; end: number; selected?: number },
): SiftLightResult {
  const { recheck, comparisonTarget, coverage } = state;
  const status =
    state.storedPartial || coverage === "partial" || recheck.validity !== "current"
      ? "partial"
      : "complete";
  const reasons = [...new Set([...(state.reasons ?? []), ...recheck.reasons])];
  const validation = publicValidationDetails(state.scope, recheck.sources, {
    comparisonTarget,
    freshness: recheck.validity,
    coverage,
    truncation: { truncated: state.storedPartial, reasons },
    checkInterval,
  });
  const analysis: AnalysisDetails = {
    kind: "validate",
    unit: "evidence-items",
    totalItems: recheck.sources.length,
    returnedItems: validation.checked.length + validation.unchecked.length,
    items: [...validation.checked, ...validation.unchecked].map((source, index) =>
      Object.assign(sourceItem(source, index + 1), { index: index + 1 }),
    ),
    reasons,
    validation,
  };
  const details: SiftLightDetails = {
    ...base(
      "validate",
      status,
      recheck.sources.length,
      new Set(recheck.sources.map((source) => source.path)).size,
      validation.checked.length + validation.unchecked.length,
    ),
    cursor,
    analysis,
    validation,
  };
  const sourceRows = [...validation.checked, ...validation.unchecked].map(
    (source, index) =>
      `#${String(index + 1)} ${JSON.stringify(source.path)}: ${source.status}${source.reason ? ` (${source.reason})` : ""}`,
  );
  return {
    text: `Evidence validation is ${recheck.validity}; checked ${String(validation.checked.length)} source(s), ${String(validation.unchecked.length)} require attention; coverage ${coverage}; target ${comparisonTarget}; check interval ${String(checkInterval.start)}-${String(checkInterval.end)}.${validation.sourceOmitted ? ` ${String(validation.sourceOmitted)} source(s) omitted from this page.` : ""}${reasons.length ? ` ${reasons.join(" ")}` : ""}${sourceRows.length ? `\n${sourceRows.join("\n")}` : ""}`,
    details,
  };
}
