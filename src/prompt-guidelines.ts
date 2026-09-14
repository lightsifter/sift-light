import { DEFAULT_MCP_OUTPUT_MODE, type SignalGrepMcpOutputMode } from "./mcp-output.js";

export function signalGrepPromptGuidelines(structuredOutput = true): string[] {
  return [
    `Use baoer_signal_grep for read-only content search. Results are metadata-only: never expect source lines, excerpts, AST text, signatures or diffs. Omit mode and limit for a compact statistical summary; use mode="matches" or a cursor only when file and line metadata is needed.`,
    `An omitted path searches the project cwd. Use scope:"strict" for a question restricted to one path; otherwise, if an explicit subpath has zero matches, ordinary and content-analysis searches retry from cwd and return project-wide counts with an expansion notice. Explicit absolute paths and .. traversal can search outside cwd, except protected external system areas and .git internals. Git changes mode remains cwd-scoped.`,
    `Search output includes counts, categories, ranked paths, coverage and continuation metadata, but never echoes the raw pattern or query. Use the host read capability separately when source text is explicitly required for an edit or verification.`,
    `Use file and directory distributions to choose evidence. Reuse the visible cursor with path or paths for match metadata; mode="summary" pages the remaining file statistics. Match counts are not relevance scores.`,
    `Mode="inspect" verifies a selected location and returns only path, line, parser status and source-revision metadata; it does not return source. Do not use inspection merely to obtain a citation.`,
    `Use allOf:["term1","term2"] for explicit same-file literal AND. Add within:"function" only together with allOf to restrict that conjunction to one own-implementation JS/TS/TSX function; omit within for ordinary single-pattern searches. Use roles:["declaration"] or roles:["call"] with a single pattern for JS/TS/TSX/Go syntactic occurrence statistics.`,
    `Use anyOf:["term1","term2"] when every exact occurrence of 2-64 literals is needed in one version-bound result. It is case-sensitive, reports anonymized condition counts, and runs requests above eight terms as bounded parallel chunks. Large condition inventories have separate continuation pages; copy those requests to retrieve the complete counts.`,
    `For a changed-code question, add changes:{base:"HEAD",scope:"lines",side:"new"}; omit target for the working tree, use side:"old" for deleted-side statistics. Copy returned continuation requests to preserve source versions.`,
    `Use mode:"capabilities" when the language or requested operation is unclear to get a compact lazy inventory. Use mode:"outline" with a concrete source file path to get symbol counts and locations without names or signatures, mode:"imports" for static relationship counts, and mode:"tests" for related-test candidate counts. These modes do not expose source text.`,
    `Use mode:"files" plus query for unknown filenames and fuzzy paths. Multi-word filename queries require each word literally in the path; business concepts belong in hybrid/concept. Use wholeWord:true for a single-pattern whole-word search. exclude contains file globs, not content negation.`,
    `Use mode:"structure" only for JS/TS/TSX/Go, with a required nonempty ast-grep pattern such as "compare($X, $X)" or "send()" for code shapes across whitespace; the result reports structural counts and locations without source text.`,
    `Use mode:"concept" plus a natural-language query when names are unknown. It runs a pinned local multilingual model only after explicit installation; no search downloads weights or sends code to a remote model. Results expose candidate counts, score statistics and paths, never ranked passages. Similarity scores identify candidates, not correctness.`,
    `Use mode:"hybrid" plus query when wording may differ from the source. It reports exact and semantic counts separately, removes overlap, and retains one pageable metadata snapshot. conceptLimit changes only the semantic candidate count; it never causes source text to be returned.`,
    `If an operation is waiting or partial, follow its visible continuation request and read coverage/reasons. Never treat a partial result as complete, and never restart solely to obtain source text.`,
    `If a request is rejected, keep the strongest applicable mode and follow its repair instruction exactly once. Do not paste the error or rejected request into the retry, repeat an unchanged request, or switch to a weaker search because of a fixable argument error. Only an explicit capability-unavailable result permits a bounded alternative, which remains partial and must not be presented as complete.`,
    structuredOutput
      ? `When status=partial, read details.analysis.coverage to see which conclusion is incomplete; an exact occurrence count may remain complete even when syntax or related-test analysis is partial.`
      : `When status=partial, read the visible Coverage and bracketed reasons to see which conclusion is incomplete; an exact occurrence count may remain complete even when syntax or related-test analysis is partial.`,
  ];
}

function signalGrepModelGuidelines(): string[] {
  return [
    `Search with pattern and optional path. Results are always metadata-only: counts, categories, paths, locations and coverage; no source text, excerpts, signatures or diffs are returned. Omit mode/limit for the compact statistical summary.`,
    `Use file and directory distributions, ranked paths and condition counts to choose the next action. Cursor continuation returns more metadata, not source. Use the host read capability separately when an edit requires source text.`,
    `Modes: capabilities for language prerequisites; files+query for filenames; anyOf/allOf for literal condition statistics; outline/imports/tests for metadata-only structural and relationship counts; structure for AST match statistics; concept/hybrid for semantic candidate statistics. Similarity and static links are not proof.`,
    `On rejection keep the strongest applicable mode and apply the stated repair once. Do not repeat the rejected request or include its error. Only explicit capability-unavailable permits a visibly partial alternative.`,
  ];
}

export function signalGrepMcpInstructions(
  outputMode: SignalGrepMcpOutputMode = DEFAULT_MCP_OUTPUT_MODE,
): string {
  const outputInstruction =
    outputMode === "structured"
      ? "Successful MCP results provide text and details containing only statistics, categories, paths, locations, coverage and continuation metadata. Both projections are code-free and describe the same result."
      : outputMode === "model"
        ? "Returns one compact model-facing metadata page. Rows contain only paths, locations and classifications; copy continuation requests exactly."
        : "Successful MCP results provide one complete code-free metadata page with statistics, coverage and continuation selectors.";
  return [
    "Use baoer_signal_grep for read-only local search and metadata-only source analysis from the configured project cwd. Source text is not returned by this tool; use the host read capability when needed.",
    outputInstruction,
    ...(outputMode === "model"
      ? signalGrepModelGuidelines()
      : signalGrepPromptGuidelines(outputMode === "structured")),
  ].join("\n");
}
