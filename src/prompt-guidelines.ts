import { MAX_INSPECT_TARGETS } from "./types.js";
import { DEFAULT_MCP_OUTPUT_MODE, type SignalGrepMcpOutputMode } from "./mcp-output.js";

export function signalGrepPromptGuidelines(structuredOutput = true): string[] {
  return [
    `Use baoer_signal_grep for content search. Start with pattern and optional path; omit mode and limit to let auto choose a complete small result or a broad summary. Use literal=true for literal code fragments rather than escaping them as regex.`,
    `An omitted path searches the project cwd. Use scope:"strict" for a question restricted to one path; otherwise, if an explicit subpath has zero matches, ordinary and content-analysis searches retry from cwd and return project-wide matches with an expansion notice. Explicit absolute paths and .. traversal can search outside cwd, except protected external system areas and .git internals. Git changes mode remains cwd-scoped.`,
    `For source navigation, imports/tests use the containing Git repository and bounded static module resolution.`,
    `Use sufficient exact-match evidence directly; do not inspect or reread it only to obtain a citation, since returned matches already have path/line numbers. When definitions repeat, inspect the relevant imports and surrounding source before choosing the authoritative file.`,
    `Use the file samples in baoer_signal_grep summaries to choose evidence. Reuse the visible cursor with path or paths for matching lines; mode=summary pages the remaining files. Match counts are not relevance scores.`,
    `When source context is missing, use one baoer_signal_grep batch before reading whole files: {mode:"inspect",cursor:"<returned cursor>",matchIndices:[1,2]} or {mode:"inspect",targets:[{path:"src/example.ts",line:42}]}, at most ${String(MAX_INSPECT_TARGETS)} locations. Copy actual returned selectors. Inspection chooses its own bounded window: omit pattern, context, limit, glob, exclude, literal, ignoreCase and hidden.`,
    `Use allOf:["term1","term2"] for explicit same-file literal AND. Add within:"function" only together with allOf to restrict that conjunction to one own-implementation JS/TS/TSX function; omit within for ordinary single-pattern searches. Use roles:["declaration"] or roles:["call"] with a single pattern for JS/TS/TSX/Go syntactic occurrences.`,
    `Use anyOf:["term1","term2"] when every exact occurrence of 2-64 literals is needed in one version-bound result. It is case-sensitive, reports retained counts per input term, and runs requests above eight terms as bounded parallel chunks. Large term-count inventories have separate termCountsNextRequest pages; copy those requests to retrieve the complete term map.`,
    `For a changed-code question, add changes:{base:"HEAD",scope:"lines",side:"new"}; omit target for the working tree, use side:"old" for deleted evidence. Copy returned continuation requests to preserve source versions.`,
    `Use mode:"capabilities" when the language or requested operation is unclear to get a compact lazy inventory. Use mode:"outline" with a concrete source file path, not a directory, to see symbols, mode:"imports" with path and a binding symbol or line to follow static named/default ESM links, and mode:"tests" with path for related test candidates. tests supports JS/TS/TSX; Python supports outline; Swift supports ordinary search and source inspection. Imports/tests accept glob, exclude and hidden to narrow the candidate scope; the target source remains admitted. Import links do not prove runtime calls; test candidates do not prove coverage or passing tests.`,
    `Use mode:"files" plus query for unknown filenames and fuzzy paths. Multi-word file queries require each word literally in the path; business concepts belong in hybrid/concept. Use wholeWord:true for a single-pattern whole-word search. exclude contains file globs, not content negation.`,
    `Use mode:"structure" only for JS/TS/TSX/Go, with a required nonempty ast-grep pattern such as "compare($X, $X)" or "send()" for code shapes across whitespace; no lang, literal/regex or scope options. Use path/glob/exclude to narrow admitted syntax.`,
    `Use mode:"concept" plus a natural-language query when names are unknown. It runs a pinned local multilingual model only after explicit installation; no search downloads weights or sends code to a remote model. Every passage admitted by the source budget is ranked through token-safe windows, and content-addressed embeddings are reused from a bounded local cache. Similarity scores identify source candidates, not proof. File/concept/structure discovery never expands its requested path.`,
    `Use mode:"hybrid" plus query when wording may differ from the source. It always runs exact literal and local concept retrieval, keeps exact evidence first, removes semantic passages that overlap exact evidence, and retains the top three non-overlapping semantic candidates by default. conceptLimit changes only that semantic supplement. Hybrid uses one pageable snapshot and never treats similarity as exact evidence.`,
    `If inspection reports missing source, execute its complete nextRequest with sourceCursor. Never treat a partial source excerpt as the complete implementation.`,
    `If a request is rejected, keep the strongest applicable mode and follow its repair instruction exactly once. Do not paste the error or rejected request into the retry, repeat an unchanged request, or switch to a weaker search because of a fixable argument error. Only an explicit capability-unavailable result permits a bounded alternative, which remains partial and must not be presented as complete.`,
    structuredOutput
      ? `When status=partial, read details.analysis.coverage to see which conclusion is incomplete; an exact occurrence count may remain complete even when syntax or related-test analysis is partial.`
      : `When status=partial, read the visible Coverage and bracketed reasons to see which conclusion is incomplete; an exact occurrence count may remain complete even when syntax or related-test analysis is partial.`,
  ];
}

function signalGrepModelGuidelines(): string[] {
  return [
    `Search with pattern and optional path; literal=true avoids regex escaping. Omit mode/limit for auto detail/summary. Omitted path uses cwd; scope:"strict" forbids expansion. paths selects retained cursor files only; split new multi-root searches.`,
    `Use sufficient exact evidence directly. Copy returned cursor/nextRequest/inspect selectors; batch inspect at most ${String(MAX_INSPECT_TARGETS)} targets. A complete snapshot may have unread pages or truncated lines: continue or inspect as needed, never restart just to change limit. A partial status is not complete; read coverage.`,
    `Modes: capabilities for language prerequisites; files+query for filenames (not business intent); anyOf/allOf for literal terms; outline/imports/tests for static evidence; structure for AST patterns; concept/hybrid for semantic candidates. Similarity and static links are not proof.`,
    `On rejection keep the strongest applicable mode and apply the stated repair once. Do not repeat the rejected request or include its error. Only explicit capability-unavailable permits a visibly partial alternative.`,
  ];
}

export function signalGrepMcpInstructions(
  outputMode: SignalGrepMcpOutputMode = DEFAULT_MCP_OUTPUT_MODE,
): string {
  const outputInstruction =
    outputMode === "structured"
      ? "Successful MCP results provide text (the complete formatted evidence page) and details (counts, coverage and continuation selectors). The text content block contains the same page. Use either representation; do not treat the two copies as separate evidence."
      : outputMode === "model"
        ? "Returns one model-facing text page. Compact rows share path/inspect cursor; use visible item numbers and copy continuation requests exactly."
        : "Successful MCP results provide one complete formatted text page, including counts, coverage and continuation selectors.";
  return [
    "Use baoer_signal_grep for read-only local search and bounded source inspection from the configured project cwd.",
    outputInstruction,
    ...(outputMode === "model"
      ? signalGrepModelGuidelines()
      : signalGrepPromptGuidelines(outputMode === "structured")),
  ].join("\n");
}
