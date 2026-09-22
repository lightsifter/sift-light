import type { SiftLightDetails } from "../types.js";
import { recognizeSiftLightResult, type SummaryRow } from "./presentation.js";

export interface Dashboard {
  total: number;
  files: number;
  unit: "matches" | "items" | "files" | "locations";
  rows: SummaryRow[];
  pageOnly: boolean;
  partial: boolean;
  more: boolean;
  stored: number;
  inspection: boolean;
  unavailable: number;
}

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function grouped(paths: string[]): SummaryRow[] {
  const counts = new Map<string, number>();
  for (const path of paths) counts.set(path, (counts.get(path) ?? 0) + 1);
  return Array.from(counts, ([path, matches]) => ({ path, matches }));
}

/** Derive human statistics without copying any source, labels or protocol instructions. */
export function dashboard(
  text: string,
  details: SiftLightDetails | undefined,
): Dashboard | undefined {
  if (!details || details.version !== 1 || !["complete", "partial"].includes(details.status))
    return undefined;
  if (
    ![
      details.totalMatches,
      details.storedMatches,
      details.totalFiles,
      details.returnedMatches,
    ].every(validCount)
  )
    return undefined;
  const statistics = details.analysis?.statistics ?? details.statistics;
  const inspection = details.mode === "inspect";
  let total = details.analysis?.totalItems ?? details.totalMatches;
  let rows: SummaryRow[] = [];
  let pageOnly = false;
  let unavailable = 0;
  const presentation = recognizeSiftLightResult(text, details);
  if (presentation?.kind === "summary") {
    rows = presentation.rows;
  } else if (statistics && !inspection) {
    rows = statistics.topFiles.map(({ label, count }) => ({ path: label, matches: count }));
  } else if (details.analysis) {
    rows = grouped(details.analysis.items.map((item) => item.path));
    pageOnly = true;
  } else if (inspection) {
    const items = details.inspections;
    const paths =
      items?.flatMap((item) => (item.path ? [item.path] : [])) ??
      details.sourceBlocks?.map((block) => block.path) ??
      (details.source?.reference ? [details.source.reference.path] : []);
    if (paths.length === 0) {
      if (presentation?.kind === "inspect") paths.push(presentation.target.replace(/:\d+$/, ""));
    }
    rows = grouped(paths);
    total = items?.length ?? paths.length;
    unavailable =
      items?.filter((item) => item.status !== "returned").length ??
      (details.status === "partial" ? total : 0);
  } else {
    if (presentation?.kind === "matches") {
      const paths: string[] = [];
      let path: string | undefined;
      for (const line of presentation.bodyLines) {
        if (line && !/^\s/.test(line)) path = line;
        else if (path && /^ \d+:/.test(line)) paths.push(path);
      }
      rows = grouped(paths);
      pageOnly = true;
    }
  }
  if (!validCount(total) || rows.some((row) => !validCount(row.matches))) return undefined;
  return {
    total,
    files: details.totalFiles,
    unit: inspection
      ? "locations"
      : details.analysis?.unit === "files"
        ? "files"
        : details.analysis
          ? "items"
          : "matches",
    rows,
    pageOnly,
    inspection,
    unavailable,
    partial: details.status === "partial" || !details.snapshotComplete || unavailable > 0,
    more: Boolean(
      details.cursor ||
      details.nextRequest ||
      details.source?.nextRequest ||
      details.analysis?.termCountsNextRequest,
    ),
    stored: details.storedMatches,
  };
}
