import { MAX_PAGE_SIZE } from "./types.js";
import type { SiftlightInput } from "./service.js";
import {
  DEFAULT_LANGUAGE_CAPABILITIES,
  outlineExtension as languageOutlineExtension,
} from "./language-capability-definitions.js";

export const SIFTLIGHT_MODES = [
  "audit",
  "auto",
  "summary",
  "matches",
  "inspect",
  "outline",
  "imports",
  "tests",
  "files",
  "structure",
  "concept",
  "hybrid",
  "validate",
  "capabilities",
  "await",
  "cancel",
] as const;

export type SiftlightMode = (typeof SIFTLIGHT_MODES)[number];
export type RequestField = keyof SiftlightInput;

const commonFields = ["mode", "redact"] as const satisfies readonly RequestField[];
const sourceFilters = [
  "path",
  "glob",
  "exclude",
  "hidden",
] as const satisfies readonly RequestField[];
const ordinaryFields = [
  ...commonFields,
  "pattern",
  ...sourceFilters,
  "ignorePolicy",
  "literal",
  "ignoreCase",
  "context",
  "limit",
  "scope",
  "wholeWord",
  "modifiedAfter",
  "modifiedBefore",
  "anyOf",
  "allOf",
  "within",
  "roles",
  "changes",
  "maxFilesToParse",
  "cursor",
  "matchIndex",
] as const satisfies readonly RequestField[];

export const MODE_FIELDS_BY_MODE: Record<SiftlightMode, readonly RequestField[]> = {
  audit: [...commonFields, "patterns", ...sourceFilters, "ignorePolicy"],
  auto: ordinaryFields,
  summary: ordinaryFields,
  matches: ordinaryFields,
  inspect: [...commonFields, "path", "line", "cursor", "matchIndex", "matchIndices", "targets"],
  outline: [...commonFields, "path", "line", "symbol", "cursor", "matchIndex", "maxFilesToParse"],
  imports: [
    ...commonFields,
    ...sourceFilters,
    "line",
    "symbol",
    "cursor",
    "matchIndex",
    "maxFilesToParse",
  ],
  tests: [
    ...commonFields,
    ...sourceFilters,
    "line",
    "symbol",
    "cursor",
    "matchIndex",
    "maxFilesToParse",
  ],
  files: [...commonFields, "query", ...sourceFilters, "modifiedAfter", "modifiedBefore"],
  structure: [...commonFields, "pattern", ...sourceFilters, "maxFilesToParse"],
  concept: [...commonFields, "query", ...sourceFilters, "maxFilesToParse"],
  hybrid: [...commonFields, "query", ...sourceFilters, "conceptLimit", "maxFilesToParse"],
  validate: [...commonFields, "cursor", "matchIndex"],
  capabilities: [...commonFields, ...sourceFilters],
  await: ["mode", "operationId"],
  cancel: ["mode", "operationId"],
};

export const SAFE_DROP_FIELDS: Partial<Record<SiftlightMode, readonly RequestField[]>> = {
  files: ["scope"],
};

export const SUPPORTED_OUTLINE_EXTENSIONS = new Set(
  DEFAULT_LANGUAGE_CAPABILITIES.flatMap((descriptor) =>
    descriptor.capabilities.some((capability) => capability.name === "outline")
      ? descriptor.extensions
      : [],
  ),
);

export function modeFields(mode: SiftlightMode): readonly RequestField[] {
  return MODE_FIELDS_BY_MODE[mode];
}

/**
 * Prose field list for one mode. It deliberately avoids `name={a,b,c}`, whose
 * shape mimics the call syntax a host would accept and can be copied into the
 * arguments as a nonexistent nested field.
 */
export function modeFieldSummary(mode: SiftlightMode): string {
  return `${mode}: ${modeFields(mode).join(",")}`;
}

/** Compact schema-facing summary derived from the runtime field catalog. */
const MODE_SUMMARY_MODES = [
  "audit",
  "files",
  "concept",
  "hybrid",
  "inspect",
  "outline",
  "capabilities",
  "await",
  "cancel",
] as const satisfies readonly SiftlightMode[];

export const MODE_FIELD_SUMMARY = MODE_SUMMARY_MODES.map((mode) => modeFieldSummary(mode)).join(
  "; ",
);

