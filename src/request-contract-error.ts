import {
  SiftLightError,
  type SiftLightDiagnosticDetails,
  type SiftLightDiagnosticIssue,
  type SiftLightDiagnosticRecovery,
  type SiftLightRecoveryAction,
} from "./errors.js";

/** One bounded protocol budget shared by the typed error and its projections. */
export const MAX_REQUEST_RECOVERY_BYTES = 64 * 1024;
const MAX_REQUEST_DISPLAY_CHARACTERS = 256;

export function boundedDisplay(value: string, maximum = MAX_REQUEST_DISPLAY_CHARACTERS): string {
  const normalized = value.toWellFormed();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}…`;
}

export type RequestIssue = SiftLightDiagnosticIssue;
export type RequestRecoveryAction = SiftLightRecoveryAction;
export type RequestRecovery = SiftLightDiagnosticRecovery;
export type RequestContractDetails = SiftLightDiagnosticDetails;

/** A typed boundary error; callers can project it without parsing message text. */
export class RequestContractError extends SiftLightError {
  readonly #details: RequestContractDetails;

  constructor(details: RequestContractDetails, message: string) {
    super(message);
    this.name = "RequestContractError";
    this.#details = details;
  }

  get code(): string {
    return this.#details.code;
  }

  get mode(): string | undefined {
    return this.#details.mode;
  }

  get issues(): readonly RequestIssue[] {
    return this.#details.issues;
  }

  get recovery(): RequestRecovery {
    return this.#details.recovery;
  }

  get details(): RequestContractDetails {
    return boundedRequestContractDetails(this.#details);
  }
  toJSON(): RequestContractDetails & { name: string } {
    return { name: this.name, ...this.details };
  }
}

export function isSiftLightDiagnosticError(
  error: unknown,
): error is import("./errors.js").SiftLightDiagnosticError {
  if (!(error instanceof Error)) return false;
  const details = "details" in error ? error.details : undefined;
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
