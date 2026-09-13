import { Type } from "typebox";
import {
  MAX_ANY_OF_TOTAL_TERMS,
  MAX_ANY_OF_TERMS,
  MAX_CONFIGURABLE_STRUCTURE_FILES,
  DEFAULT_HYBRID_CONCEPT_LIMIT,
  MAX_HYBRID_CONCEPT_LIMIT,
  MAX_LITERAL_TERM_BYTES,
  MIN_ANY_OF_TERMS,
} from "./analysis-limits.js";
import {
  MAX_CONTEXT_LINES,
  MAX_INSPECT_TARGETS,
  MAX_PAGE_SIZE,
  MAX_SELECTED_PATHS,
  MAX_FILE_FILTER_ITEMS,
  MAX_PATH_CHARACTERS,
  MAX_PATTERN_CHARACTERS,
} from "./types.js";
import {
  MODE_CONTRACT_DESCRIPTION,
  MODE_FIELD_SUMMARY,
  MODEL_USAGE_GUIDANCE,
  REQUEST_USAGE_GUIDANCE,
  SIGNAL_GREP_MODES,
  fieldGuidance,
} from "./request-contract.js";

function stringEnum<const Values extends readonly string[]>(
  values: Values,
  options?: { description?: string },
) {
  return Type.Unsafe<Values[number]>({
    type: "string",
    enum: values,
    ...(options?.description ? { description: options.description } : {}),
  });
}

export const SIGNAL_GREP_DESCRIPTION = `Search and navigate code with bounded, verifiable evidence. Ordinary pattern searches use auto detail/summary; pattern is regex by default and literal=true matches source text exactly. A path selects an existing exact file or root; use mode=files with query to discover an unknown name. scope=strict prevents zero-result path expansion and wholeWord requires word boundaries. mode=capabilities returns a compact names-only project language inventory and the modes available for each detected language; capability providers are loaded only when the requested analysis runs. It never starts a parser, compiler, model or language server. mode=concept accepts a natural-language query, path and source filters; mode=hybrid uses one natural-language query for exact and local concept evidence, ranks exact evidence first, and retains a bounded semantic supplement. Slow concept/hybrid requests return status=waiting or running with operationId, progress, and an exact nextRequest using mode=await; copy that request unchanged to continue the same computation. Await expiry never downgrades evidence to literal-only or partial, and final results remain stable for the operation retention window. mode=cancel explicitly stops one operation. allOf and anyOf are explicit literal variants and cannot be mixed with pattern/literal; limit and context are output intent and are never silently dropped. modifiedAfter/modifiedBefore filter worktree files by inclusive/exclusive modification-time bounds in Unix milliseconds. structure+pattern matches AST shapes. Outline uses a source path or retained cursor+matchIndex and follows declared capabilities (Swift requires SourceKit-LSP); semantic definitions/references/implementations/callers/callees use path+line+column or an unambiguous symbol. dependencies/dependents use a workspace file path and the compiler's project module resolution. impact combines compiler-confirmed candidate bindings, exact occurrences and related-test candidates without running tests; all analysis is static evidence, and partial coverage stays explicit. ${REQUEST_USAGE_GUIDANCE}`;

export const SIGNAL_GREP_MODEL_DESCRIPTION = `Bounded local evidence search. ${MODEL_USAGE_GUIDANCE}. Copy cursors; analysis is evidence, not proof.`;

