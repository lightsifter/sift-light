import { types } from "node:util";
import {
  boundedRequestContractDetails,
  isSiftlightDiagnosticError,
  MAX_REQUEST_RECOVERY_BYTES,
} from "./request-contract.js";
import type { SiftlightDiagnosticError } from "./errors.js";
import type { RequestContractDetails } from "./request-contract.js";

const MAX_RAW_ERROR_SCAN_CHARACTERS = 4_096;
const MAX_MODEL_ERROR_CHARACTERS = 1_024;
const MODEL_ERROR_PREFIX = "siftlight failed:";

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
  if (isSiftlightDiagnosticError(error)) return requestContractErrorText(error);
  const raw = errorMessage(error);
  const normalized = raw
    .slice(0, MAX_RAW_ERROR_SCAN_CHARACTERS)
    .toWellFormed()
    .replace(/\s+/gu, " ")
    .trim();
  const message = normalized.replace(/^(?:siftlight failed:\s*)+/u, "") || "unknown failure";
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
export function requestContractErrorText(error: SiftlightDiagnosticError): string {
  return requestContractProjection(error).text;
}

export interface RequestContractProjection {
  details: RequestContractDetails;
  text: string;
}

function projectRequestContract(
  projected: RequestContractDetails,
  serialized: string,
  message: string,
): string {
  const prefix = `siftlight failed: request rejected [${projected.code}]: ${message}`;
  const recovery = projected.recovery;
  const next = recovery.nextRequest
    ? "\nCopy the nested recovery.nextRequest object unchanged; do not repeat the original query."
    : `\nRecovery action: ${recovery.action}. ${recovery.reason}`;
  // Put the machine payload first so simple host adapters that locate the
  // first `nextRequest` marker see the exact nested request object.
  return `\nError details: ${serialized}\n${prefix}${next}`;
}

/** Build the one bounded contract projection consumed by structured and text hosts. */
export function requestContractProjection(
  error: SiftlightDiagnosticError,
): RequestContractProjection {
  const details = boundedRequestContractDetails(error.details);
  const serializedDetails = JSON.stringify(details);
  const boundedMessage = error.message.toWellFormed().slice(0, 1_024);
  const result = projectRequestContract(details, serializedDetails, boundedMessage);
  if (Buffer.byteLength(result) <= MAX_REQUEST_RECOVERY_BYTES) return { details, text: result };
  const compact: RequestContractDetails = {
    code: boundedMessage.length > 0 ? details.code : "E_REQUEST_CONTRACT_PAYLOAD",
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
  const compactText = projectRequestContract(
    compact,
    JSON.stringify(compact),
    "The request-contract error exceeded the bounded payload budget; correct the request explicitly.",
  );
  return { details: compact, text: compactText };
}
