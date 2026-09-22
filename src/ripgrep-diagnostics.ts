import { resolve } from "node:path";
import { RipgrepInputError, type RipgrepInputErrorCode } from "./errors.js";
import { redactDiagnosticText } from "./redaction.js";

export interface RipgrepUnreadableDiagnostic {
  message: string;
  path?: string;
}

export interface RipgrepDiagnostics {
  unreadable: RipgrepUnreadableDiagnostic[];
  other: string[];
}

const UNREADABLE_SUFFIX = /:\s+Permission denied(?:\s+\(os error 13\))?\s*$/iu;
const UNREADABLE_CODE = /\(os error 13\)\s*$/iu;
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

export function createRipgrepInputError(
  stderr: string,
  redact = false,
): RipgrepInputError | undefined {
  const code = classifyRipgrepInputFailure(stderr);
  if (code === "E_REGEX_INVALID") {
    return new RipgrepInputError(
      code,
      "ripgrep regex parse error: pattern is not a valid regular expression.",
      "Correct pattern or set literal=true for source text; no automatic literal conversion was attempted.",
    );
  }
  if (code === "E_SEARCH_PATH_NOT_FOUND") {
    const path = missingPathFromDiagnostics(stderr);
    const location = path ? ` (${JSON.stringify(boundedRipgrepDiagnostic(path, redact))})` : "";
    return new RipgrepInputError(
      code,
      `A searched path${location} does not exist or became unavailable.`,
      "Provide an existing exact path, or use mode=files with query to discover an unknown filename; no retry or scope expansion was attempted.",
    );
  }
  // Known input failures above intentionally omit ripgrep's raw pattern and path echo.
  return undefined;
}

function unreadablePath(line: string, suffix: RegExp): string | undefined {
  const match = suffix.exec(line);
  if (!match || match.index === undefined) return undefined;
  const prefix = line.slice(0, match.index).trim();
  const separator = prefix.indexOf(": ");
  const path = (separator < 0 ? prefix : prefix.slice(separator + 2)).trim();
  return path.replace(/^['"]|['"]$/gu, "") || undefined;
}

export function classifyRipgrepDiagnostics(stderr: string): RipgrepDiagnostics {
  const unreadable: RipgrepUnreadableDiagnostic[] = [];
  const other: string[] = [];
  for (const line of diagnosticLines(stderr)) {
    const path = unreadablePath(line, UNREADABLE_SUFFIX);
    if (path !== undefined || UNREADABLE_CODE.test(line)) {
      unreadable.push({ message: line, ...(path ? { path } : {}) });
    } else {
      other.push(line);
    }
  }
  return { unreadable, other };
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
