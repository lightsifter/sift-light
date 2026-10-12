import type { AnalysisItem } from "./analysis-types.js";

function ranks(items: readonly AnalysisItem[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of items) {
    if (!result.has(item.path)) result.set(item.path, result.size + 1);
    if (result.size === 10) break;
  }
  return result;
}

/** File ranks are comparable; raw scores from independent models are not. */
export function rankRetrievalFiles(
  current: readonly AnalysisItem[],
  native: readonly AnalysisItem[],
): string[] {
  const c = ranks(current);
  const n = ranks(native);
  const paths = [...new Set([...n.keys(), ...c.keys()])];
  const score = (path: string): number =>
    (n.has(path) ? 1 / n.get(path)! : 0) + (c.has(path) ? 0.1 / c.get(path)! : 0);
  return paths.toSorted((a, b) => score(b) - score(a)).slice(0, 10);
}
