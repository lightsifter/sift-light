import type { SiftLightLocale } from "./config.js";
import { SIFT_LIGHT_VERSION } from "./package-version.js";
import type { SiftLightInput } from "./service.js";
import type { SiftLightResult } from "./types.js";

export const SESSION_STATUS_KEY = "sift-light_session";

export interface SessionSummarySnapshot {
  queries: number;
  completeQueries: number;
  partialQueries: number;
  organizedQueries: number;
  failedCalls: number;
}

function isNewQuery(input: SiftLightInput): boolean {
  return (
    input.cursor === undefined &&
    input.sourceCursor === undefined &&
    input.operationId === undefined
  );
}

function wasAutomaticallyOrganized(input: SiftLightInput, result: SiftLightResult): boolean {
  const autoMode = input.mode === undefined || input.mode === "auto";
  return autoMode && input.limit === undefined && result.details.summaryFilesShown !== undefined;
}

function formatChineseCompleteness(snapshot: SessionSummarySnapshot): string {
  const { completeQueries, partialQueries, queries } = snapshot;
  if (queries === 0) return "暂无成功查询";
  const unfinishedQueries = queries - completeQueries - partialQueries;
  if (completeQueries > 0 && partialQueries === 0 && unfinishedQueries === 0) return "结果全部完整";
  const parts: string[] = [];
  if (completeQueries > 0) parts.push(`${String(completeQueries)} 次结果完整`);
  if (partialQueries > 0) parts.push(`${String(partialQueries)} 次仅获得部分结果并已明确标注`);
  if (unfinishedQueries > 0) parts.push(`${String(unfinishedQueries)} 次结果尚未完成`);
  return parts.join("；");
}

function formatEnglishCompleteness(snapshot: SessionSummarySnapshot): string {
  const { completeQueries, partialQueries, queries } = snapshot;
  if (queries === 0) return "no successful queries";
  const unfinishedQueries = queries - completeQueries - partialQueries;
  if (completeQueries > 0 && partialQueries === 0 && unfinishedQueries === 0)
    return "all results complete";
  const parts: string[] = [];
  if (completeQueries > 0) parts.push(`${String(completeQueries)} complete`);
  if (partialQueries > 0) parts.push(`${String(partialQueries)} partial and clearly marked`);
  if (unfinishedQueries > 0) parts.push(`${String(unfinishedQueries)} not yet complete`);
  return parts.join("; ");
}
export class SessionSummary {
  #snapshot: SessionSummarySnapshot = {
    queries: 0,
    completeQueries: 0,
    partialQueries: 0,
    organizedQueries: 0,
    failedCalls: 0,
  };

  record(input: SiftLightInput, result: SiftLightResult): void {
    if (!isNewQuery(input)) return;
    this.#snapshot.queries += 1;
    if (result.details.status === "complete") this.#snapshot.completeQueries += 1;
    if (result.details.status === "partial") this.#snapshot.partialQueries += 1;
    if (wasAutomaticallyOrganized(input, result)) this.#snapshot.organizedQueries += 1;
  }

  recordFailure(): void {
    this.#snapshot.failedCalls += 1;
  }

  get snapshot(): SessionSummarySnapshot {
    return { ...this.#snapshot };
  }

  format(locale: SiftLightLocale): string | undefined {
    const { failedCalls, organizedQueries, queries } = this.#snapshot;
    if (queries === 0 && failedCalls === 0) return undefined;
    if (locale === "zh-CN") {
      const organized =
        organizedQueries > 0 ? `；${String(organizedQueries)} 次结果已自动按文件整理` : "";
      const failures = failedCalls > 0 ? `；${String(failedCalls)} 次调用失败` : "";
      return `sift-light ${SIFT_LIGHT_VERSION}：已处理 ${String(queries)} 次查询，${formatChineseCompleteness(this.#snapshot)}${organized}${failures}`;
    }
    const queryWord = queries === 1 ? "query" : "queries";
    let organized = "";
    if (organizedQueries > 0) {
      const resultWord = organizedQueries === 1 ? "result" : "results";
      organized = `; ${organizedQueries} ${resultWord} automatically organized by file`;
    }
    let failures = "";
    if (failedCalls > 0) {
      const callWord = failedCalls === 1 ? "call" : "calls";
      failures = `; ${failedCalls} failed ${callWord}`;
    }
    return `sift-light ${SIFT_LIGHT_VERSION}: handled ${String(queries)} ${queryWord}; ${formatEnglishCompleteness(this.#snapshot)}${organized}${failures}`;
  }
}
