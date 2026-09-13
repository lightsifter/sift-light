import {
  DEFAULT_RESULT_TOKEN_BUDGET,
  ESTIMATED_CHARACTERS_PER_TOKEN,
  MAX_RESULT_BYTES,
} from "./types.js";
import type { ResultStatistics, SearchSnapshot } from "./types.js";
import { formatStatistics, statisticsForSnapshot } from "./result-statistics.js";

const METADATA_BYTES = 1024;
const METADATA_CHARACTERS = 512;

/** File navigation gets its budget before optional statistical sections. */
export function formatSummary(
  snapshot: SearchSnapshot,
  fileLimit: number,
  offset = 0,
  resultTokenBudget = DEFAULT_RESULT_TOKEN_BUDGET,
): {
  body: string;
  statistics: ResultStatistics;
  statisticsText: string[];
  shown: number;
  offset: number;
  nextOffset: number;
  hasNext: boolean;
  omitted: number;
  shownPaths: string[];
} {
  if (!Number.isSafeInteger(fileLimit) || fileLimit <= 0)
    throw new Error("Summary file limit must be a positive safe integer");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > snapshot.fileCounts.size)
    throw new Error("Summary offset is outside the file summary");
  if (!Number.isSafeInteger(resultTokenBudget) || resultTokenBudget <= 0)
    throw new Error("Result token budget must be a positive safe integer");

  const statistics = statisticsForSnapshot(snapshot);
  const statisticsText = formatStatistics(statistics, { includeTopFiles: false });
  const files = [...snapshot.fileCounts.entries()].toSorted(
    ([left, leftCount], [right, rightCount]) => rightCount - leftCount || left.localeCompare(right),
  );
  const maxCharacters = Math.max(
    256,
    resultTokenBudget * ESTIMATED_CHARACTERS_PER_TOKEN - METADATA_CHARACTERS,
  );
  const maxBytes = MAX_RESULT_BYTES - METADATA_BYTES;
  const rows: string[] = [];
  const shownPaths: string[] = [];
  let bytes = Buffer.byteLength(statisticsText.join("\n"));
  let characters = statisticsText.join("\n").length;
  for (const [file, count] of files.slice(offset, offset + Math.min(30, fileLimit))) {
    const row = `${file}  ${String(count).padStart(6)}`;
    if (bytes + Buffer.byteLength(row) + 1 > maxBytes) {
      if (!rows.length)
        throw new Error("A file summary row exceeds the response byte budget; narrow the path");
      break;
    }
    if (rows.length && characters + row.length + 1 > maxCharacters) break;
    rows.push(row);
    shownPaths.push(file);
    bytes += Buffer.byteLength(row) + 1;
    characters += row.length + 1;
  }
  const nextOffset = offset + rows.length;
  return {
    body: rows.join("\n"),
    statistics,
    statisticsText,
    shown: rows.length,
    offset,
    nextOffset,
    hasNext: nextOffset < files.length,
    omitted: files.length - nextOffset,
    shownPaths,
  };
}
