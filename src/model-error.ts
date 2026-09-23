import { types } from "node:util";
import {
  boundedRequestContractDetails,
  isSiftLightDiagnosticError,
  MAX_REQUEST_RECOVERY_BYTES,
} from "./request-contract.js";
import type { SiftLightDiagnosticError } from "./errors.js";
import type { RequestContractDetails } from "./request-contract.js";

const MAX_RAW_ERROR_SCAN_CHARACTERS = 4_096;
const MAX_MODEL_ERROR_CHARACTERS = 1_024;
const MODEL_ERROR_PREFIX = "sift-light failed:";

function errorMessage(error: unknown): string {
  try {
    if (types.isNativeError(error)) {
      const message = Object.getOwnPropertyDescriptor(error, "message");
      if (!message) return "unknown failure";
      return typeof message.value === "string" ? message.value : "unreadable failure";
    }
    if (error === null) return "null";
    switch (typeof error) {
      case "string":
        return error;
      case "number":
        return String(error);
      case "boolean":
        return error ? "true" : "false";
      case "undefined":
        return "undefined";
      case "bigint":
        return "bigint failure";
      case "symbol":
        return "symbol failure";
      case "function":
      case "object":
        return "non-error failure";
      default:
        return "unreadable failure";
    }
  } catch {
    return "unreadable failure";
  }
}

/** One bounded model-facing diagnostic; never serialize causes, stacks, or repeated request text. */
export function modelErrorText(error: unknown): string {
  if (isSiftLightDiagnosticError(error)) return requestContractErrorText(error);
  const raw = errorMessage(error);
  const normalized = raw
    .slice(0, MAX_RAW_ERROR_SCAN_CHARACTERS)
    .toWellFormed()
    .replace(/\s+/gu, " ")
    .trim();
  const message = normalized.replace(/^(?:sift-light failed:\s*)+/u, "") || "unknown failure";
  const text = `${MODEL_ERROR_PREFIX} ${message}`;
  if (text.length <= MAX_MODEL_ERROR_CHARACTERS) return text;
  return `${text.slice(0, MAX_MODEL_ERROR_CHARACTERS - 1).toWellFormed()}…`;
}

/**
 * Contract recovery is a copy protocol, so it must bypass the generic model
 * error whitespace normalization and character truncation.  The contract
 * builder omits oversized next requests instead of allowing a false exact
 * retry to be emitted.
 */
export function requestContractErrorText(error: SiftLightDiagnosticError): string {
  return requestContractProjection(error).text;
}

export interface RequestContractProjection {
  details: RequestContractDetails;
  text: string;
}

function projectRequestContract(projected: RequestContractDetails, serialized: string): string {
  const recovery = projected.recovery;
  const next = recovery.nextRequest
    ? "\nCopy the nested recovery.nextRequest object unchanged; do not repeat the original query."
    : `\nRecovery action: ${recovery.action}.`;
  // Put the machine payload first so simple host adapters that locate the
  // first `nextRequest` marker see the exact nested request object.
  return `\nsift-light failed: request rejected [${projected.code}].\nError details: ${serialized}${next}`;
}

/** Build the one bounded contract projection consumed by structured and text hosts. */
export function requestContractProjection(
  error: SiftLightDiagnosticError,
): RequestContractProjection {
  const details = boundedRequestContractDetails(error.details);
  const serializedDetails = JSON.stringify(details);
  const result = projectRequestContract(details, serializedDetails);
  if (Buffer.byteLength(result) <= MAX_REQUEST_RECOVERY_BYTES) return { details, text: result };
  const compact: RequestContractDetails = {
    code: details.code,
    ...(details.mode ? { mode: details.mode } : {}),
    issues: [
      {
        field: "<payload>",
        reason: "The visible request-contract error exceeded its bounded payload budget.",
      },
    ],
    recovery: {
      action: "manual" as const,
      reason: "Exact recovery was omitted; correct the request explicitly.",
    },
  };
  const compactText = projectRequestContract(compact, JSON.stringify(compact));
  return { details: compact, text: compactText };
}
