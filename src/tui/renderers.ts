import { type Component } from "@earendil-works/pi-tui";
import type { SignalGrepLocale } from "../config.js";
import type { SignalGrepInput } from "../service.js";
import type { SignalGrepDetails } from "../types.js";
import { dashboard } from "./dashboard.js";
import { fit, renderDashboard, renderSignalGrepCallLines, type SignalGrepTheme } from "./layout.js";

export interface SignalGrepToolResult {
  content: { type: string; text?: string }[];
  details?: SignalGrepDetails;
  isError?: boolean;
}
export interface SignalGrepRenderOptions {
  expanded: boolean;
  isError: boolean;
  isPartial: boolean;
}

function component(render: (width: number) => string[], locale: SignalGrepLocale): Component {
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

function failure(text: string, locale: SignalGrepLocale): string {
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

export function renderSignalGrepCall(
  input: SignalGrepInput,
  locale: SignalGrepLocale,
  theme: SignalGrepTheme,
): Component {
  return component((width) => renderSignalGrepCallLines(input, locale, theme, width), locale);
}

export function renderSignalGrepResult(
  result: SignalGrepToolResult,
  options: SignalGrepRenderOptions,
  locale: SignalGrepLocale,
  theme: SignalGrepTheme,
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
