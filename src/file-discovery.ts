import { basename as platformBasename, posix, relative, resolve, sep } from "node:path";
import type { AnalysisResultSet } from "./analysis-types.js";
import { SiftLightError } from "./errors.js";
import { SearchPathPolicy } from "./path-policy.js";
import { normalizeRequest, type RawSearchInput } from "./request.js";
import { listWorkspaceFiles } from "./workspace-files.js";
import { filterPathsByModificationTime } from "./file-metadata-filter.js";

interface FileScore {
  score: number;
  reason: string;
}
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
/** Bracket classes remain valid query text, so dynamic route names stay searchable. */
const FILE_QUERY_GLOB_WILDCARD = /[*?]/u;
/** Queries such as `*`, `**` or `.*` mean "every file" rather than filename text. */
const FILE_QUERY_MATCH_ALL = /^(?:[*/]+|\.\*|\.\+|\*\.\*)$/u;
/** Regex syntax that cannot be a simple glob; such a query is rejected with guidance. */
const FILE_QUERY_REGEX_SYNTAX = /[()|^$\\+]/u;
const IGNORED_MATCH_SAMPLES = 5;

interface NormalizedFileQuery {
  query: string;
  glob?: string;
  note?: string;
}

/**
 * Filename discovery matches text. A wildcard-only query means "all files" and a
 * plain glob such as `*.py` becomes an explicit glob filter; both are disclosed.
 */
function normalizeFileQuery(query: string, hasGlob: boolean): NormalizedFileQuery {
  const trimmed = query.trim();
  if (FILE_QUERY_MATCH_ALL.test(trimmed))
    return {
      query: "",
      note: `Query ${JSON.stringify(query)} was treated as listing every file under path; omit query for the same result.`,
    };
  if (!FILE_QUERY_GLOB_WILDCARD.test(trimmed)) return { query };
  if (!hasGlob && !FILE_QUERY_REGEX_SYNTAX.test(trimmed) && !/\s/u.test(trimmed)) {
    const glob = trimmed.includes("/") ? trimmed : `**/${trimmed}`;
    return {
      query: "",
      glob,
      note: `Query ${JSON.stringify(query)} contains glob wildcards and was applied as glob ${JSON.stringify(glob)}; mode=files query otherwise matches filename text.`,
    };
  }
  throw new SiftLightError(
    `File query ${JSON.stringify(query)} uses wildcard or regex syntax; mode=files matches filename and path text, not patterns. Omit query to retain every file under path, use glob for one name pattern, or run one files request per name.`,
  );
}

function subsequenceScore(text: string, query: string): number | undefined {
  const characters = Array.from(graphemes.segment(text), (item) => item.segment);
  const queryCharacters = Array.from(graphemes.segment(query), (item) => item.segment);
  let next = 0;
  let first = -1;
  let last = 0;
  for (const character of queryCharacters) {
    const index = characters.indexOf(character, next);
    if (index < 0) return undefined;
    if (first < 0) first = index;
    last = index;
    next = index + 1;
  }
  return Math.round((40 * queryCharacters.length) / Math.max(1, last - first + 1));
}

export function scoreFilePath(path: string, query: string): FileScore | undefined {
  if (!query) return { score: 0, reason: "all admitted files" };
  const normalized = path.toLowerCase();
  const needle = query.toLowerCase();
  const basename = posix.basename(normalized);
  if (basename === needle) return { score: 100, reason: "exact filename" };
  if (basename.slice(0, basename.length - posix.extname(basename).length) === needle)
    return { score: 95, reason: "exact filename stem" };
  if (basename.includes(needle)) return { score: 85, reason: "filename substring" };
  if (normalized.includes(needle)) return { score: 70, reason: "path substring" };
  const terms = needle.trim().split(/\s+/);
  // Several words describe path components, not independent fuzzy character
  // walks through an arbitrarily long build-artifact path.
  if (terms.length > 1) {
    return terms.every((term) => normalized.includes(term))
      ? { score: 60, reason: "all query words occur literally in the path" }
      : undefined;
  }
  const scores = terms.map((term) => subsequenceScore(normalized, term));
  if (scores.some((score) => score === undefined)) return undefined;
  return {
    score: Math.min(...scores.map((score) => score ?? 0)),
    reason: "ordered fuzzy path characters; candidate, not an exact filename",
  };
}

function pathRelativeToDiscoveryRoot(cwd: string, root: string, path: string): string {
  const absoluteRoot = resolve(cwd, root);
  const absolutePath = resolve(cwd, path);
  const scoped = relative(absoluteRoot, absolutePath).split(sep).join("/");
  // A file can itself be the requested root; its basename is the only
  // candidate path and must remain searchable without scoring the root name.
  return scoped || platformBasename(absolutePath);
}

