import { basename, resolve } from "node:path";
import {
  RipgrepInputError,
  type RipgrepInputErrorCode,
  type SiftLightDiagnosticRepairExample,
} from "./errors.js";
import { containsSensitiveText, redactDiagnosticText } from "./redaction.js";
import type { SearchRequest } from "./types.js";

export interface RipgrepUnreadableDiagnostic {
  message: string;
  path?: string;
}

export interface RipgrepDiagnostics {
  unreadable: RipgrepUnreadableDiagnostic[];
  recoverable: RipgrepUnreadableDiagnostic[];
  other: string[];
}

const UNREADABLE_SUFFIX = /:\s+Permission denied(?:\s+\(os error 13\))?\s*$/iu;
const UNREADABLE_CODE = /\(os error 13\)\s*$/iu;
const RECOVERABLE_FILESYSTEM_CODE = /\(os error (?:4|5|22)\)\s*$/iu;
const RECOVERABLE_FILESYSTEM_SUFFIXES = [
  /:\s+Invalid argument(?:\s+\(os error 22\))?\s*$/iu,
  /:\s+Interrupted system call\s*$/iu,
  /:\s+Input\/output error(?:\s+\(os error 5\))?\s*$/iu,
  /:\s+No message available on STREAM\s*$/iu,
] as const;
const INVALID_REGEX_DIAGNOSTIC = /(?:^|\n)\s*(?:rg:\s*)?regex parse error:/iu;
const MISSING_PATH_DIAGNOSTIC =
  /(?:IO error for operation on .+?:\s*)?No such file or directory \(os error 2\)\s*$/iu;
const MAX_RIPGREP_DIAGNOSTIC_CHARACTERS = 4_096;

function diagnosticLines(stderr: string): string[] {
  return stderr
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function boundedRipgrepDiagnostic(value: string, redact = false): string {
  const safe = redact ? redactDiagnosticText(value) : value;
  const normalized = safe.toWellFormed();
  return normalized.length <= MAX_RIPGREP_DIAGNOSTIC_CHARACTERS
    ? normalized
    : `${normalized.slice(0, MAX_RIPGREP_DIAGNOSTIC_CHARACTERS - 1)}…`;
}

/** Classify only stable ripgrep input failures; unknown stderr remains a normal runtime error. */
export function classifyRipgrepInputFailure(stderr: string): RipgrepInputErrorCode | undefined {
  if (INVALID_REGEX_DIAGNOSTIC.test(stderr)) return "E_REGEX_INVALID";
  if (diagnosticLines(stderr).some((line) => MISSING_PATH_DIAGNOSTIC.test(line)))
    return "E_SEARCH_PATH_NOT_FOUND";
  return undefined;
}

function missingPathFromDiagnostics(stderr: string): string | undefined {
  for (const line of diagnosticLines(stderr)) {
    const operation =
      /IO error for operation on (.+?):\s*No such file or directory \(os error 2\)\s*$/iu.exec(
        line,
      );
    if (operation?.[1]) return operation[1].trim();
    const direct = /^rg:\s*(.+?):\s*No such file or directory \(os error 2\)\s*$/iu.exec(line);
    if (direct?.[1]) return direct[1].trim();
  }
  return undefined;
}

export type RipgrepRecoveryRequest = Pick<
  SearchRequest,
  | "pattern"
  | "path"
  | "glob"
  | "exclude"
  | "literal"
  | "ignoreCase"
  | "hidden"
  | "ignorePolicy"
  | "wholeWord"
  | "context"
  | "scope"
  | "redact"
>;

const RIPGREP_RECOVERY_FIELDS = [
  "path",
  "glob",
  "exclude",
  "literal",
  "ignoreCase",
  "hidden",
  "ignorePolicy",
  "wholeWord",
  "context",
  "scope",
  "redact",
] as const satisfies readonly (keyof RipgrepRecoveryRequest)[];

function copyRipgrepRecoveryFields(request: RipgrepRecoveryRequest): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of RIPGREP_RECOVERY_FIELDS) {
    const value = request[field];
    if (value !== undefined) result[field] = value;
  }
  return result;
}

