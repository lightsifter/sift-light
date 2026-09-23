import { DEFAULT_MCP_OUTPUT_MODE, type SiftLightMcpOutputMode } from "./mcp-output.js";

const SOURCE_OUTPUT_GUIDANCE =
  "Auto/summary text may include bounded source excerpts; ordinary matches text is metadata-only. Inspect may return bounded source windows covering an entire small file. Analysis text may include semantic passages; structured details may retain excerpts, names and signatures. Follow output limits, coverage and continuations.";

export function siftLightPromptGuidelines(structuredOutput = true): string[] {
  return [
    `Use sift-light for read-only content search. ${SOURCE_OUTPUT_GUIDANCE} For routine development searches, start with fast exact content, filename or applicable structural modes when the request has a usable name, symbol, error text or other literal clue. Omitted mode is ordinary exact search and never loads the local embedding model. Vector search is disabled by default; concept/hybrid require vectorSearchEnabled:true in sift-light.json and an installed model. They can take tens of seconds on an uncached scope, so select them only when semantic recall is needed. Omit mode and limit for automatic detail/summary selection; use mode="matches" for ordinary match metadata.`,
    `An omitted path searches the project cwd. Use scope:"strict" for a question restricted to one path; otherwise, if an explicit subpath has zero matches, ordinary and content-analysis searches retry from cwd and return project-wide counts with an expansion notice. Explicit absolute paths and .. traversal can search outside cwd, except protected external system areas and .git internals. Git changes mode remains cwd-scoped.`,
    `Search output includes counts, categories, ranked paths, coverage and continuation metadata. Source excerpts may contain the searched text. Use mode="inspect" or the host read capability when exact source is required for an edit or verification.`,
    `Use file and directory distributions to choose evidence. Reuse the visible cursor with path or paths for match metadata; mode="summary" pages the remaining file statistics. Match counts are not relevance scores.`,
    `Mode="inspect" with a direct path/line or ordinary retained match returns bounded source windows and source-revision metadata. Some retained analysis selectors return only revision metadata; use direct path/line or the host read capability when source is needed. Do not use inspection merely to obtain a citation.`,
    `Use allOf:["term1","term2"] for explicit same-file literal AND. Add within:"function" only together with allOf to restrict that conjunction to one own-implementation JS/TS/TSX function; omit within for ordinary single-pattern searches. Use roles:["declaration"] or roles:["call"] with a single pattern for JS/TS/TSX/Go syntactic occurrence statistics.`,
    `Use anyOf:["term1","term2"] when every exact occurrence of 2-64 literals is needed in one version-bound result. It is case-sensitive, reports anonymized condition counts, and runs requests above eight terms as bounded parallel chunks. Large condition inventories have separate continuation pages; copy those requests to retrieve the complete counts.`,
    `For a changed-code question, add changes:{base:"HEAD",scope:"lines",side:"new"}; omit target for the working tree, use side:"old" for deleted-side statistics. Copy returned continuation requests to preserve source versions.`,
    `Use mode:"capabilities" when the language or requested operation is unclear to get a compact lazy inventory. Use mode:"outline" with a concrete source file path for symbol counts and locations, mode:"imports" for static relationships, and mode:"tests" for related-test candidates. Their text pages summarize metadata; structured details can retain source evidence.`,
    `Use mode:"files" plus query for unknown filenames and fuzzy paths. Multi-word filename queries require each word literally in the path; use hybrid/concept only for business concepts that cannot be located by a literal clue. Use wholeWord:true for a single-pattern whole-word search. exclude contains file globs, not content negation.`,
    `Use mode:"structure" only for JS/TS/TSX/Go, with a required nonempty ast-grep pattern such as "compare($X, $X)" or "send()" for code shapes across whitespace; the text page reports structural counts and locations; structured details can retain matched source evidence.`,
    `Use mode:"concept" plus a natural-language query when names are unknown. It runs a pinned local multilingual model only after explicit installation; no search downloads weights or sends code to a remote model. Results expose candidate counts, score statistics, paths and the bounded ranked passage behind each candidate. Similarity scores identify candidates, not correctness.`,
    `Use mode:"hybrid" plus query when wording may differ from the source. It reports exact and semantic counts separately, removes overlap, and retains one pageable evidence snapshot. conceptLimit changes only the semantic candidate count; retained candidates keep their bounded source passages.`,
    `If an operation is waiting or partial, follow its visible continuation request and read coverage/reasons. Never treat a partial result as complete, and never restart solely to obtain source text.`,
    `If a request is rejected, keep the strongest applicable mode and follow its repair instruction exactly once. Do not paste the error or rejected request into the retry, repeat an unchanged request, or switch to a weaker search because of a fixable argument error. Only an explicit capability-unavailable result permits a bounded alternative, which remains partial and must not be presented as complete.`,
    structuredOutput
      ? `When status=partial, read details.analysis.coverage to see which conclusion is incomplete; an exact occurrence count may remain complete even when syntax or related-test analysis is partial.`
      : `When status=partial, read the visible Coverage and bracketed reasons to see which conclusion is incomplete; an exact occurrence count may remain complete even when syntax or related-test analysis is partial.`,
  ];
}

function siftLightModelGuidelines(): string[] {
  return [
    `Search with pattern and optional path. ${SOURCE_OUTPUT_GUIDANCE} Default search is exact and model-free. concept/hybrid require vectorSearchEnabled:true in sift-light.json plus an installed model; uncached runs may take tens of seconds. Omit mode/limit for auto pages.`,
    `Use ranked paths and counts; Cursor continuation pages retained results. Use mode="inspect" for exact source before editing.`,
    `Modes: files+query for filenames; anyOf/allOf for literals; outline/imports/tests for static code; structure for AST; concept/hybrid for semantic candidates. Similarity is not proof.`,
    `On rejection keep the strongest applicable mode and apply the stated repair once. Do not repeat the rejected request or include its error. Only explicit capability-unavailable permits a visibly partial alternative.`,
  ];
}

export function siftLightMcpInstructions(
  outputMode: SiftLightMcpOutputMode = DEFAULT_MCP_OUTPUT_MODE,
): string {
  const outputInstruction =
    outputMode === "structured"
      ? "Successful MCP results provide text and details with statistics, categories, paths, locations, coverage and continuation metadata, plus the bounded excerpts or source windows the requested mode retains. content[].text and structuredContent.text contain the same final text; structuredContent.details also carries structured evidence."
      : outputMode === "model"
        ? "Returns one compact model-facing evidence page: paths, locations, classifications and any retained excerpts; copy continuation requests exactly."
        : "Successful MCP results provide one complete evidence page with statistics, coverage, continuation selectors and any bounded excerpts the requested mode retains.";
  return [
    "Use sift-light for read-only local search with bounded source evidence from the configured project cwd.",
    outputInstruction,
    ...(outputMode === "model"
      ? siftLightModelGuidelines()
      : siftLightPromptGuidelines(outputMode === "structured")),
  ].join("\n");
}