export async function discoverFiles(
  input: RawSearchInput & { query?: string },
  cwd: string,
  signal?: AbortSignal,
): Promise<AnalysisResultSet> {
  const rawQuery = input.query ?? "";
  if (rawQuery.length > 256 || !rawQuery.isWellFormed() || /[\r\n\0]/.test(rawQuery))
    throw new SiftLightError(
      "File query must be well-formed single-line text of at most 256 characters",
    );
  const requestedGlobs =
    input.glob === undefined ? [] : Array.isArray(input.glob) ? input.glob : [input.glob];
  const normalizedQuery = normalizeFileQuery(rawQuery, requestedGlobs.length > 0);
  const query = normalizedQuery.query;
  const request = normalizeRequest({
    ...input,
    pattern: "",
    ...(normalizedQuery.glob ? { glob: [...requestedGlobs, normalizedQuery.glob] } : {}),
  });
  const policy = new SearchPathPolicy(cwd);
  const discoveryRoot = request.path ?? ".";
  const scoringRoot = await policy.resolveSearchTarget(discoveryRoot);
  const includeIgnored = request.ignorePolicy === "include";
  const listOptions = {
    path: scoringRoot,
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden,
  };
  const files = await listWorkspaceFiles(cwd, signal, {
    ...listOptions,
    ...(includeIgnored ? { ignore: false, ignoreParents: false } : {}),
  });
  const filtered = await filterPathsByModificationTime(
    cwd,
    files.paths,
    request.modifiedAfterMs,
    request.modifiedBeforeMs,
    signal,
  );
  const rank = (path: string) =>
    scoreFilePath(pathRelativeToDiscoveryRoot(cwd, scoringRoot, path), query);
  const selected = filtered.paths
    .flatMap((path) => {
      const score = rank(path);
      return score ? [{ path, ...score }] : [];
    })
    .toSorted((left, right) => right.score - left.score || left.path.localeCompare(right.path));
  for (let offset = 0; offset < selected.length; offset += 16) {
    // oxlint-disable-next-line no-await-in-loop -- bounded canonical-path checks enforce the same protected-path policy.
    await Promise.all(
      selected.slice(offset, offset + 16).map((item) => policy.assertExistingPath(item.path)),
    );
    signal?.throwIfAborted();
  }
  const reasons = new Set([...files.reasons, ...filtered.reasons]);
  if (normalizedQuery.note) reasons.add(normalizedQuery.note);
  // Issue #97: ignore rules must never turn a filtered absence into a complete one.
  let ignoredFiles = 0;
  let ignoredMatches = 0;
  let ignoredComparisonPartial = false;
  if (!includeIgnored) {
    const everything = await listWorkspaceFiles(cwd, signal, {
      ...listOptions,
      ignore: false,
      ignoreParents: false,
    });
    ignoredComparisonPartial = everything.partial;
    const admitted = new Set(files.paths);
    const ignored = everything.paths.filter((path) => !admitted.has(path));
    ignoredFiles = ignored.length;
    const ignoredCandidates = ignored
      .flatMap((path) => {
        const score = rank(path);
        return score ? [{ path, ...score }] : [];
      })
      .toSorted((left, right) => right.score - left.score || left.path.localeCompare(right.path));
    ignoredMatches = ignoredCandidates.length;
    if (ignoredFiles > 0) {
      const samples = ignoredCandidates
        .slice(0, IGNORED_MATCH_SAMPLES)
        .map((item) => `${JSON.stringify(item.path)} (${item.reason})`);
      reasons.add(
        ignoredMatches > 0
          ? `${String(ignoredFiles)} file(s) were excluded by ignore rules; ${String(ignoredMatches)} of them match this query${samples.length ? `, e.g. ${samples.join(", ")}` : ""}. Retry with ignorePolicy "include" to list them.`
          : `${String(ignoredFiles)} file(s) were excluded by ignore rules; none of them match this query.`,
      );
    }
    if (ignoredComparisonPartial)
      reasons.add(
        "Ignored-file comparison was incomplete; the ignored-file count is a lower bound",
      );
  }
  const enumerationPartial = files.partial || filtered.partial;
  return {
    kind: "files",
    unit: "files",
    partial: enumerationPartial,
    reasons: [...reasons],
    items: selected.map((item) => ({
      path: item.path,
      line: 1,
      label: `File candidate (score ${String(item.score)}: ${item.reason})`,
      details: {
        kind: "file",
        score: item.score,
        rankingReason: item.reason,
        inspect: { mode: "inspect", path: item.path, line: 1 },
      },
    })),
    coverage: {
      fileEnumeration: enumerationPartial
        ? "partial"
        : ignoredFiles > 0 || ignoredComparisonPartial
          ? "policy-filtered"
          : "complete",
    },
    stats: {
      filesEnumerated: files.paths.length,
      ...(includeIgnored ? {} : { ignoredFiles, ignoredMatches }),
    },
    scope: {
      path: request.path ?? ".",
      requestedPath: request.path ?? ".",
      glob: request.glob,
      exclude: request.exclude,
      hidden: request.hidden,
      ignorePolicy: request.ignorePolicy ?? "respect",
      expandedToProjectRoot: false,
      assertion: request.path && request.path !== "." ? "requested-scope" : "project-wide",
      ...(request.modifiedAfterMs !== undefined
        ? { modifiedAfterMs: request.modifiedAfterMs }
        : {}),
      ...(request.modifiedBeforeMs !== undefined
        ? { modifiedBeforeMs: request.modifiedBeforeMs }
        : {}),
    },
    redact: input.redact ?? false,
    ...(input.limit !== undefined ? { pageSize: request.pageSize } : {}),
  };
}