function ripgrepRepairExamples(
  code: RipgrepInputErrorCode,
  request: RipgrepRecoveryRequest | undefined,
  redact: boolean,
): readonly SiftLightDiagnosticRepairExample[] {
  if (request === undefined || (redact && containsSensitiveText(request))) return [];
  if (code === "E_REGEX_INVALID") {
    return [
      {
        label: "按原文查找",
        request: {
          mode: "matches",
          ...copyRipgrepRecoveryFields(request),
          pattern: request.pattern,
          literal: true,
        },
      },
    ];
  }
  if (code === "E_SEARCH_PATH_NOT_FOUND" && request.path !== undefined) {
    const fileName = basename(request.path.replaceAll("\\", "/"));
    if (fileName === "." || fileName === "/" || fileName.length === 0) return [];
    return [
      {
        label: "按文件名查找",
        request: {
          mode: "files",
          query: fileName,
          ...(request.redact === true ? { redact: true } : {}),
        },
      },
    ];
  }
  return [];
}

export function createRipgrepInputError(
  stderr: string,
  redact = false,
  request?: RipgrepRecoveryRequest,
): RipgrepInputError | undefined {
  const code = classifyRipgrepInputFailure(stderr);
  if (code === "E_REGEX_INVALID") {
    return new RipgrepInputError(
      code,
      "ripgrep regex parse error: pattern is not a valid regular expression.",
      "Correct pattern or set literal=true for source text; no automatic literal conversion was attempted.",
      ripgrepRepairExamples(code, request, redact),
    );
  }
  if (code === "E_SEARCH_PATH_NOT_FOUND") {
    const path = missingPathFromDiagnostics(stderr);
    const location = path ? ` (${JSON.stringify(boundedRipgrepDiagnostic(path, redact))})` : "";
    return new RipgrepInputError(
      code,
      `A searched path${location} does not exist or became unavailable.`,
      "Provide an existing exact path, or use mode=files with query to discover an unknown filename; no retry or scope expansion was attempted.",
      ripgrepRepairExamples(code, request, redact),
    );
  }
  // Known input failures above intentionally omit ripgrep's raw pattern and path echo.
  return undefined;
}

function unreadablePath(line: string, suffix: RegExp): string | undefined {
  const match = suffix.exec(line);
  if (!match || match.index === undefined) return undefined;
  const prefix = line.slice(0, match.index).trim();
  if (prefix === "rg") return undefined;
  const separator = prefix.indexOf(": ");
  const path = (separator < 0 ? prefix : prefix.slice(separator + 2)).trim();
  return path.replace(/^['"]|['"]$/gu, "") || undefined;
}

export function classifyRipgrepDiagnostics(stderr: string): RipgrepDiagnostics {
  const unreadable: RipgrepUnreadableDiagnostic[] = [];
  const recoverable: RipgrepUnreadableDiagnostic[] = [];
  const other: string[] = [];
  for (const line of diagnosticLines(stderr)) {
    const path = unreadablePath(line, UNREADABLE_SUFFIX);
    if (path !== undefined || UNREADABLE_CODE.test(line)) {
      unreadable.push({ message: line, ...(path ? { path } : {}) });
      continue;
    }
    const recoverableSuffix = RECOVERABLE_FILESYSTEM_SUFFIXES.find((suffix) => suffix.test(line));
    if (recoverableSuffix || RECOVERABLE_FILESYSTEM_CODE.test(line)) {
      const recoverablePath = recoverableSuffix
        ? unreadablePath(line, recoverableSuffix)
        : undefined;
      recoverable.push({ message: line, ...(recoverablePath ? { path: recoverablePath } : {}) });
      continue;
    }
    other.push(line);
  }
  return { unreadable, recoverable, other };
}

export function hasRequestedRootUnreadable(
  diagnostics: readonly RipgrepUnreadableDiagnostic[],
  cwd: string,
  searchPath: string,
): boolean {
  const expected = resolve(cwd, searchPath);
  return diagnostics.some(
    (diagnostic) => diagnostic.path === undefined || resolve(cwd, diagnostic.path) === expected,
  );
}

export function describeUnreadableDiagnostics(
  diagnostics: readonly RipgrepUnreadableDiagnostic[],
): string {
  const messages = [...new Set(diagnostics.map((diagnostic) => diagnostic.message))];
  return `Ripgrep skipped ${String(messages.length)} unreadable path(s); search coverage is partial: ${messages.join("; ")}`;
}
