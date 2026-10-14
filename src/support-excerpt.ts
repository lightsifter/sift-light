import { type ByteRange, type SourceDocument } from "./source-document.js";

export const DEFAULT_SUPPORT_CONTEXT_LINES = 2;

export interface SupportExcerpt {
  excerpt: string;
  selectedExcerpt: string;
  contextBefore?: string;
  contextAfter?: string;
  contextBeforeLines: number;
  contextAfterLines: number;
  hasContext: boolean;
}

/** Context and the selected bytes come from the same verified document. */
export function supportExcerpt(
  document: SourceDocument,
  range: ByteRange,
  contextLines: number,
): SupportExcerpt {
  const selectedExcerpt = document.slice(range);
  const selectedStartLine = document.lineAt(range.start);
  const selectedEndLine = document.lineAt(Math.max(range.start, range.end - 1));
  const startLine = Math.max(1, selectedStartLine - contextLines);
  const totalLines = document.text.endsWith("\n")
    ? Math.max(selectedEndLine, document.lineStarts.length - 1)
    : document.lineStarts.length;
  const endLine = Math.min(totalLines, selectedEndLine + contextLines);
  const contextRange = contextLines > 0 ? document.lineRange(startLine, endLine) : range;
  const contextBefore = document.slice({ start: contextRange.start, end: range.start });
  const contextAfter = document.slice({ start: range.end, end: contextRange.end });
  return {
    excerpt: document.slice(contextRange),
    selectedExcerpt,
    ...(contextBefore.length > 0 ? { contextBefore } : {}),
    ...(contextAfter.length > 0 ? { contextAfter } : {}),
    contextBeforeLines: selectedStartLine - startLine,
    contextAfterLines: endLine - selectedEndLine,
    hasContext: contextRange.start < range.start || contextRange.end > range.end,
  };
}
