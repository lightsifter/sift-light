export class SignalGrepError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SignalGrepError";
  }
}

export type SignalGrepRecoveryAction = "retry" | "choose-capability" | "manual";

export interface SignalGrepDiagnosticIssue {
  field: string;
  reason: string;
}

export interface SignalGrepDiagnosticRecovery {
  action: SignalGrepRecoveryAction;
  reason: string;
  nextRequest?: Record<string, unknown>;
}

export interface SignalGrepDiagnosticDetails {
  code: string;
  mode?: string;
  issues: readonly SignalGrepDiagnosticIssue[];
  recovery: SignalGrepDiagnosticRecovery;
}

export interface SignalGrepDiagnosticError extends Error {
  readonly details: SignalGrepDiagnosticDetails;
}

/** A bounded Concept provider failure that hybrid retrieval may expose as skipped coverage. */
export class ConceptUnavailableError extends SignalGrepError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConceptUnavailableError";
  }
}

export type RipgrepInputErrorCode = "E_REGEX_INVALID" | "E_SEARCH_PATH_NOT_FOUND";

/** A bounded, non-retrying diagnostic for an invalid search input at ripgrep's boundary. */
export class RipgrepInputError extends SignalGrepError {
  readonly code: RipgrepInputErrorCode;
  readonly guidance: string;
  readonly details: SignalGrepDiagnosticDetails;

  constructor(code: RipgrepInputErrorCode, message: string, guidance: string) {
    super(`${message} ${guidance}`);
    this.name = "RipgrepInputError";
    this.code = code;
    this.guidance = guidance;
    this.details = {
      code,
      issues: [
        {
          field: code === "E_REGEX_INVALID" ? "pattern" : "path",
          reason: guidance,
        },
      ],
      recovery: { action: "manual", reason: guidance },
    };
  }
}

export class CursorError extends SignalGrepError {
  readonly code:
    | "E_CURSOR_MALFORMED"
    | "E_CURSOR_NOT_FOUND"
    | "E_CURSOR_EXPIRED"
    | "E_CURSOR_WRONG_KIND"
    | "E_CURSOR_OPTIONS_CONFLICT"
    | "E_CURSOR_OFFSET_INVALID";

  constructor(
    message: string,
    code:
      | "E_CURSOR_MALFORMED"
      | "E_CURSOR_NOT_FOUND"
      | "E_CURSOR_EXPIRED"
      | "E_CURSOR_WRONG_KIND"
      | "E_CURSOR_OPTIONS_CONFLICT"
      | "E_CURSOR_OFFSET_INVALID" = "E_CURSOR_MALFORMED",
  ) {
    super(`${code}: ${message}`);
    this.name = "CursorError";
    this.code = code;
  }
}

export function abortError(): Error {
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}
