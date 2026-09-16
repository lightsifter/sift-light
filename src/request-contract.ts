import type { SignalGrepInput } from "./service.js";
import { MAX_HYBRID_CONCEPT_LIMIT, MAX_CONFIGURABLE_STRUCTURE_FILES } from "./analysis-limits.js";
import { MAX_CONTEXT_LINES, MAX_PAGE_SIZE } from "./types.js";
import { containsSensitiveText } from "./redaction.js";
import {
  MAX_REQUEST_RECOVERY_BYTES,
  RequestContractError,
  type RequestIssue,
  boundedDisplay,
} from "./request-contract-error.js";
import {
  MODE_FIELDS_BY_MODE,
  SAFE_DROP_FIELDS,
  SIGNAL_GREP_MODES,
  SUPPORTED_OUTLINE_EXTENSIONS,
  type RequestField,
  type SignalGrepMode,
  modeFields,
  outlineExtension,
} from "./request-contract-catalog.js";

export {
  MODE_CONTRACT_DESCRIPTION,
  MODE_FIELD_SUMMARY,
  MODEL_USAGE_GUIDANCE,
  REQUEST_USAGE_GUIDANCE,
  SIGNAL_GREP_MODES,
  fieldGuidance,
} from "./request-contract-catalog.js";
export type { RequestField, SignalGrepMode } from "./request-contract-catalog.js";
export {
  MAX_REQUEST_RECOVERY_BYTES,
  RequestContractError,
  boundedRequestContractDetails,
  isSignalGrepDiagnosticError,
} from "./request-contract-error.js";
export type {
  RequestContractDetails,
  RequestIssue,
  RequestRecovery,
} from "./request-contract-error.js";

/**
 * The public request contract is intentionally kept separate from the TypeBox
 * property catalog.  Hosts receive one flat schema, while this module owns the
 * mode-specific capability and recovery rules used by every runtime entry.
 */
