import type { SignalGrepInput } from "./service.js";
import {
  DEFAULT_LANGUAGE_CAPABILITIES,
  outlineExtension as languageOutlineExtension,
} from "./language-capability-definitions.js";

export const SIGNAL_GREP_MODES = [
  "auto",
  "summary",
  "matches",
  "inspect",
  "outline",
  "imports",
  "tests",
  "impact",
  "files",
  "structure",
  "concept",
  "hybrid",
  "definitions",
  "references",
  "implementations",
  "callers",
  "callees",
  "dependencies",
  "dependents",
  "trace",
  "validate",
  "capabilities",
  "await",
  "cancel",
] as const;

export type SignalGrepMode = (typeof SIGNAL_GREP_MODES)[number];
export type RequestField = keyof SignalGrepInput;

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

export const MODE_FIELDS_BY_MODE: Record<SignalGrepMode, readonly RequestField[]> = {
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
  impact: [...commonFields, ...sourceFilters, "path", "line", "symbol", "cursor", "matchIndex"],
  files: [...commonFields, "query", ...sourceFilters, "modifiedAfter", "modifiedBefore"],
  structure: [...commonFields, "pattern", ...sourceFilters, "maxFilesToParse"],
  concept: [...commonFields, "query", ...sourceFilters],
  hybrid: [...commonFields, "query", ...sourceFilters, "conceptLimit"],
  definitions: [...commonFields, "path", "line", "column", "symbol", "maxFilesToParse"],
  references: [...commonFields, "path", "line", "column", "symbol", "maxFilesToParse"],
  implementations: [...commonFields, "path", "line", "column", "symbol", "maxFilesToParse"],
  callers: [...commonFields, "path", "line", "column", "symbol", "maxFilesToParse"],
  callees: [...commonFields, "path", "line", "column", "symbol", "maxFilesToParse"],
  dependencies: [...commonFields, "path"],
  dependents: [...commonFields, "path"],
  trace: [
    ...commonFields,
    ...sourceFilters,
    "path",
    "line",
    "column",
    "symbol",
    "relation",
    "depth",
    "maxNodes",
    "maxEdges",
    "maxExpansions",
    "maxFilesToParse",
    "cursor",
    "exploreCursor",
    "matchIndex",
  ],
  validate: [...commonFields, "cursor", "matchIndex"],
  capabilities: [...commonFields, ...sourceFilters],
  await: ["mode", "operationId"],
  cancel: ["mode", "operationId"],
};

export const SAFE_DROP_FIELDS: Partial<Record<SignalGrepMode, readonly RequestField[]>> = {
  files: ["scope"],
};

export const SUPPORTED_OUTLINE_EXTENSIONS = new Set(
  DEFAULT_LANGUAGE_CAPABILITIES.flatMap((descriptor) =>
    descriptor.capabilities.some((capability) => capability.name === "outline")
      ? descriptor.extensions
      : [],
  ),
);

export function modeFields(mode: SignalGrepMode): readonly RequestField[] {
  return MODE_FIELDS_BY_MODE[mode];
}

export function modeFieldSummary(mode: SignalGrepMode): string {
  return `${mode}={${modeFields(mode).join(",")}}`;
}

/** Compact schema-facing summary derived from the runtime field catalog. */
const MODE_SUMMARY_MODES = [
  "files",
  "concept",
  "hybrid",
  "inspect",
  "outline",
  "references",
  "trace",
  "capabilities",
  "await",
  "cancel",
] as const satisfies readonly SignalGrepMode[];

export const MODE_FIELD_SUMMARY = MODE_SUMMARY_MODES.map((mode) => modeFieldSummary(mode)).join(
  "; ",
);

/** Short field semantics shared by tools/list and the model-facing guidance. */
export const REQUEST_FIELD_GUIDANCE: Partial<Record<RequestField, string>> = {
  pattern: "pattern is regex by default; literal=true matches source text exactly",
  literal:
    "literal=true makes pattern exact source text; anyOf/allOf already use literal semantics",
  path: "path must be an existing exact file or root; use mode=files+query for unknown names",
  query: "files+query discovers unknown filenames/paths; concept/hybrid query is natural language",
  anyOf:
    "anyOf is case-sensitive exact-literal OR; omit pattern, allOf, literal, ignoreCase, roles",
  allOf:
    "allOf is case-sensitive exact-literal AND; omit pattern, anyOf, literal, ignoreCase, roles",
  context: "context is an output-context budget and is never silently dropped",
  limit: "limit is an output/page budget and is never silently dropped",
  scope:
    "scope applies to ordinary content search; mode=files rejects this field because its scope is fixed strict, and only redundant strict may be removed",
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
  `search: ${SEARCH_GUIDANCE_FIELDS.map((field) => `${field}=${fieldGuidance(field)}`).join("; ")}`,
  `variants: ${VARIANT_GUIDANCE_FIELDS.map((field) => fieldGuidance(field)).join("; ")}`,
  `budgets: ${BUDGET_GUIDANCE_FIELDS.map((field) => fieldGuidance(field)).join("; ")}`,
  `selectors: inspect=${modeFieldSummary("inspect")}; references=${modeFieldSummary("references")}; hybrid=${modeFieldSummary("hybrid")}; files=${modeFieldSummary("files")}; capabilities=${modeFieldSummary("capabilities")}`,
  "use only the advertised names: exact, any-of and max_results are not parameters",
].join("; ");

export const MODEL_USAGE_GUIDANCE = [
  "pattern is regex by default; literal=true matches source text exactly",
  "path is an existing exact file or root; use files+query for an unknown name",
  "anyOf/allOf are exact-literal OR/AND variants and exclude pattern/literal",
  "limit/context are output budgets and are never silently dropped",
  "outline and semantic modes follow capabilities; Swift needs SourceKit-LSP, Go trace needs gopls and a valid workspace; bounded evidence",
  `selectors: inspect={${modeFields("inspect").join(",")}}; references={${modeFields("references").join(",")}}; hybrid={${modeFields("hybrid").join(",")}}; capabilities={${modeFields("capabilities").join(",")}}`,
  "exact, any-of and max_results are not parameters",
].join("; ");

/** A single concise capability statement shared by schema and model-facing descriptions. */
export const MODE_CONTRACT_DESCRIPTION = [
  `fields: ${MODE_FIELD_SUMMARY}`,
  `rules: ${GUIDANCE_FIELDS.map((field) => `${field} — ${fieldGuidance(field)}`).join("; ")}`,
  "inspect uses cursor+matchIndex or explicit targets; references and other semantic navigation use path+line+column or an unambiguous symbol",
  "capabilities performs a bounded names-only project inventory and reports per-language modes with lazy loading; it does not start a parser, compiler, model or language server",
  "outline follows declared capabilities; Swift needs SourceKit-LSP; unavailable languages appear in capabilities",
  "there are no exact, any-of or max_results fields; use literal, anyOf or limit",
  "context 0–20 is never clamped",
].join("; ");

export function outlineExtension(path: unknown): string | undefined {
  if (typeof path !== "string") return undefined;
  return languageOutlineExtension(path);
}
