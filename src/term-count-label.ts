/** Input literals are query metadata; hide them only when redaction is requested. */
export function termCountLabel(term: string, index: number, redact = false): string {
  return redact
    ? `condition #${String(index + 1)}`
    : `#${String(index + 1)} ${JSON.stringify(term)}`;
}