const MAX_REQUEST_RECOVERY_ISSUES = 16;
function boundedField(value: string): string {
  return boundedDisplay(value, 128);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function modeOf(input: Record<string, unknown>): SignalGrepMode | undefined {
  const mode = input.mode;
  if (mode === undefined) return "auto";
  if (typeof mode !== "string") return undefined;
  return SIGNAL_GREP_MODES.find((candidate) => candidate === mode);
}

function inputModeLabel(input: Record<string, unknown>): string | undefined {
  return typeof input.mode === "string" ? input.mode.slice(0, 128) : undefined;
}

function outlineCapability(
  path: string | undefined,
  resolvedDocument = false,
): { extension?: string; supported: boolean } {
  const extension = outlineExtension(path);
  // A request can name a directory, so an extensionless input is deferred until
  // the loaded document has a concrete path.  A concrete extension is checked
  // here and again by the navigation service through this same catalog.
  return {
    ...(extension ? { extension } : {}),
    supported:
      extension !== undefined ? SUPPORTED_OUTLINE_EXTENSIONS.has(extension) : !resolvedDocument,
  };
}

function capabilityError(
  code: string,
  mode: string | undefined,
  field: string,
  reason: string,
  message: string,
): RequestContractError {
  return new RequestContractError(
    {
      code,
      ...(mode ? { mode } : {}),
      issues: [{ field, reason }],
      recovery: { action: "choose-capability", reason },
    },
    message,
  );
}

function schemaError(
  input: Record<string, unknown>,
  field: string,
  reason: string,
): RequestContractError {
  const mode = inputModeLabel(input);
  return new RequestContractError(
    {
      code: `E_${field.replaceAll(/[^a-z0-9]+/giu, "_").toUpperCase()}_RANGE`,
      ...(mode ? { mode } : {}),
      issues: [{ field, reason }],
      recovery: { action: "manual", reason },
    },
    `${field} is invalid: ${reason}`,
  );
}

function safeNextRequest(
  input: Record<string, unknown>,
  mode: SignalGrepMode,
  invalid: readonly string[],
): Record<string, unknown> | undefined {
  if (input.redact === true && containsSensitiveText(input)) return undefined;
  const safe = new Set<string>(SAFE_DROP_FIELDS[mode] ?? []);
  if (invalid.some((field) => !safe.has(field))) return undefined;
  const next: Record<string, unknown> = { ...input };
  for (const field of invalid) delete next[field];
  if (selectorIssuesFor(next, mode).length > 0) return undefined;
  // A copied request must remain within the transport's bounded line budget.
  try {
    if (Buffer.byteLength(JSON.stringify(next)) > MAX_REQUEST_RECOVERY_BYTES) return undefined;
  } catch {
    return undefined;
  }
  return next;
}

function fieldsError(
  input: Record<string, unknown>,
  mode: SignalGrepMode,
  invalid: readonly string[],
  selectorIssues: readonly RequestIssue[] = [],
): RequestContractError {
  const nextRequest = safeNextRequest(input, mode, invalid);
  const visibleInvalid = invalid.slice(0, MAX_REQUEST_RECOVERY_ISSUES);
  const omitted = invalid.length - visibleInvalid.length;
  const issues = [
    ...visibleInvalid.map((field) => ({
      field: boundedField(field),
      reason: `not accepted by mode=${boundedDisplay(mode, 128)}`,
    })),
    ...selectorIssues,
  ];
  if (omitted > 0)
    issues.push({
      field: "<additional-fields>",
      reason: `${String(omitted)} additional fields are not accepted`,
    });
  const visibleFields = visibleInvalid.map((field) => boundedField(field)).join(", ");
  const reason =
    omitted > 0
      ? `mode=${mode} does not accept ${visibleFields} and ${String(omitted)} additional field(s)`
      : `mode=${mode} does not accept ${visibleFields}`;
  // A field named after its own mode (for example `files` under mode=files) is
  // the signature of arguments shaped as a per-mode object, which the flat
  // schema never advertises. Naming the accepted fields replaces an otherwise
  // puzzling rejection with the rule and the valid names.
  const flatRule = `Fields are flat: pass them at the top level, not inside a per-mode object. mode=${mode} accepts: ${modeFields(mode).join(", ")}.`;
  return new RequestContractError(
    {
      code: "E_MODE_FIELDS",
      mode,
      issues,
      recovery: nextRequest
        ? {
            action: "retry",
            reason: `Remove only ${visibleFields} and copy the exact nextRequest; all other fields are preserved.`,
            nextRequest,
          }
        : {
            action: "manual",
            reason: `${reason}; choose the mode explicitly or remove the fields yourself without changing the requested scope. ${flatRule}`,
          },
    },
    nextRequest
      ? `${reason}; retry the exact nextRequest without repeating the original query.`
      : `${reason}; no semantics-preserving automatic request is available. ${flatRule} Preserve valid path, filters, redact and cursor fields when choosing the next request.`,
  );
}

function selectorIssuesFor(input: Record<string, unknown>, mode: SignalGrepMode): RequestIssue[] {
  if (
    (mode === "auto" || mode === "summary" || mode === "matches") &&
    typeof input.cursor === "string" &&
    input.cursor.trim().length > 0 &&
    !input.cursor.includes(".analysis")
  ) {
    const issues: RequestIssue[] = [];
    if (mode === "summary" && input.path !== undefined)
      issues.push({ field: "path", reason: "summary cursor paging cannot select a direct path" });
    if (mode === "summary" && input.paths !== undefined)
      issues.push({ field: "paths", reason: "summary cursor paging cannot select retained paths" });
    if (mode !== "summary" && input.path !== undefined && input.paths !== undefined)
      issues.push({ field: "paths", reason: "cursor selection accepts path or paths, not both" });
    return issues;
  }
  if (mode === "outline" || mode === "imports" || mode === "tests") {
    if (input.cursor !== undefined) {
      const issues: RequestIssue[] = [];
      if (!Number.isSafeInteger(input.matchIndex))
        issues.push({ field: "matchIndex", reason: "cursor continuation requires matchIndex" });
      for (const field of ["path", "line", "symbol"] as const)
        if (input[field] !== undefined)
          issues.push({ field, reason: "cursor continuation cannot combine a direct selector" });
      return issues;
    }
    if (typeof input.path !== "string" || input.path.length === 0)
      return [
        { field: "path", reason: `mode=${mode} requires a source path or cursor+matchIndex` },
      ];
    return [];
  }
  if (mode === "inspect") {
    const issues: RequestIssue[] = [];
    const hasMatchIndices = input.matchIndices !== undefined;
    const hasTargets = input.targets !== undefined;
    if (hasMatchIndices && hasTargets)
      issues.push({ field: "targets", reason: "use either matchIndices or targets, not both" });
    if (hasMatchIndices && typeof input.cursor !== "string")
      issues.push({ field: "cursor", reason: "matchIndices requires a cursor" });
    if (hasTargets && input.cursor !== undefined)
      issues.push({ field: "cursor", reason: "targets cannot be combined with cursor" });
    if (hasMatchIndices || hasTargets) {
      for (const field of ["path", "line", "matchIndex"] as const)
        if (input[field] !== undefined)
          issues.push({
            field,
            reason:
              "batch inspection accepts targets or matchIndices instead of path, line or matchIndex",
          });
      return issues;
    }
    if (typeof input.cursor === "string" && input.cursor.includes(".analysis")) {
      if (!Number.isSafeInteger(input.matchIndex))
        issues.push({
          field: "matchIndex",
          reason: "cursor inspection requires matchIndex",
        });
      if (input.path !== undefined)
        issues.push({ field: "path", reason: "analysis cursor inspection cannot combine path" });
      if (input.line !== undefined)
        issues.push({ field: "line", reason: "analysis cursor inspection cannot combine line" });
    }
    return issues;
  }
  if (mode === "validate" && typeof input.cursor !== "string")
    return [{ field: "cursor", reason: "mode=validate requires a saved evidence cursor" }];
  return [];
}

function selectorError(
  input: Record<string, unknown>,
  mode: SignalGrepMode,
  issues: readonly RequestIssue[],
): RequestContractError {
  const reason = issues.map((issue) => `${issue.field}: ${issue.reason}`).join("; ");
  return new RequestContractError(
    {
      code: "E_MODE_SELECTOR",
      mode,
      issues,
      recovery: {
        action: "manual",
        reason: `${reason}; choose a complete selector variant explicitly. No executable nextRequest can be inferred.`,
      },
    },
    `mode=${mode} has an incomplete or conflicting selector: ${reason}`,
  );
}

function validateValueRanges(input: Record<string, unknown>): void {
  const integerRanges: readonly [RequestField, number, number][] = [
    ["context", 0, MAX_CONTEXT_LINES],
    ["limit", 1, MAX_PAGE_SIZE],
    ["conceptLimit", 1, MAX_HYBRID_CONCEPT_LIMIT],
    ["maxFilesToParse", 1, MAX_CONFIGURABLE_STRUCTURE_FILES],
  ];
  for (const [field, minimum, maximum] of integerRanges) {
    const value = input[field];
    if (
      value !== undefined &&
      (typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < minimum ||
        value > maximum)
    )
      throw schemaError(
        input,
        field,
        `must be an integer from ${String(minimum)} through ${String(maximum)}`,
      );
  }
}

function validateRequired(input: Record<string, unknown>, mode: SignalGrepMode): void {
  if (
    (mode === "concept" || mode === "hybrid") &&
    (typeof input.query !== "string" || !input.query.trim())
  )
    throw capabilityError(
      "E_MODE_QUERY_REQUIRED",
      mode,
      "query",
      `mode=${mode} requires a nonempty natural-language query`,
      `mode=${mode} requires query; provide the natural-language question and retry`,
    );
  if (mode === "await" || mode === "cancel") {
    if (typeof input.operationId !== "string" || !input.operationId.trim())
      throw capabilityError(
        "E_OPERATION_ID_REQUIRED",
        mode,
        "operationId",
        `${mode} requires the exact operationId returned by a prior waiting result`,
        `${mode} requires operationId; copy the returned nextRequest exactly`,
      );
  }
}

function validateOutlineCapability(input: Record<string, unknown>, mode: SignalGrepMode): void {
  if (mode !== "outline") return;
  const capability = outlineCapability(typeof input.path === "string" ? input.path : undefined);
  if (!capability.supported && typeof input.path === "string")
    throw outlineCapabilityError(input.path, mode);
}

/** Shared outline capability check for a path resolved from a cursor/document. */
export function outlineCapabilityError(
  path: string,
  mode: SignalGrepMode = "outline",
  resolvedDocument = false,
): RequestContractError | undefined {
  const capability = outlineCapability(path, resolvedDocument);
  if (capability.supported) return undefined;
  const extension = capability.extension ?? "extensionless source";
  return capabilityError(
    "E_MODE_UNSUPPORTED",
    mode,
    "language",
    `outline requires a declared language outline capability; ${extension} is unsupported`,
    `mode=outline is unavailable for ${extension}; choose a language capability from mode=capabilities or use ordinary content search`,
  );
}

/** Validate the mode contract before dispatch. This is the sole field-policy entry point. */
export function validateRequestContract(input: SignalGrepInput): void {
  const value: unknown = input;
  if (!record(value)) throw schemaError({}, "request", "request must be an object");
  const raw = value;
  validateValueRanges(raw);
  const mode = modeOf(raw);
  if (!mode)
    throw capabilityError(
      "E_MODE_UNKNOWN",
      inputModeLabel(raw),
      "mode",
      `mode must be one of ${SIGNAL_GREP_MODES.join(", ")}`,
      "Choose one of the advertised modes and retry",
    );
  if (raw.sourceCursor !== undefined && mode !== "inspect")
    throw capabilityError(
      "E_SOURCE_CURSOR_MODE",
      mode,
      "sourceCursor",
      "sourceCursor is only valid with mode=inspect",
      "Copy the source continuation request with mode=inspect",
    );
  if (raw.operationId !== undefined && mode !== "await" && mode !== "cancel")
    throw capabilityError(
      "E_OPERATION_MODE",
      mode,
      "operationId",
      "operationId is only valid with mode=await or mode=cancel",
      "Copy the returned await or cancel request exactly",
    );
  validateRequired(raw, mode);
  validateOutlineCapability(raw, mode);

  if (mode === "auto" && raw.query !== undefined)
    throw capabilityError(
      "E_MODE_REQUIRED",
      mode,
      "query",
      "query is ambiguous without an explicit discovery or semantic mode",
      'Use mode="files" for filename discovery or mode="concept" for semantic discovery',
    );

  if (mode === "files" && raw.scope === "expand")
    throw new RequestContractError(
      {
        code: "E_FILES_SCOPE_EXPAND",
        mode,
        issues: [
          { field: "scope", reason: "scope=expand has no semantics-preserving files repair" },
        ],
        recovery: {
          action: "manual",
          reason:
            "Choose mode=files with the intended discovery root and preserve path/filters explicitly.",
        },
      },
      "mode=files does not support scope=expand; choose the intended discovery root explicitly and preserve path/glob/exclude/hidden filters",
    );

  const allowed = new Set(MODE_FIELDS_BY_MODE[mode]);
  if (mode === "inspect" && raw.sourceCursor !== undefined) {
    allowed.clear();
    for (const field of ["mode", "sourceCursor", "redact"] as const) allowed.add(field);
  }
  if (
    (mode === "auto" || mode === "summary" || mode === "matches") &&
    typeof raw.cursor === "string" &&
    raw.cursor.includes(".analysis")
  ) {
    allowed.clear();
    for (const field of ["mode", "cursor", "redact"] as const) allowed.add(field);
  }
  if (
    (mode === "auto" || mode === "summary" || mode === "matches") &&
    typeof raw.cursor === "string" &&
    raw.cursor.trim().length > 0 &&
    !raw.cursor.includes(".analysis")
  ) {
    allowed.clear();
    for (const field of ["mode", "cursor", "path", "paths", "redact"] as const) allowed.add(field);
  }
  const allowedNames = new Set<string>(allowed);
  const invalid = Object.keys(raw).filter((field) => !allowedNames.has(field));
  const selectorIssues = selectorIssuesFor(raw, mode);
  if (invalid.length > 0) {
    throw fieldsError(raw, mode, invalid, selectorIssues);
  }
  if (selectorIssues.length > 0) throw selectorError(raw, mode, selectorIssues);
}

/** Build the schema-side typed failure for values rejected before service dispatch. */
export function schemaContractError(
  value: unknown,
  field: string | undefined,
  message: string,
): RequestContractError {
  const raw = record(value) ? value : {};
  const normalized = boundedField(field?.replace(/^\//u, "") || "request");
  if (normalized === "context")
    return schemaError(
      raw,
      "context",
      `must be an integer from 0 through ${String(MAX_CONTEXT_LINES)}; choose the desired bounded context explicitly`,
    );
  const mode = inputModeLabel(raw);
  return new RequestContractError(
    {
      code: "E_SCHEMA",
      ...(mode ? { mode } : {}),
      issues: [{ field: normalized, reason: message }],
      recovery: {
        action: "manual",
        reason:
          "Correct the value according to the advertised schema; no value is clamped or guessed.",
      },
    },
    `Invalid baoer_signal_grep arguments at /${normalized}: ${message}`,
  );
}