/** Short field semantics shared by tools/list and the model-facing guidance. */
export const REQUEST_FIELD_GUIDANCE: Partial<Record<RequestField, string>> = {
  pattern: "pattern is regex by default; literal=true matches source text exactly",
  literal:
    "literal=true makes pattern exact source text; anyOf/allOf already use literal semantics",
  path: "path must be an existing exact file or root; use mode=files+query for unknown names",
  query:
    "files+query matches known filename/path text (not glob patterns); omit files query to list every file under path; concept/hybrid query is natural language",
  anyOf:
    "anyOf is case-sensitive exact-literal OR; omit pattern, allOf, literal, ignoreCase, roles",
  allOf:
    "allOf is case-sensitive exact-literal AND; omit pattern, anyOf, literal, ignoreCase, roles",
  context: "context is an output-context budget and is never silently dropped",
  limit: "limit is an output/page budget and is never silently dropped",
  scope:
    "scope applies to ordinary content search; mode=files rejects this field because its scope is fixed strict, and only redundant strict may be removed",
  ignorePolicy:
    "respect keeps repository ignore rules; include searches ignored files but always excludes .git internals and protected paths",
  patterns: "audit accepts named exact-literal patterns and returns one closure receipt",
  maxFilesToParse:
    "concept/hybrid automatically batch the requested scope; this optional field sets an advanced hard file ceiling",
};

export function fieldGuidance(field: RequestField): string {
  return REQUEST_FIELD_GUIDANCE[field] ?? `${field} is accepted only by its cataloged modes`;
}

const GUIDANCE_FIELDS = [
  "pattern",
  "literal",
  "path",
  "query",
  "anyOf",
  "allOf",
  "context",
  "limit",
  "scope",
] as const satisfies readonly RequestField[];

const SEARCH_GUIDANCE_FIELDS = ["pattern", "literal", "path", "query"] as const;
const VARIANT_GUIDANCE_FIELDS = ["anyOf", "allOf"] as const;
const BUDGET_GUIDANCE_FIELDS = ["limit", "context"] as const;

export const REQUEST_USAGE_GUIDANCE = [
  // Each guidance sentence already names its field, so prefixing it again
  // produced `pattern=pattern is regex…` and `literal=literal=true makes…`.
  `search: ${SEARCH_GUIDANCE_FIELDS.map((field) => fieldGuidance(field)).join("; ")}`,
  `variants: ${VARIANT_GUIDANCE_FIELDS.map((field) => fieldGuidance(field)).join("; ")}`,
  `budgets: ${BUDGET_GUIDANCE_FIELDS.map((field) => fieldGuidance(field)).join("; ")}`,
  `selectors: ${modeFieldSummary("inspect")}; ${modeFieldSummary("hybrid")}; ${modeFieldSummary("files")}; ${modeFieldSummary("capabilities")}`,
  "use only the advertised names: exact, any-of and max_results are not parameters",
].join("; ");

export const MODEL_USAGE_GUIDANCE = [
  "pattern is regex by default; literal=true matches source text exactly",
  "path is an existing exact file or root; use files+query for an unknown name",
  "anyOf/allOf are exact-literal OR/AND variants and exclude pattern/literal",
  `limit/context are ordinary-search output budgets; limit <= ${String(MAX_PAGE_SIZE)}; omit both for hybrid/concept/outline/structure/inspect`,
  "outline requires a concrete source file, not a directory; structure requires a nonempty AST pattern and JS/TS/TSX/Go sources, no lang field; use capabilities before unfamiliar language operations",
  "outline supports JS/TS/TSX and bounded Python syntax; imports/tests are static candidates for JS/TS/TSX",
  `selectors: ${modeFieldSummary("inspect")}; ${modeFieldSummary("hybrid")}; ${modeFieldSummary("capabilities")}`,
  "exact, any-of and max_results are not parameters",
].join("; ");

/** A single concise capability statement shared by schema and model-facing descriptions. */
export const MODE_CONTRACT_DESCRIPTION = [
  `fields: ${MODE_FIELD_SUMMARY}`,
  `rules: ${GUIDANCE_FIELDS.map((field) => `${field} — ${fieldGuidance(field)}`).join("; ")}`,
  "inspect uses cursor+matchIndex or explicit targets; imports/tests report static syntax candidates",
  "capabilities performs a bounded names-only project inventory and reports per-language modes with lazy loading; it does not start a parser, compiler, model or language server",
  "outline follows declared syntax capabilities; unavailable languages appear in capabilities",
  "there are no exact, any-of or max_results fields; use literal, anyOf or limit",
  "context 0–20 is never clamped",
].join("; ");

export function outlineExtension(path: unknown): string | undefined {
  if (typeof path !== "string") return undefined;
  return languageOutlineExtension(path);
}
