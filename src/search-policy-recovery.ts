import { isAbsolute, relative, resolve, sep } from "node:path";
import type { SearchKind } from "./search-policy-commands.js";
import { SiftlightError } from "./errors.js";
import { validateRawSearchInput, type RawSearchInput } from "./request.js";
import type { ShellSearchMatch } from "./search-policy-shell.js";

export interface ConcreteSearchRecovery {
  kind: "concrete";
  request: string;
}

export interface ManualSearchRecovery {
  kind: "manual";
  reason: string;
}

export type SearchRecovery = ConcreteSearchRecovery | ManualSearchRecovery;

interface ParsedRipgrepRequest {
  pattern: string;
  path: string;
  literal: boolean;
  ignoreCase: boolean | undefined;
  hidden: boolean;
  wholeWord: boolean;
  glob: string[];
  exclude: string[];
  noConfig: boolean;
  pathWasProvided: boolean;
}

const CONTENT_MANUAL_REASON =
  "the command is not one standalone static rg search using the supported option and single-target subset";
const FILE_MANUAL_REASON =
  "the command is not a plain `find <root> -type f` enumeration, so depth limits, multiple or case-insensitive name predicates, extra tests and other actions cannot be expressed as one files request with the same scope";

function manual(kind: SearchKind): ManualSearchRecovery {
  return { kind: "manual", reason: kind === "files" ? FILE_MANUAL_REASON : CONTENT_MANUAL_REASON };
}

interface ParsedFindRequest {
  root: string;
  glob?: string;
}

function pushGlob(
  value: string,
  include: string[],
  exclude: string[],
  exclusionSeen: boolean,
): boolean | undefined {
  if (value.length === 0 || value.startsWith("\\!") || value.startsWith("!!")) return undefined;
  if (value.startsWith("!")) {
    if (value.length === 1) return undefined;
    exclude.push(value.slice(1));
    return true;
  }
  // The MCP runner applies every exclusion after every inclusion. A later positive rg glob
  // could re-include an earlier exclusion, so that ordering cannot be represented faithfully.
  if (exclusionSeen) return undefined;
  include.push(value);
  return false;
}

function parseRipgrepArguments(args: readonly string[]): ParsedRipgrepRequest | undefined {
  let pattern: string | undefined;
  const paths: string[] = [];
  const glob: string[] = [];
  const exclude: string[] = [];
  let literal = false;
  let ignoreCase: boolean | undefined = false;
  let hidden = false;
  let wholeWord = false;
  let noConfig = false;
  let optionsEnded = false;
  let exclusionSeen = false;

  const takePattern = (value: string): boolean => {
    if (pattern !== undefined) return false;
    pattern = value;
    return true;
  };

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === undefined) return undefined;
    if (optionsEnded || !value.startsWith("-") || value === "-") {
      if (!takePattern(value)) paths.push(value);
      continue;
    }
    if (value === "--") {
      optionsEnded = true;
      continue;
    }
    if (value.startsWith("--")) {
      const separator = value.indexOf("=");
      const option = separator < 0 ? value : value.slice(0, separator);
      const inlineValue = separator < 0 ? undefined : value.slice(separator + 1);
      if (
        [
          "--line-number",
          "--no-line-number",
          "--heading",
          "--no-heading",
          "--with-filename",
          "--no-filename",
        ].includes(option)
      ) {
        if (inlineValue !== undefined) return undefined;
        continue;
      }
      if (option === "--no-config") {
        if (inlineValue !== undefined) return undefined;
        noConfig = true;
        continue;
      }
      if (option === "--fixed-strings" || option === "--no-fixed-strings") {
        if (inlineValue !== undefined) return undefined;
        literal = option === "--fixed-strings";
        continue;
      }
      if (["--ignore-case", "--case-sensitive", "--smart-case"].includes(option)) {
        if (inlineValue !== undefined) return undefined;
        ignoreCase =
          option === "--ignore-case" ? true : option === "--case-sensitive" ? false : undefined;
        continue;
      }
      if (option === "--hidden" || option === "--no-hidden") {
        if (inlineValue !== undefined) return undefined;
        hidden = option === "--hidden";
        continue;
      }
      if (option === "--word-regexp" || option === "--no-word-regexp") {
        if (inlineValue !== undefined) return undefined;
        wholeWord = option === "--word-regexp";
        continue;
      }
      if (option === "--regexp") {
        const next = inlineValue ?? args[index + 1];
        if (next === undefined || !takePattern(next)) return undefined;
        if (inlineValue === undefined) index += 1;
        continue;
      }
      if (option === "--glob") {
        const next = inlineValue ?? args[index + 1];
        if (next === undefined) return undefined;
        const excluded = pushGlob(next, glob, exclude, exclusionSeen);
        if (excluded === undefined) return undefined;
        exclusionSeen ||= excluded;
        if (inlineValue === undefined) index += 1;
        continue;
      }
      if (option === "--color") {
        const next = inlineValue ?? args[index + 1];
        if (next === undefined || !["never", "auto", "always", "ansi"].includes(next))
          return undefined;
        if (inlineValue === undefined) index += 1;
        continue;
      }
      return undefined;
    }

    for (let offset = 1; offset < value.length; offset += 1) {
      const option = value[offset];
      if (option === undefined) return undefined;
      if (["n", "N", "H"].includes(option)) continue;
      if (option === "F") {
        literal = true;
        continue;
      }
      if (option === "i" || option === "s" || option === "S") {
        ignoreCase = option === "i" ? true : option === "s" ? false : undefined;
        continue;
      }
      if (option === "w") {
        wholeWord = true;
        continue;
      }
      if (option === "e") {
        const next = value.slice(offset + 1) || args[index + 1];
        if (next === undefined || !takePattern(next)) return undefined;
        if (value.slice(offset + 1).length === 0) index += 1;
        offset = value.length;
        continue;
      }
      if (option === "g") {
        const next = value.slice(offset + 1) || args[index + 1];
        if (next === undefined) return undefined;
        const excluded = pushGlob(next, glob, exclude, exclusionSeen);
        if (excluded === undefined) return undefined;
        exclusionSeen ||= excluded;
        if (value.slice(offset + 1).length === 0) index += 1;
        offset = value.length;
        continue;
      }
      return undefined;
    }
  }

  if (pattern === undefined || paths.length > 1 || paths[0] === "-") return undefined;
  return {
    pattern,
    path: paths[0] ?? ".",
    literal,
    ignoreCase,
    hidden,
    wholeWord,
    glob,
    exclude,
    noConfig,
    pathWasProvided: paths.length === 1,
  };
}

