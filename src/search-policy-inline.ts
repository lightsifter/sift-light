import type { SearchKind } from "./search-policy-commands.js";

/** Best-effort detection of literal inline programs; this is not code execution isolation. */
export function classifyInlineSearch(
  name: string,
  args: readonly (string | null)[],
): SearchKind | undefined {
  const node = /^(?:node|nodejs|bun|deno)$/u.test(name);
  const python = /^python(?:\d+(?:\.\d+)?)?$/u.test(name);
  if (!node && !python) return undefined;
  const option = args.findIndex((arg) => (node ? arg === "-e" || arg === "--eval" : arg === "-c"));
  const program = option < 0 ? undefined : args[option + 1];
  if (typeof program !== "string") return undefined;

  if (node) {
    if (/\b(?:readdir(?:Sync)?|opendir(?:Sync)?|glob(?:Sync)?)\s*\(/u.test(program)) return "files";
    const directSearch =
      /\breadFile(?:Sync)?\s*\([^)]*\)\s*\.(?:includes|indexOf|match|matchAll|search)\s*\(/u;
    if (directSearch.test(program)) return "content";
    const text =
      /\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:(?:[\w$.]+|require\s*\([^)]*\))\.)?readFile(?:Sync)?\s*\([^)]*\)/gu;
    for (const match of program.matchAll(text)) {
      const variable = match[1];
      const calls =
        /(?<![\w$])([\w$]+)\s*\.(?:includes|indexOf|match|matchAll|search)\s*\(|\.test\s*\(\s*([\w$]+)\s*\)/gu;
      for (const call of program.matchAll(calls)) {
        if (call[1] === variable || call[2] === variable) return "content";
      }
    }
    return undefined;
  }
  if (
    /\b(?:os\.walk|os\.listdir|os\.scandir|glob\.(?:i?glob)|\w+\.(?:rglob|glob))\s*\(/u.test(
      program,
    )
  )
    return "files";
  const read = String.raw`(?:open\s*\([^)]*\)\s*\.read\s*\(\s*\)|\w+\.read_(?:text|bytes)\s*\([^)]*\))`;
  if (
    new RegExp(
      String.raw`["'][^"']+["']\s+in\s+${read}|${read}\s*\.(?:find|index|count)\s*\(`,
      "u",
    ).test(program)
  )
    return "content";
  const text = new RegExp(String.raw`\b(\w+)\s*=\s*${read}`, "gu");
  for (const match of program.matchAll(text)) {
    const variable = match[1]!;
    if (
      new RegExp(
        String.raw`["'][^"']+["']\s+in\s+${variable}\b|\b${variable}\s*\.(?:find|index|count)\s*\(|\bre\.(?:search|match|findall|finditer)\s*\([^,]+,\s*${variable}\b`,
        "u",
      ).test(program)
    )
      return "content";
  }
  return new RegExp(
    String.raw`\bre\.(?:search|match|findall|finditer)\s*\([^,]+,\s*${read}`,
    "u",
  ).test(program)
    ? "content"
    : undefined;
}
