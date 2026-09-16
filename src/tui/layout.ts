import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { SignalGrepLocale } from "../config.js";
import type { SignalGrepInput } from "../service.js";
import type { Dashboard } from "./dashboard.js";

import { candy, type SignalGrepTheme } from "./palette.js";
export type { SignalGrepTheme } from "./palette.js";
const DIGITS = [
  ["█▀█", "█ █", "█▄█"],
  ["▄█ ", " █ ", "▄█▄"],
  ["▀▀█", "▄▀▀", "█▄▄"],
  ["▀▀█", " ▀█", "▄▄█"],
  ["█ █", "▀▀█", "  █"],
  ["█▀▀", "▀▀█", "▄▄█"],
  ["█▀▀", "█▀█", "█▄█"],
  ["▀▀█", "  █", "  █"],
  ["█▀█", "█▀█", "█▄█"],
  ["█▀█", "▀▀█", "▄▄█"],
];

export function safeLabel(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, "�");
}

export function fit(lines: string[], width: number): string[] {
  if (width <= 0) return [];
  return lines.map((line) => truncateToWidth(line, width));
}

export function renderDashboard(
  view: Dashboard,
  locale: SignalGrepLocale,
  theme: SignalGrepTheme,
  width: number,
  expanded: boolean,
): string[] {
  const zh = locale === "zh-CN";
  const units = zh
    ? { matches: "处匹配", items: "项结果", files: "个文件", locations: "个位置" }
    : { matches: "matches", items: "items", files: "files", locations: "locations" };
  const state = view.partial
    ? zh
      ? "部分结果"
      : "Partial results"
    : zh
      ? "搜索完成"
      : "Search complete";
  const lines = [view.partial ? theme.fg("warning", `! ${state}`) : candy(theme, 3, `✓ ${state}`)];
  const number = String(view.total);
  const digitWidth = number.length * 4;
  const metrics = [
    `${number} ${units[view.unit]}`,
    `${String(view.files)} ${zh ? "个文件" : "files"}`,
  ];
  if (width >= digitWidth + 22 && width >= 44) {
    for (let row = 0; row < 3; row++) {
      const glyph = Array.from(number, (digit, index) =>
        candy(theme, index, DIGITS[Number(digit)]?.[row] ?? "   "),
      ).join(" ");
      lines.push(`${glyph}   ${row === 0 ? metrics[0] : row === 1 ? metrics[1] : ""}`);
    }
  } else lines.push(theme.bold(metrics.join(" · ")));
  if (view.partial) {
    lines.push(
      theme.fg(
        "warning",
        zh ? "结果不完整，请缩小范围重试" : "Incomplete results; narrow the search",
      ),
    );
    if (view.unit === "matches")
      lines.push(
        theme.fg("warning", `${zh ? "已保留" : "Retained"} ${String(view.stored)}/${number}`),
      );
  }
  const limit = expanded ? 30 : width >= 60 ? 6 : 3;
  const rows = view.rows.slice(0, limit);
  if (rows.length) {
    lines.push(
      "",
      theme.fg(
        "text",
        view.pageOnly
          ? zh
            ? "本页文件分布"
            : "Files on this page"
          : zh
            ? "文件分布"
            : "File distribution",
      ),
    );
    if (width >= 44 && !view.inspection) {
      const cells = Math.min(48, width);
      const shown = rows.reduce((sum, row) => sum + row.matches, 0);
      const denominator = Math.max(view.pageOnly ? shown : view.total, shown, 1);
      let cumulative = 0;
      let occupied = 0;
      const segments = rows.map((row, index) => {
        cumulative += row.matches;
        const end = Math.round((cumulative / denominator) * cells);
        const segment = candy(theme, index, "━".repeat(end - occupied));
        occupied = end;
        return segment;
      });
      lines.push(segments.join("") + theme.fg("borderMuted", "─".repeat(cells - occupied)), "");
    }
    const max = Math.max(...view.rows.map((row) => row.matches), 1);
    const countWidth = Math.max(...rows.map((row) => String(row.matches).length));
    const barWidth = width >= 44 ? Math.min(18, Math.floor(width / 4)) : 0;
    const pathWidth = Math.max(1, width - countWidth - barWidth - (barWidth ? 6 : 4));
    for (const [index, row] of rows.entries()) {
      const name = truncateToWidth(safeLabel(row.path), pathWidth);
      const label = name + " ".repeat(Math.max(0, pathWidth - visibleWidth(name)));
      const count = String(row.matches).padStart(countWidth);
      const bar = barWidth
        ? `  ${"█".repeat(Math.max(row.matches > 0 ? 1 : 0, Math.round((row.matches / max) * barWidth)))}`
        : "";
      lines.push(
        `${candy(theme, index, "▎")} ${label}  ${theme.bold(count)}${candy(theme, index, bar)}`,
      );
    }
    if (view.rows.length > rows.length)
      lines.push(
        theme.fg(
          "text",
          `${zh ? "另有" : "Another"} ${String(view.rows.length - rows.length)} ${zh ? "个文件；展开查看更多" : "files; expand to see more"}`,
        ),
      );
    if (view.files > view.rows.length)
      lines.push(
        theme.fg(
          "text",
          `${zh ? "文件统计展示" : "File statistics shown"} ${String(view.rows.length)}/${String(view.files)}`,
        ),
      );
  } else if (view.total === 0)
    lines.push(theme.fg("text", zh ? "没有找到匹配结果" : "No results found"));
  else lines.push(theme.fg("text", zh ? "本次未提供文件分布" : "File distribution unavailable"));
  if (view.unavailable)
    lines.push(
      theme.fg(
        "warning",
        `${String(view.unavailable)} ${zh ? "个位置未能完成读取" : "locations could not be read"}`,
      ),
    );
  lines.push(
    "",
    theme.fg(
      "text",
      view.more
        ? zh
          ? "还有结果可继续查看"
          : "More results available"
        : view.partial
          ? zh
            ? "本次搜索未覆盖全部结果"
            : "Search coverage is incomplete"
          : zh
            ? "本次返回已结束"
            : "End of this result",
    ),
  );
  return fit(lines, width);
}

export function renderSignalGrepCallLines(
  input: SignalGrepInput,
  locale: SignalGrepLocale,
  theme: SignalGrepTheme,
  width: number,
): string[] {
  const zh = locale === "zh-CN";
  const action =
    input.mode === "inspect"
      ? zh
        ? "查看文件"
        : "Inspect files"
      : input.cursor || input.sourceCursor || input.mode === "await"
        ? zh
          ? "继续查看"
          : "Continue search"
        : input.mode === "cancel"
          ? zh
            ? "停止搜索"
            : "Stop search"
          : zh
            ? "搜索"
            : "Search";
  return fit(
    [
      `${theme.fg("accent", theme.bold("baoer_signal_grep"))}  ${action}`,
      ...(input.path ? [theme.fg("text", safeLabel(input.path))] : []),
    ],
    width,
  );
}