function listValue(values: readonly string[]): string | string[] | undefined {
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : [...values];
}

function isStandalone(command: string, match: ShellSearchMatch): boolean {
  if (match.nestedDepth > 0) return false;
  const bytes = Buffer.from(command, "utf8");
  if (match.startByte < 0 || match.endByte > bytes.length || match.startByte > match.endByte)
    return false;
  return (
    bytes.subarray(0, match.startByte).toString("utf8").trim().length === 0 &&
    bytes.subarray(match.endByte).toString("utf8").trim().length === 0
  );
}

function isPlatformPathSeparator(character: string): boolean {
  return character === sep || (process.platform === "win32" && character === "/");
}

function hasNormalizationSensitivePath(path: string): boolean {
  if (isPlatformPathSeparator(path.at(-1) ?? "")) return true;
  if (process.platform === "win32" && /^[A-Za-z]:(?![\\/])/u.test(path)) return true;
  const segments = path.split(process.platform === "win32" ? /[\\/]/u : "/");
  let namedSegmentSeen = isAbsolute(path);
  for (const segment of segments) {
    if (segment === "..") return true;
    if (segment === ".") {
      if (namedSegmentSeen) return true;
      continue;
    }
    if (segment.length > 0) namedSegmentSeen = true;
  }
  return false;
}

function isRipgrepExecutable(executable: string, language: ShellSearchMatch["language"]): boolean {
  const name = executable.split(/[\\/]/u).at(-1) ?? executable;
  const normalized =
    language === "powershell" || process.platform === "win32" ? name.toLowerCase() : name;
  return (
    normalized === "rg" ||
    normalized === "ripgrep" ||
    ((language === "powershell" || process.platform === "win32") &&
      (normalized === "rg.exe" || normalized === "ripgrep.exe"))
  );
}

function isFindExecutable(executable: string, language: ShellSearchMatch["language"]): boolean {
  const name = executable.split(/[\\/]/u).at(-1) ?? executable;
  const normalized =
    language === "powershell" || process.platform === "win32" ? name.toLowerCase() : name;
  return (
    normalized === "find" ||
    ((language === "powershell" || process.platform === "win32") && normalized === "find.exe")
  );
}

