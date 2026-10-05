import { executableName, type ShellLanguage } from "./search-policy-commands.js";

// Only options whose operands cannot name an input file are accepted here. Unknown
// options fail closed, since grep variants and PowerShell aliases can add file inputs.
const GREP_SWITCHES = new Set("abcEFGHhiILlnoPqsTUuvwxyzZ".split(""));
const GREP_VALUE_OPTIONS = new Set(["A", "B", "C", "m"]);
const GREP_LONG_SWITCHES = new Set([
  "--basic-regexp",
  "--extended-regexp",
  "--fixed-strings",
  "--perl-regexp",
  "--ignore-case",
  "--no-ignore-case",
  "--invert-match",
  "--word-regexp",
  "--line-regexp",
  "--count",
  "--files-with-matches",
  "--files-without-match",
  "--only-matching",
  "--quiet",
  "--silent",
  "--no-messages",
  "--byte-offset",
  "--line-number",
  "--with-filename",
  "--no-filename",
  "--initial-tab",
  "--null",
  "--null-data",
  "--text",
  "--binary",
  "--line-buffered",
  "--no-group-separator",
]);
const GREP_LONG_VALUES = new Set([
  "--after-context",
  "--before-context",
  "--context",
  "--max-count",
  "--binary-files",
  "--label",
  "--group-separator",
  "--include",
  "--exclude",
  "--exclude-dir",
]);

function isStdinOnlyGrep(args: readonly (string | null)[]): boolean {
  const positionals: string[] = [];
  let hasPatternOption = false;
  let optionsEnded = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === null || arg === undefined) return false;
    // Some grep implementations (and GNU grep with POSIXLY_CORRECT) stop option
    // parsing at the first operand. Later option-looking words can be file names.
    if (positionals.length > 0 && arg !== "-") return false;
    if (!optionsEnded && arg === "--") {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && arg.startsWith("--")) {
      const separator = arg.indexOf("=");
      const option = separator < 0 ? arg : arg.slice(0, separator);
      const attached = separator < 0 ? undefined : arg.slice(separator + 1);
      if (option === "--regexp") {
        hasPatternOption = true;
      } else if (option === "--color" || option === "--colour") {
        continue;
      } else if (GREP_LONG_SWITCHES.has(option) && attached === undefined) {
        continue;
      } else if (!GREP_LONG_VALUES.has(option)) {
        return false;
      }
      if (attached === undefined) {
        index += 1;
        if (args[index] === null || args[index] === undefined) return false;
      }
      continue;
    }
    if (!optionsEnded && arg.startsWith("-") && arg !== "-") {
      for (let optionIndex = 1; optionIndex < arg.length; optionIndex += 1) {
        const option = arg[optionIndex];
        if (option === "e") {
          hasPatternOption = true;
        } else if (option !== undefined && GREP_SWITCHES.has(option)) {
          continue;
        } else if (option === undefined || !GREP_VALUE_OPTIONS.has(option)) {
          return false;
        }
        if (optionIndex === arg.length - 1) {
          index += 1;
          if (args[index] === null || args[index] === undefined) return false;
        }
        break;
      }
      continue;
    }
    positionals.push(arg);
  }
  return hasPatternOption
    ? positionals.every((operand) => operand === "-")
    : positionals.length > 0 && positionals.slice(1).every((operand) => operand === "-");
}

const SELECT_STRING_SWITCHES = new Set([
  "simplematch",
  "casesensitive",
  "quiet",
  "list",
  "noemphasis",
  "notmatch",
  "allmatches",
  "raw",
  "verbose",
  "debug",
]);
const SELECT_STRING_VALUES = new Set([
  "culture",
  "encoding",
  "context",
  "erroraction",
  "warningaction",
  "informationaction",
  "outvariable",
  "pipelinevariable",
]);

function isPipelineOnlySelectString(
  args: readonly (string | null)[],
  namedParameters: readonly boolean[],
): boolean {
  let hasPattern = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === null || arg === undefined) return false;
    if (!namedParameters[index]) {
      if (hasPattern) return false; // Further positional values can bind to -Path.
      hasPattern = true;
      continue;
    }
    const separator = arg.indexOf(":");
    const option = (separator < 0 ? arg.slice(1) : arg.slice(1, separator)).toLowerCase();
    if (SELECT_STRING_SWITCHES.has(option) && separator < 0) continue;
    if (option !== "pattern" && !SELECT_STRING_VALUES.has(option)) return false;
    if (option === "pattern") {
      if (hasPattern) return false;
      hasPattern = true;
    }
    if (separator < 0) {
      index += 1;
      if (args[index] === null || args[index] === undefined) return false;
    }
  }
  return hasPattern;
}

/** The exception is for filters consuming the pipeline, never for file operands. */
export function isStdinOnlySearchFilter(
  words: readonly (string | null)[],
  language: ShellLanguage,
  namedParameters: readonly boolean[],
): boolean {
  const executable = words[0];
  if (executable === null || executable === undefined) return false;
  const name = executableName(executable);
  if (language === "powershell")
    return (
      ["select-string", "sls"].includes(name.toLowerCase()) &&
      isPipelineOnlySelectString(words.slice(1), namedParameters.slice(1))
    );
  return ["grep", "egrep", "fgrep"].includes(name) && isStdinOnlyGrep(words.slice(1));
}
