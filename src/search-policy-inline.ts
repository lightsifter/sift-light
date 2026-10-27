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
    const readsFile = /\b(?:readFile(?:Sync)?|createReadStream)\s*\(/u.test(program);
    const searches = /\.(?:includes|indexOf|match|matchAll|search|test)\s*\(/u.test(program);
    return readsFile && searches ? "content" : undefined;
  }
  if (
    /\b(?:os\.walk|os\.listdir|os\.scandir|glob\.(?:i?glob)|\w+\.(?:rglob|glob))\s*\(/u.test(
      program,
    )
  )
    return "files";
  const readsFile = /\b(?:open|\w+\.read_text|\w+\.read_bytes)\s*\(/u.test(program);
  const searches =
    /\b(?:re\.(?:search|match|findall|finditer)|\w+\.(?:find|index|count))\s*\(|\bin\s+\w/u.test(
      program,
    );
  return readsFile && searches ? "content" : undefined;
}