/** Accepts only `find <root> [-name <pattern>] -type f [-print|-print0]`, in any option order. */
function parseFindArguments(args: readonly string[]): ParsedFindRequest | undefined {
  let root: string | undefined;
  let glob: string | undefined;
  let typeFile = false;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === undefined) return undefined;
    if (!value.startsWith("-") || value === "-") {
      if (root !== undefined) return undefined;
      root = value;
      continue;
    }
    if (value === "-print" || value === "-print0") continue;
    if (value === "-type") {
      const next = args[index + 1];
      if (next === undefined || next !== "f") return undefined;
      index += 1;
      typeFile = true;
      continue;
    }
    if (value === "-name") {
      const next = args[index + 1];
      if (next === undefined || glob !== undefined) return undefined;
      index += 1;
      glob = next;
      continue;
    }
    return undefined;
  }
  if (!typeFile || root === undefined || root.length === 0) return undefined;
  return glob === undefined ? { root } : { root, glob };
}

function recoverFileEnumeration(
  argv: readonly string[],
  language: ShellSearchMatch["language"],
  workingDirectory: string,
): SearchRecovery {
  const executable = argv[0];
  if (executable === undefined || !isFindExecutable(executable, language)) return manual("files");
  const parsed = parseFindArguments(argv.slice(1));
  if (!parsed) return manual("files");
  if (hasNormalizationSensitivePath(parsed.root)) return manual("files");
  const base = resolve(workingDirectory);
  const path = resolve(base, parsed.root);
  const localPath = relative(base, path);
  if (isAbsolute(localPath) || localPath === ".." || localPath.startsWith(`..${sep}`))
    return manual("files");
  if (path.split(/[\\/]/u).some((part) => part.toLowerCase() === ".git")) return manual("files");
  const filters: RawSearchInput = {
    path,
    ...(parsed.glob === undefined ? {} : { glob: parsed.glob }),
  };
  try {
    validateRawSearchInput(filters);
  } catch (error) {
    if (error instanceof SiftlightError) return manual("files");
    throw error;
  }
  return { kind: "concrete", request: JSON.stringify({ mode: "files", ...filters }) };
}

export function recoverShellSearch(
  command: string,
  match: ShellSearchMatch,
  workingDirectory: string | undefined,
): SearchRecovery {
  if (workingDirectory === undefined) return manual(match.kind);
  if (match.hasVariableAssignments || match.hasUntranslatedShellSyntax || match.hasSyntaxError)
    return manual(match.kind);
  const argv: readonly string[] = match.argv.filter((value): value is string => value !== null);
  if (argv.length !== match.argv.length) return manual(match.kind);
  // File enumeration rewrites only the retained `find` expression, so a compound
  // atomic call still reports that nothing ran and the two parts are replayed separately.
  if (match.kind === "files") return recoverFileEnumeration(argv, match.language, workingDirectory);
  if (!isStandalone(command, match)) return manual(match.kind);
  const executable = argv[0];
  if (executable === undefined || !isRipgrepExecutable(executable, match.language))
    return manual(match.kind);
  const parsed = parseRipgrepArguments(argv.slice(1));
  if (!parsed) return manual(match.kind);
  if (!parsed.noConfig && (process.env.RIPGREP_CONFIG_PATH?.length ?? 0) > 0)
    return manual(match.kind);
  if (!parsed.pathWasProvided) return manual(match.kind);
  if (parsed.path.length === 0) return manual(match.kind);
  if (hasNormalizationSensitivePath(parsed.path)) return manual(match.kind);

  const base = resolve(workingDirectory);
  const path = resolve(base, parsed.path);
  const localPath = relative(base, path);
  if (isAbsolute(localPath) || localPath === ".." || localPath.startsWith(`..${sep}`))
    return manual(match.kind);
  if (path.split(/[\\/]/u).some((part) => part.toLowerCase() === ".git")) return manual(match.kind);

  const glob = listValue(parsed.glob);
  const exclude = listValue(parsed.exclude);
  const request: RawSearchInput = {
    pattern: parsed.pattern,
    ...(parsed.literal ? { literal: true } : {}),
    ...(parsed.ignoreCase === undefined ? {} : { ignoreCase: parsed.ignoreCase }),
    ...(parsed.wholeWord ? { wholeWord: true } : {}),
    ...(glob === undefined ? {} : { glob }),
    ...(exclude === undefined ? {} : { exclude }),
    hidden: parsed.hidden,
    path,
    scope: "strict",
  };
  try {
    validateRawSearchInput(request);
  } catch (error) {
    if (error instanceof SiftlightError) return manual(match.kind);
    throw error;
  }
  return { kind: "concrete", request: JSON.stringify(request) };
}
