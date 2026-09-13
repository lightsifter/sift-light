import type { SignalGrepResult } from "./types.js";

const PRIVATE_KEY = /-----BEGIN ([^-\r\n]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g;
const SENSITIVE_NAME = String.raw`(?:(?:[A-Za-z][A-Za-z0-9]*[_-])*(?:password|passwd|secret|token|api[_-]?key|access[_-]?(?:key|token)|secret[_-]?access[_-]?key|private[_-]?key|service[_-]?key)(?:[_-][A-Za-z0-9]+)*)`;
const SENSITIVE_ASSIGNMENT = new RegExp(
  String.raw`((?<![A-Za-z0-9_-])(?:["']?${SENSITIVE_NAME}["']?)\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\r\n]+)`,
  "gi",
);
const SENSITIVE_TOKEN = /\b(?:sk|ghp|xox[baprs])[-_][A-Za-z0-9][A-Za-z0-9_-]{7,}\b/g;
const TYPE_ONLY_VALUES = new Set([
  "boolean",
  "number",
  "string",
  "unknown",
  "never",
  "undefined",
  "null",
]);

function redactString(value: string): { value: string; count: number } {
  let count = 0;
  let redacted = value.replace(PRIVATE_KEY, (_match, kind: string) => {
    count += 1;
    return `-----BEGIN ${kind}-----\n[REDACTED]\n-----END ${kind}-----`;
  });
  redacted = redacted.replace(
    SENSITIVE_ASSIGNMENT,
    (match: string, prefix: string, rawValue: string) => {
      const unquoted = rawValue.replace(/^["']|["']$/g, "").toLowerCase();
      if (TYPE_ONLY_VALUES.has(unquoted)) return match;
      count += 1;
      return `${prefix}"[REDACTED]"`;
    },
  );
  redacted = redacted.replace(SENSITIVE_TOKEN, () => {
    count += 1;
    return "[REDACTED]";
  });
  return { value: redacted, count };
}

/** Apply the same display redaction recognizer to bounded runtime diagnostics. */
export function redactDiagnosticText(value: string): string {
  return redactString(value).value;
}

/** Reuse the display redaction recognizer before placing request data in an error. */
export function containsSensitiveText(value: unknown): boolean {
  if (typeof value === "string") return redactString(value).count > 0;
  if (Array.isArray(value)) return value.some((item) => containsSensitiveText(item));
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).some((item) => containsSensitiveText(item));
}

function redactInPlace(value: unknown, seen: WeakSet<object>): number {
  if (typeof value !== "object" || value === null) return 0;
  if (seen.has(value)) return 0;
  seen.add(value);
  if (Array.isArray(value)) {
    let count = 0;
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (typeof item === "string") {
        const redacted = redactString(item);
        value[index] = redacted.value;
        count += redacted.count;
      } else count += redactInPlace(item, seen);
    }
    return count;
  }
  let count = 0;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      const redacted = redactString(item);
      Reflect.set(value, key, redacted.value);
      count += redacted.count;
    } else count += redactInPlace(item, seen);
  }
  return count;
}

/** Display-only policy: search and source-version facts stay exact, every returned string is masked. */
export function redactSignalGrepResult(result: SignalGrepResult): SignalGrepResult {
  const text = redactString(result.text);
  const details = structuredClone(result.details);
  const redactedCount = text.count + redactInPlace(details, new WeakSet());
  return {
    text: text.value,
    details: {
      ...details,
      redactedCount,
      redactionApplied: true,
    },
  };
}
