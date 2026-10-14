import { expect, test } from "bun:test";
import { AnalysisStore } from "../src/analysis-store.js";
import { MAX_ANALYSIS_RESULTS } from "../src/analysis-limits.js";
import type { AnalysisItem } from "../src/analysis-types.js";

const item: AnalysisItem = {
  path: "policy.ts",
  line: 1,
  label: "policy",
  range: { start: 0, end: 1 },
  source: { path: "policy.ts", origin: { kind: "git", commit: "fixture", blob: "fixture" } },
};

test("evidence scope counts retained items after storage limits", () => {
  const store = new AnalysisStore();
  const cursor = store.create({
    kind: "outline",
    unit: "evidence-items",
    partial: false,
    reasons: [],
    items: Array.from({ length: MAX_ANALYSIS_RESULTS + 1 }, () => item),
  });
  const result = store.page(cursor);
  expect(result.details.status).toBe("partial");
  expect(result.details.analysis?.evidenceScope?.exactItems).toBe(MAX_ANALYSIS_RESULTS);
  expect(result.details.analysis?.items[0]?.details?.evidenceScope).toBe("range-only");
});

test("each retrieval lane reports only its own retained evidence scope", () => {
  const store = new AnalysisStore();
  const cursor = store.create({
    kind: "hybrid",
    unit: "evidence-items",
    partial: false,
    reasons: [],
    items: [
      { ...item, details: { retrievalLane: "current", laneRank: 1 } },
      { ...item, details: { retrievalLane: "native", laneRank: 1 } },
    ],
    retrievalLanes: { current: { cursor: "" }, native: { cursor: "" } },
  });
  const root = store.page(cursor);
  expect(root.details.analysis?.evidenceScope?.exactItems).toBe(2);
  for (const lane of ["current", "native"] as const) {
    const request = root.details.analysis?.retrievalLanes?.[lane];
    expect(request).toBeDefined();
    const result = store.page(request!.cursor!);
    expect(result.details.analysis?.totalItems).toBe(1);
    expect(result.details.analysis?.evidenceScope?.exactItems).toBe(1);
  }
});
