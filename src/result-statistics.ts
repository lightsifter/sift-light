import type { AnalysisItem } from "./analysis-types.js";
import type {
  ResultStatistics,
  SearchSnapshot,
  StatisticsEntry,
  StatisticsGroup,
} from "./types.js";

const MAX_BREAKDOWN_ENTRIES = 5;
const MAX_TOP_FILES = 8;

type CountMap = Map<string, number>;

function normalizedPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function extensionOf(value: string): string {
  const path = normalizedPath(value);
  const slash = path.lastIndexOf("/");
  const basename = path.slice(slash + 1);
  const dot = basename.lastIndexOf(".");
  if (dot <= 0) return "[no extension]";
  return basename.slice(dot).toLowerCase();
}

function directoryOf(value: string): string {
  const path = normalizedPath(value);
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "." : `${path.slice(0, slash)}/`;
}

function rankedEntries(counts: CountMap): StatisticsEntry[] {
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .toSorted((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function group(dimension: string, counts: CountMap): StatisticsGroup | undefined {
  const ranked = rankedEntries(counts);
  if (!ranked.length) return undefined;
  return {
    dimension,
    entries: ranked.slice(0, MAX_BREAKDOWN_ENTRIES),
    omitted: Math.max(0, ranked.length - MAX_BREAKDOWN_ENTRIES),
    total: ranked.reduce((sum, entry) => sum + entry.count, 0),
  };
}

function fileCountsFromItems(items: readonly AnalysisItem[]): CountMap {
  const counts: CountMap = new Map();
  for (const item of items) counts.set(item.path, (counts.get(item.path) ?? 0) + 1);
  return counts;
}

function pathsFromCounts(counts: CountMap): string[] {
  return [...counts.keys()];
}

function createStatistics(
  unit: string,
  total: number,
  fileCounts: CountMap,
  extraGroups: readonly StatisticsGroup[] = [],
): ResultStatistics {
  const extensionCounts: CountMap = new Map();
  const directoryCounts: CountMap = new Map();
  for (const path of pathsFromCounts(fileCounts)) {
    extensionCounts.set(
      extensionOf(path),
      (extensionCounts.get(extensionOf(path)) ?? 0) + (fileCounts.get(path) ?? 0),
    );
    directoryCounts.set(
      directoryOf(path),
      (directoryCounts.get(directoryOf(path)) ?? 0) + (fileCounts.get(path) ?? 0),
    );
  }
  const groups = [
    group("file type", extensionCounts),
    group("directory", directoryCounts),
    ...extraGroups,
  ].filter((entry): entry is StatisticsGroup => entry !== undefined);
  const rankedFiles = rankedEntries(fileCounts);
  return {
    unit,
    total,
    files: fileCounts.size,
    directories: new Set(pathsFromCounts(fileCounts).map(directoryOf)).size,
    groups,
    topFiles: rankedFiles.slice(0, MAX_TOP_FILES),
    topFilesOmitted: Math.max(0, rankedFiles.length - MAX_TOP_FILES),
  };
}

export function statisticsForSnapshot(snapshot: SearchSnapshot): ResultStatistics {
  return createStatistics("matches", snapshot.totalMatches, new Map(snapshot.fileCounts));
}

export function statisticsForItems(
  items: readonly AnalysisItem[],
  total: number,
  unit: string,
  extraGroups: readonly StatisticsGroup[] = [],
): ResultStatistics {
  return createStatistics(unit, total, fileCountsFromItems(items), extraGroups);
}

export function statisticsGroup(
  dimension: string,
  entries: readonly StatisticsEntry[],
): StatisticsGroup | undefined {
  if (!entries.length) return undefined;
  const ranked = [...entries].toSorted(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  );
  return {
    dimension,
    entries: ranked.slice(0, MAX_BREAKDOWN_ENTRIES),
    omitted: Math.max(0, ranked.length - MAX_BREAKDOWN_ENTRIES),
    total: ranked.reduce((sum, entry) => sum + entry.count, 0),
  };
}

export function formatStatistics(
  statistics: ResultStatistics,
  options: { includeTopFiles?: boolean } = {},
): string[] {
  const lines = [
    `Result: ${String(statistics.total)} ${statistics.unit} across ${String(statistics.files)} files and ${String(statistics.directories)} directories.`,
  ];
  for (const breakdown of statistics.groups) {
    const entries = breakdown.entries
      .map((entry) => `${entry.label}=${String(entry.count)}`)
      .join(", ");
    const omitted = breakdown.omitted > 0 ? `, +${String(breakdown.omitted)} other categories` : "";
    lines.push(`By ${breakdown.dimension}: ${entries}${omitted}`);
  }
  if (options.includeTopFiles !== false && statistics.topFiles.length) {
    lines.push(
      `Top files: ${statistics.topFiles.map((entry) => `${entry.label}=${String(entry.count)}`).join(", ")}${statistics.topFilesOmitted > 0 ? `, +${String(statistics.topFilesOmitted)} other files` : ""}`,
    );
  }
  return lines;
}

export function analysisExtraGroups(
  counts: Record<string, number> | undefined,
  termCounts: readonly { retainedOccurrences: number }[] | undefined,
  items: readonly AnalysisItem[],
): StatisticsGroup[] {
  const groups: StatisticsGroup[] = [];
  const classification = counts
    ? statisticsGroup(
        "classification",
        Object.entries(counts).map(([label, count]) => ({ label, count })),
      )
    : undefined;
  if (classification) groups.push(classification);
  const terms = termCounts
    ? statisticsGroup(
        "conditions",
        termCounts.map((term, index) => ({
          label: `condition #${String(index + 1)}`,
          count: term.retainedOccurrences,
        })),
      )
    : undefined;
  if (terms) groups.push(terms);
  const evidence = new Map<string, number>();
  for (const item of items) {
    const source = item.details?.source;
    if (source === "literal" || source === "concept")
      evidence.set(source, (evidence.get(source) ?? 0) + 1);
  }
  const evidenceGroup = group("evidence", evidence);
  if (evidenceGroup) groups.push(evidenceGroup);
  return groups;
}
