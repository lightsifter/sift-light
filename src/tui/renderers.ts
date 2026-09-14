import { Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import type { SignalGrepLocale } from "../config.js";
import type { SignalGrepInput } from "../service.js";
import type { SignalGrepDetails } from "../types.js";
import {
  localizedErrorText,
  renderSignalGrepCallLines,
  localizedSearchingText,
  type SignalGrepTheme,
} from "./layout.js";
import { recognizeSignalGrepResult } from "./presentation.js";

type Theme = SignalGrepTheme;

interface TextContent {
  type: string;
  text?: string;
}

export interface SignalGrepToolResult {
  content: TextContent[];
  details?: SignalGrepDetails;
  isError?: boolean;
}

export interface SignalGrepRenderOptions {
  expanded: boolean;
  isError: boolean;
  isPartial: boolean;
}

function resultText(result: SignalGrepToolResult): string | undefined {
  return result.content.find((item) => item.type === "text" && item.text !== undefined)?.text;
}

function textLines(text: string, width: number): string[] {
  return new Text(text, 0, 0).render(Math.max(1, width));
}

function component(render: (width: number) => string[], fallbackText: string): Component {
  return {
    render(width) {
      try {
        return render(width);
      } catch {
        return textLines(fallbackText, width);
      }
    },
    invalidate() {},
  };
}

interface ErrorLineOptions {
  copy: { hint: string; title: string };
  theme: Theme;
  width: number;
}

function errorLines(options: ErrorLineOptions): string[] {
  const { copy, theme, width } = options;
  const available = Math.max(1, width);
  const lines = [theme.fg("error", theme.bold(`── ${copy.title} ──`)), theme.fg("dim", copy.hint)];
  return lines.map((line) => truncateToWidth(line, available));
}

function renderHumanStats(
  details: SignalGrepDetails,
  locale: SignalGrepLocale,
  theme: Theme,
  width: number,
): string[] {
  const chinese = locale === "zh-CN";
  const title = chinese ? "结果" : "RESULT";
  const status =
    details.status === "complete" ? (chinese ? "完整" : "complete") : chinese ? "部分" : "partial";
  const count = details.analysis?.totalItems ?? details.totalMatches;
  const files = details.totalFiles;
  const unit = details.analysis ? (chinese ? "项" : "items") : chinese ? "处匹配" : "matches";
  const lines = [
    theme.fg("borderMuted", `── ${theme.bold(title)} ──`),
    theme.fg(
      "toolOutput",
      `${String(count)} ${unit} · ${String(files)} ${chinese ? "个文件" : files === 1 ? "file" : "files"} · ${status}`,
    ),
  ];
  if (details.analysis?.statistics) {
    const stats = details.analysis.statistics;
    lines.push(theme.fg("dim", `${chinese ? "统计" : "stats"}: ${String(stats.total)} ${unit}`));
  }
  if (details.cursor || details.nextRequest)
    lines.push(theme.fg("dim", chinese ? "可继续" : "cursor ready"));
  return lines.map((line) => truncateToWidth(line, Math.max(1, width)));
}

export function renderSignalGrepCall(
  input: SignalGrepInput,
  locale: SignalGrepLocale,
  theme: Theme,
): Component {
  return component(
    (width) => renderSignalGrepCallLines(input, locale, theme, width),
    "baoer_signal_grep",
  );
}

export function renderSignalGrepResult(
  result: SignalGrepToolResult,
  options: SignalGrepRenderOptions,
  locale: SignalGrepLocale,
  theme: Theme,
): Component {
  const text = resultText(result);
  if (text === undefined) return new Text("", 0, 0);

  if (result.details?.operation && result.details.operation.state !== "complete") {
    return new Text(theme.fg("warning", text), 0, 0);
  }
  if (options.isPartial) {
    return new Text(theme.fg("warning", localizedSearchingText(locale)), 0, 0);
  }
  if (options.isError) {
    return component(
      (width) =>
        errorLines({
          copy: localizedErrorText(locale),
          theme,
          width,
        }),
      locale === "zh-CN" ? "本次操作未完成。" : "Operation did not complete.",
    );
  }

  let presentation;
  try {
    presentation = recognizeSignalGrepResult(text, result.details);
  } catch {
    return new Text(text, 0, 0);
  }
  if (!presentation)
    return component(
      (width) =>
        renderHumanStats(
          result.details ?? {
            version: 1,
            mode: "auto",
            status: "complete",
            totalMatches: 0,
            storedMatches: 0,
            totalFiles: 0,
            returnedMatches: 0,
            snapshotComplete: true,
          },
          locale,
          theme,
          width,
        ),
      locale === "zh-CN" ? "结果" : "RESULT",
    );
  return component(
    (width) => renderHumanStats(result.details ?? presentation.details, locale, theme, width),
    locale === "zh-CN" ? "结果" : "RESULT",
  );
}
