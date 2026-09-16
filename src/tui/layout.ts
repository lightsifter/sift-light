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

/** Left margin that keeps the dashboard off the terminal edge. */
const GUTTER = 2;
/** The path column stops growing here so counts and bars stay near the left. */
const PATH_COLUMN_MAX = 56;
const PATH_COLUMN_MIN = 16;

function prefixWithin(text: string, width: number): string {
  let out = "";
  let used = 0;
  for (const character of text) {
    const size = visibleWidth(character);
    if (used + size > width) break;
    out += character;
    used += size;
  }
  return out;
}

function suffixWithin(text: string, width: number): string {
  const characters = Array.from(text);
  let out = "";
  let used = 0;
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const character = characters[index] ?? "";
    const size = visibleWidth(character);
    if (used + size > width) break;
    out = character + out;
    used += size;
  }
  return out;
}

/**
 * Drop the middle of an over-long path instead of its tail. The tail carries the
 * basename, which is what distinguishes sibling files such as `README.md` and
 * `README.zh.md`; an end truncation would render those rows identical.
 */
export function truncatePath(text: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(text) <= width) return text;
  if (width <= 2) return prefixWithin(text, width);
  const budget = width - 1;
  const head = Math.ceil(budget * 0.4);
  return `${prefixWithin(text, head)}…${suffixWithin(text, budget - head)}`;
}

function indent(lines: string[], gutter: number): string[] {
  if (gutter <= 0) return lines;
  const pad = " ".repeat(gutter);
  return lines.map((line) => (line.length === 0 ? line : pad + line));
}

export function renderDashboard(
  view: Dashboard,
  locale: SignalGrepLocale,
  theme: SignalGrepTheme,
  width: number,
  expanded: boolean,
): string[] {
  if (width <= 0) return [];
  const gutter = width > GUTTER ? GUTTER : 0;
  const content = width - gutter;
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
  const lines = [
    view.partial ? theme.fg("warning", `! ${state}`) : candy(theme, 3, `✓ ${state}`),
    "",
  ];
  const number = String(view.total);
  const digitWidth = number.length * 4;
  const metrics = [
    `${number} ${units[view.unit]}`,
    `${String(view.files)} ${zh ? "个文件" : "files"}`,
  ];
  const limit = expanded ? 30 : content >= 60 ? 6 : 3;
  const rows = view.rows.slice(0, limit);
  const max = Math.max(...view.rows.map((row) => row.matches), 1);
  const countWidth = Math.max(...rows.map((row) => String(row.matches).length), 1);
  const barWidth = content >= 44 ? Math.min(18, Math.floor(content / 4)) : 0;
  // The path column is capped instead of absorbing every spare column: filling
  // the terminal pushed each count and bar to the far right edge, where they
  // read as a detached column rather than as this row's statistics.
  const reserved = countWidth + barWidth + (barWidth ? 6 : 4);
  const pathCap = Math.max(PATH_COLUMN_MIN, Math.min(PATH_COLUMN_MAX, Math.floor(content / 2)));
  const pathWidth = Math.max(1, Math.min(content - reserved, pathCap));
  const tableWidth = 2 + pathWidth + 2 + countWidth + 2 + barWidth;
  const strip = (cells: number): string => {
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
    return segments.join("") + theme.fg("borderMuted", "─".repeat(cells - occupied));
  };
  const title = view.pageOnly
    ? zh
      ? "本页文件分布"
      : "Files on this page"
    : zh
      ? "文件分布"
      : "File distribution";
  const numerals: string[] = [];
  if (content >= digitWidth + 22 && content >= 44) {
    for (let index = 0; index < 3; index += 1) {
      const glyph = Array.from(number, (digit, position) =>
        candy(theme, position, DIGITS[Number(digit)]?.[index] ?? "   "),
      ).join(" ");
      numerals.push(`${glyph}   ${index === 0 ? metrics[0] : index === 1 ? metrics[1] : ""}`);
    }
  } else numerals.push(theme.bold(metrics.join(" · ")));
  // Block digits already make the overview three rows tall. The distribution
  // strip is the only element wide enough to fill the empty corner beside them,
  // so it moves up here and both columns end on the table's right edge.
  const overview = ((): string[] | undefined => {
    if (rows.length === 0 || view.inspection || barWidth === 0) return undefined;
    const leftWidth = Math.max(...numerals.map((line) => visibleWidth(line)));
    const rightWidth = Math.min(tableWidth, content) - leftWidth - 3;
    if (rightWidth < 24) return undefined;
    const right = [theme.fg("text", title), strip(rightWidth), ""];
    return numerals.map((line, index) => {
      const pad = " ".repeat(Math.max(0, leftWidth - visibleWidth(line)));
      return `${line}${pad}   ${right[index] ?? ""}`.trimEnd();
    });
  })();
  if (overview) lines.push(...overview, "");
  else {
    lines.push(...numerals);
    if (rows.length > 0) {
      lines.push("", theme.fg("text", title));
      if (content >= 44 && !view.inspection) lines.push(strip(Math.min(content, tableWidth)), "");
    }
  }
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
  if (rows.length) {
    for (const [index, row] of rows.entries()) {
      const name = truncatePath(safeLabel(row.path), pathWidth);
      const label = name + " ".repeat(Math.max(0, pathWidth - visibleWidth(name)));
      const count = String(row.matches).padStart(countWidth);
      const bar = barWidth
        ? `  ${"█".repeat(Math.max(row.matches > 0 ? 1 : 0, Math.round((row.matches / max) * barWidth)))}`
        : "";
      lines.push(
        `${candy(theme, index, "▎")} ${label}  ${theme.bold(count)}${candy(theme, index, bar)}`,
      );
    }
    // Both notes describe the same list from different angles; stacking them as
    // separate short sentences read as loose leftover text under the table.
    const hidden = view.rows.length - rows.length;
    const parts: string[] = [];
    if (hidden > 0)
      parts.push(
        `${zh ? "另有" : "Another"} ${String(hidden)} ${zh ? "个文件未展示" : "files not shown"}`,
      );
    if (view.files > view.rows.length)
      parts.push(
        zh
          ? `已展示 ${String(view.rows.length)}/${String(view.files)} 个文件`
          : `Showing ${String(view.rows.length)}/${String(view.files)} files`,
      );
    if (parts.length > 0) {
      const hint = hidden > 0 ? (zh ? "展开查看更多" : "expand to see more") : "";
      const full = [...parts, ...(hint ? [hint] : [])].join(" · ");
      const short = parts.join(" · ");
      lines.push("");
      if (visibleWidth(full) <= content) lines.push(theme.fg("text", full));
      else if (visibleWidth(short) <= content) lines.push(theme.fg("text", short));
      // Only a terminal this narrow still splits the notes; a truncated single
      // line would cut the retained/total counts mid-number.
      else lines.push(...parts.map((part) => theme.fg("text", part)));
    }
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
  return fit(indent(lines, gutter), width);
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
  if (width <= 0) return [];
  const gutter = width > GUTTER ? GUTTER : 0;
  return fit(
    indent(
      [
        `${theme.fg("accent", theme.bold("baoer_signal_grep"))}  ${action}`,
        ...(input.path ? [theme.fg("text", safeLabel(input.path))] : []),
      ],
      gutter,
    ),
    width,
  );
}