export const signalGrepSchema = Type.Object({
  column: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "1-based UTF-16 column for exact compiler navigation; requires path and line.",
    }),
  ),
  query: Type.Optional(
    Type.String({
      maxLength: 256,
      description: `${fieldGuidance("query")}. Hybrid uses the same query as exact literal text and as the local concept query. Discovery modes preserve their requested path. Concept and hybrid require an explicitly installed local model.`,
    }),
  ),
  scope: Type.Optional(
    stringEnum(["strict", "expand"] as const, {
      description: `${fieldGuidance("scope")}; expand (default) retries ordinary content search from project cwd. Applies to ordinary, multi-term and role searches.`,
    }),
  ),
  wholeWord: Type.Optional(
    Type.Boolean({
      description:
        "Single-pattern search only: require ripgrep Unicode word boundaries around the match. Works with regex or literal=true.",
    }),
  ),
  anyOf: Type.Optional(
    Type.Array(Type.String({ maxLength: MAX_LITERAL_TERM_BYTES }), {
      minItems: MIN_ANY_OF_TERMS,
      maxItems: MAX_ANY_OF_TOTAL_TERMS,
      description: `${fieldGuidance("anyOf")}. ${String(MIN_ANY_OF_TERMS)}-${String(MAX_ANY_OF_TOTAL_TERMS)} distinct case-sensitive single-line terms, at most ${String(MAX_LITERAL_TERM_BYTES)} UTF-8 bytes each. Requests above ${String(MAX_ANY_OF_TERMS)} terms are split into version-checked chunks and merged. Returns every retained occurrence attributed to its term.`,
    }),
  ),
  allOf: Type.Optional(
    Type.Array(Type.String({ maxLength: MAX_PATH_CHARACTERS }), {
      minItems: 2,
      maxItems: 3,
      description: `${fieldGuidance("allOf")}. 2-3 distinct terms must occur in one file (default) or one function.`,
    }),
  ),
  within: Type.Optional(
    stringEnum(["file", "function"] as const, {
      description:
        "Only valid with allOf; omit for ordinary single-pattern searches. function requires JS/TS/TSX and counts only that implementation's own code, excluding nested callbacks, strings/comments/types. Not proof of a shared execution path.",
    }),
  ),
  roles: Type.Optional(
    Type.Array(
      stringEnum([
        "declaration",
        "call",
        "import",
        "export",
        "comment",
        "string",
        "jsx-text",
        "code",
        "unknown",
      ] as const),
      {
        minItems: 1,
        description:
          "Filter each single-pattern occurrence by syntax role (JS/TS/TSX/Go). Roles may be candidates, especially Go call/conversion ambiguity. Cannot combine with allOf.",
      },
    ),
  ),
  changes: Type.Optional(
    Type.Object({
      base: Type.Optional(
        Type.String({
          description: "Git base commit/ref; default HEAD, pinned to a commit at query time.",
        }),
      ),
      target: Type.Optional(
        Type.String({
          description:
            "Optional target commit/ref. Omit for final working-tree contents including unignored untracked files, not just the staged index.",
        }),
      ),
      scope: stringEnum(["files", "lines"] as const, {
        description:
          "Search changed files or only changed lines. With allOf every term must lie on the chosen side's changed lines.",
      }),
      side: stringEnum(["new", "old"] as const, {
        description:
          "Choose final/new content or deleted/old content. Historical inspect and continuation remain bound to that commit/blob.",
      }),
    }),
  ),
  sourceCursor: Type.Optional(
    Type.String({
      description:
        "Missing-source continuation token. Copy nextRequest exactly: mode=inspect plus sourceCursor only. Same token replays the same page; changed or expired sources fail clearly.",
    }),
  ),
  symbol: Type.Optional(
    Type.String({
      description:
        "Binding name for imports/tests/impact; semantic modes accept it only when it identifies one source occurrence. Prefer exact path+line+column when the name repeats.",
    }),
  ),
  pattern: Type.Optional(
    Type.String({
      maxLength: MAX_PATTERN_CHARACTERS,
      description: `${fieldGuidance("pattern")}. mode=structure uses an ast-grep code pattern, at most 4 KiB, including $NAME and $$$ARGS metavariables; no regex/literal options. Omit for discovery, semantic navigation, inspection and cursors.`,
    }),
  ),
  path: Type.Optional(
    Type.String({
      maxLength: MAX_PATH_CHARACTERS,
      description: `${fieldGuidance("path")}. A zero-result content search expands from cwd unless scope=strict. Compiler navigation stays within admitted workspace sources. Absolute paths and .. traversal may resolve outside cwd, except protected external system areas and .git internals; Git changes mode remains cwd-scoped.`,
    }),
  ),
  paths: Type.Optional(
    Type.Array(Type.String(), {
      minItems: 1,
      maxItems: MAX_SELECTED_PATHS,
      description:
        "Exact retained files to select together from a cursor. A new search accepts one path; split multiple roots into separate requests.",
    }),
  ),
  glob: Type.Optional(
    Type.Union(
      [
        Type.String({ maxLength: MAX_PATH_CHARACTERS }),
        Type.Array(Type.String({ maxLength: MAX_PATH_CHARACTERS }), {
          maxItems: MAX_FILE_FILTER_ITEMS,
        }),
      ],
      {
        description: "Include glob or globs, for example '*.ts' or 'src/**'.",
      },
    ),
  ),
  exclude: Type.Optional(
    Type.Union(
      [
        Type.String({ maxLength: MAX_PATH_CHARACTERS }),
        Type.Array(Type.String({ maxLength: MAX_PATH_CHARACTERS }), {
          maxItems: MAX_FILE_FILTER_ITEMS,
        }),
      ],
      {
        description:
          "Exclude file/path globs (not content negation); applied after include globs. A leading ! is optional.",
      },
    ),
  ),
  literal: Type.Optional(Type.Boolean({ description: fieldGuidance("literal") })),
  ignoreCase: Type.Optional(
    Type.Boolean({
      description: "true for insensitive, false for sensitive; omitted uses smart-case.",
    }),
  ),
  hidden: Type.Optional(
    Type.Boolean({ description: "Search hidden files (default true; .git is always excluded)." }),
  ),
  redact: Type.Optional(
    Type.Boolean({
      description:
        "Optional display-only masking for credential-like values and private-key bodies. Default false. It never changes searched files, admitted matches, counts, or cursor completeness.",
    }),
  ),
  modifiedAfter: Type.Optional(
    Type.Integer({
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
      description:
        "Worktree modification-time lower bound, inclusive, as a Unix timestamp in milliseconds. Not valid with Git changes.",
    }),
  ),
  modifiedBefore: Type.Optional(
    Type.Integer({
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
      description:
        "Worktree modification-time upper bound, exclusive, as a Unix timestamp in milliseconds. Not valid with Git changes.",
    }),
  ),
  maxFilesToParse: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: MAX_CONFIGURABLE_STRUCTURE_FILES,
      description: `Maximum source files parsed by one structural analysis request (default 200, max ${String(MAX_CONFIGURABLE_STRUCTURE_FILES)}). Candidate discovery still searches the full requested scope.`,
    }),
  ),
  conceptLimit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: MAX_HYBRID_CONCEPT_LIMIT,
      description: `mode=hybrid only: retain the top semantic candidates after overlap deduplication (default ${String(DEFAULT_HYBRID_CONCEPT_LIMIT)}, max ${String(MAX_HYBRID_CONCEPT_LIMIT)}). Literal evidence has an independent retention budget and is never displaced by this limit.`,
    }),
  ),
  context: Type.Optional(
    Type.Integer({
      minimum: 0,
      maximum: MAX_CONTEXT_LINES,
      description: `${fieldGuidance("context")}. New search only: nearby lines (0-20). MUST be omitted for inspect, which selects its own bounded source window.`,
    }),
  ),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: MAX_PAGE_SIZE,
      description: `${fieldGuidance("limit")}. Ordinary search only: explicit detail-page match limit (max 100). Normally omit to preserve automatic summarization; analysis and inspect modes reject it.`,
    }),
  ),
  mode: Type.Optional(
    stringEnum(SIGNAL_GREP_MODES, {
      description: `Ordinary search defaults to auto; summary/matches request explicit pages. capabilities returns a compact names-only project inventory and per-language supported modes without loading providers. files uses query, structure uses an AST pattern, concept uses a required natural-language query, and hybrid uses one query for exact literal plus concept evidence in a single snapshot. definitions/references/implementations/callers/callees require a workspace path and exact line+column or unique symbol; dependencies/dependents require only a workspace file path. trace follows static callers/callees with bounded depth and explicit budgets, and applies glob/exclude/hidden to the provider source inventory; validate rechecks the entire saved trace or analysis snapshot by default. await waits for an existing long-running concept or hybrid operation without restarting it; cancel explicitly cancels one and waits for owned cleanup. Copy the returned nextRequest exactly and do not repeat the original query. Waiting is an operation state, not evidence. Relationship details report the requested scope, comparison target, coverage, and freshness as current, stale, or unknown; partial coverage is retained during validation. inspect/outline/imports/tests/impact retain their documented location selectors. Compiler results are static evidence; concept and related-test results remain candidates. ${MODE_CONTRACT_DESCRIPTION} Fields: ${MODE_FIELD_SUMMARY}`,
    }),
  ),
  relation: Type.Optional(
    stringEnum(["callers", "callees"] as const, {
      description:
        "mode=trace relationship direction; required for a new trace and ignored only when paging a trace cursor.",
    }),
  ),
  depth: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 8,
      description:
        "mode=trace maximum BFS depth; continuation increases the cumulative depth by one.",
    }),
  ),
  maxNodes: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 2_000,
      description: "mode=trace retained node budget across all continuation pages.",
    }),
  ),
  maxEdges: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 4_000,
      description: "mode=trace retained edge budget across all continuation pages.",
    }),
  ),
  maxExpansions: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 2_000,
      description: "mode=trace provider expansion budget across all continuation pages.",
    }),
  ),
  line: Type.Optional(
    Type.Number({
      description:
        "1-indexed source line for path inspection/navigation/impact. Omit with matchIndex, matchIndices or targets.",
    }),
  ),
  matchIndex: Type.Optional(
    Type.Number({
      description:
        "1-based retained match index for cursor-scoped inspect; replaces path and line.",
    }),
  ),
  matchIndices: Type.Optional(
    Type.Array(Type.Integer({ minimum: 1 }), {
      minItems: 1,
      maxItems: MAX_INSPECT_TARGETS,
      description:
        "Inspect up to five visible match numbers together using the same cursor; mutually exclusive with matchIndex, path, line and targets.",
    }),
  ),
  targets: Type.Optional(
    Type.Array(
      Type.Object({
        path: Type.String({ maxLength: MAX_PATH_CHARACTERS }),
        line: Type.Integer({ minimum: 1 }),
      }),
      {
        minItems: 1,
        maxItems: MAX_INSPECT_TARGETS,
        description:
          "Inspect known path/line locations together without a cursor. The complete batch shares one 16 KiB response budget.",
      },
    ),
  ),
  cursor: Type.Optional(
    Type.String({ description: "Opaque cursor from a previous stable search snapshot." }),
  ),
  operationId: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 128,
      description:
        "Operation handle returned by a waiting concept/hybrid result. Required with mode=await or mode=cancel; copy it exactly and do not start a new query.",
    }),
  ),
  exploreCursor: Type.Optional(
    Type.String({
      description:
        "Independent relationship exploration handle returned by mode=trace; use it to extend depth without changing immutable result page cursors.",
    }),
  ),
});
