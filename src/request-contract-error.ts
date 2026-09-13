import {
  SignalGrepError,
  type SignalGrepDiagnosticDetails,
  type SignalGrepDiagnosticIssue,
  type SignalGrepDiagnosticRecovery,
  type SignalGrepRecoveryAction,
} from "./errors.js";

/** One bounded protocol budget shared by the typed error and its projections. */
export const MAX_REQUEST_RECOVERY_BYTES = 64 * 1024;
const MAX_REQUEST_DISPLAY_CHARACTERS = 256;

export function boundedDisplay(value: string, maximum = MAX_REQUEST_DISPLAY_CHARACTERS): string {
  const normalized = value.toWellFormed();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}…`;
}

export type RequestIssue = SignalGrepDiagnosticIssue;
export type RequestRecoveryAction = SignalGrepRecoveryAction;
export type RequestRecovery = SignalGrepDiagnosticRecovery;
export type RequestContractDetails = SignalGrepDiagnosticDetails;

/** A typed boundary error; callers can project it without parsing message text. */
export class RequestContractError extends SignalGrepError {
  readonly code: string;
  readonly mode: string | undefined;
  readonly issues: readonly RequestIssue[];
  readonly recovery: RequestRecovery;

  constructor(details: RequestContractDetails, message: string) {
    super(message);
    this.name = "RequestContractError";
    this.code = details.code;
    this.mode = details.mode;
    this.issues = details.issues;
    this.recovery = details.recovery;
  }

  get details(): RequestContractDetails {
    return boundedRequestContractDetails({
      code: this.code,
      ...(this.mode ? { mode: this.mode } : {}),
      issues: this.issues,
      recovery: this.recovery,
    });
  }
}

export function isSignalGrepDiagnosticError(
  error: unknown,
): error is import("./errors.js").SignalGrepDiagnosticError {
  if (!(error instanceof Error)) return false;
  const details = Reflect.get(error, "details");
  return typeof details === "object" && details !== null;
}

/**
 * Bound every machine-readable projection before it reaches a host. If an
 * exact request or diagnostic cannot fit, omit recovery instead of emitting a
 * truncated JSON object that appears copyable.
 */
export function boundedRequestContractDetails(
  details: RequestContractDetails,
): RequestContractDetails {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(details);
  } catch {
    serialized = undefined;
  }
  if (serialized !== undefined && Buffer.byteLength(serialized) <= MAX_REQUEST_RECOVERY_BYTES)
    return details;
  return {
    code: boundedDisplay(details.code, 128),
    ...(details.mode ? { mode: boundedDisplay(details.mode, 128) } : {}),
    issues: [
      {
        field: "<payload>",
        reason: "The request-contract diagnostic exceeded the bounded payload budget.",
      },
    ],
    recovery: {
      action: "manual",
      reason:
        "Exact recovery was omitted because the request-contract payload exceeded its bounded budget; preserve valid selectors and filters and correct the request explicitly.",
    },
  };
}
