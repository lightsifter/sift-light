import { SiftLightError } from "./errors.js";
import type { SiftLightInput } from "./service.js";

/**
 * Field names that callers commonly send as a mode. They are not modes: the field
 * alone selects the multi-term search. The schema accepts them so the request can
 * be served, and the result discloses the normalization.
 */
export const MODE_ALIASES = ["anyOf", "allOf"] as const;
export type ModeAlias = (typeof MODE_ALIASES)[number];

/** Public request shape before alias normalization. */
export type SiftLightRequest = Omit<SiftLightInput, "mode"> & {
  mode?: SiftLightInput["mode"] | ModeAlias;
};

export interface NormalizedRequest {
  input: SiftLightInput;
  notes: string[];
}

/**
 * The single place where unambiguous request shapes are rewritten before the
 * mode contract runs. Every rewrite preserves the requested scope and evidence
 * semantics and is reported back as a note; anything ambiguous still fails.
 */
export function normalizeRequestAliases(request: SiftLightRequest): NormalizedRequest {
  const notes: string[] = [];
  const { mode, ...rest } = request;
  let input: SiftLightInput = rest;
  if (mode === "anyOf" || mode === "allOf") {
    if (request[mode] === undefined)
      throw new SiftLightError(`mode=${mode} is not a mode; pass ${mode}:[...terms] and omit mode`);
    notes.push(`mode="${mode}" is not a mode; the ${mode} field alone selects this search.`);
  } else if (mode === "summary" && request.anyOf !== undefined) {
    notes.push(
      "anyOf returns one analysis page whose header already carries per-file statistics; mode=summary was served by that page.",
    );
  } else if (mode !== undefined) {
    input = { ...rest, mode };
  }
  if (input.sourceCursor !== undefined && input.line !== undefined) {
    const { line: _line, ...withoutLine } = input;
    input = withoutLine;
    notes.push("line is ignored with sourceCursor; the continuation selects its own source range.");
  }
  return { input, notes };
}
