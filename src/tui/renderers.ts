import { type Component } from "@earendil-works/pi-tui";
import type { SiftlightLocale } from "../config.js";
import type { SiftlightInput } from "../service.js";
import type { SiftlightDetails } from "../types.js";
import { dashboard } from "./dashboard.js";
import { fit, renderDashboard, renderSiftlightCallLines, type SiftlightTheme } from "./layout.js";

export interface SiftlightToolResult {
  content: { type: string; text?: string }[];
  details?: SiftlightDetails;
  isError?: boolean;
}
export interface SiftlightRenderOptions {
  expanded: boolean;
  isError: boolean;
  isPartial: boolean;
}

function component(render: (width: number) => string[], locale: SiftlightLocale): Component {
  return {
    render(width) {
      try {
        return render(width);
      } catch {
        return fit(
          [locale === "zh-CN" ? "结果显示失败，请重试" : "Result display failed; retry"],
          width,
        );
      }
    },
    invalidate() {},
  };
}

function failure(text: string, locale: SiftlightLocale): string {
  const zh = locale === "zh-CN";
  if (/expired|cursor.*invalid/i.test(text))
    return zh ? "结果已过期，请重新搜索" : "Results expired; run the search again";
  if (/permission|access denied|EACCES/i.test(text))
    return zh ? "无法访问文件，请检查权限" : "Cannot access files; check permissions";
  if (/not found|ENOENT/i.test(text))
    return zh ? "未找到目标，请检查文件路径" : "Target not found; check the file path";
  if (/cancel/i.test(text)) return zh ? "搜索已取消" : "Search cancelled";
  if (/timeout|deadline/i.test(text))
    return zh ? "搜索超时，请缩小范围重试" : "Search timed out; narrow the search";
  return zh ? "搜索未完成，请检查搜索条件后重试" : "Search failed; check the query and retry";
}

export function renderSiftlightCall(
  input: SiftlightInput,
  locale: SiftlightLocale,
  theme: SiftlightTheme,
): Component {
  return component((width) => renderSiftlightCallLines(input, locale, theme, width), locale);
}

export function renderSiftlightResult(
  result: SiftlightToolResult,
  options: SiftlightRenderOptions,
  locale: SiftlightLocale,
  theme: SiftlightTheme,
): Component {
  return component((width) => {
    const zh = locale === "zh-CN";
    const text = result.content
      .filter((item) => item.type === "text")
      .map((item) => item.text ?? "")
      .join("\n");
    const state = result.details?.operation?.state ?? result.details?.status;
    if (
      options.isError ||
      result.isError ||
      state === "failed" ||
      state === "cancelled" ||
      state === "expired"
    ) {
      return fit(
        [
          theme.fg("error", zh ? "! 搜索未完成" : "! Search incomplete"),
          failure(state === "cancelled" || state === "expired" ? state : text, locale),
        ],
        width,
      );
    }
    if (options.isPartial || state === "running" || state === "waiting") {
      // The worker reports phase-local counts, not an overall completion percentage.
      return fit(
        [
          theme.fg("accent", zh ? "◌ 正在搜索…" : "◌ Searching…"),
          theme.fg("muted", zh ? "等待搜索结果" : "Waiting for results"),
        ],
        width,
      );
    }
    const view = dashboard(text, result.details);
    if (!view)
      return fit(
        [
          theme.fg("warning", zh ? "无法展示结果统计" : "Result statistics unavailable"),
          theme.fg("muted", zh ? "请重试搜索" : "Retry the search"),
        ],
        width,
      );
    return renderDashboard(view, locale, theme, width, options.expanded);
  }, locale);
}
