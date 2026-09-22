# Changelog

## Unreleased

## [1.0.0] - 2026-09-22

- Rename the project, npm package, tool, native plugins and configuration surface to Siftlight (拾光), under the LightSifter identity.
- Distinguish retained-match completeness from filesystem coverage so ignored files can no longer hide behind an exhaustive absence claim.
- Add bounded audit receipts with explicit ignore policy, pattern findings, scope coverage, source stability and reproducible follow-up requests.
- Automatically process Concept and hybrid scopes of up to 2,000 files in sequential 200-file batches, merging them into one globally ranked, verifiable result while keeping `maxFilesToParse` as an optional hard ceiling.
- Document the one-time migration requirement: remove installations registered under the earlier package identity before enabling Siftlight.

This is the first public release under the Siftlight package identity. Earlier entries below record development completed before the Siftlight 1.0 version line.

## [1.7.0-1] - 2026-09-22

- Process optional semantic judgments in bounded batches, split oversized requests automatically, and preserve successful classifications when another batch fails.
- Report complete and partial semantic coverage with explicit judged, unjudged, completed, failed and split batch counts while retaining local result order for unjudged candidates.
- Ignore OMP host intent metadata before strict search-input validation so supported host requests keep the same public search contract.

## [1.6.8-2] - 2026-09-21

- Resolve native MCP releases through a dedicated npm alias so the exact package is installed even when the current project is the package's own source repository.

## [1.6.8-1] - 2026-09-21

- Pin bundled native MCP hosts to the matching release package and forward the supported Jev credential environment variables so new sessions load the intended search server.
- Keep Jev requests and public hybrid evidence bounded: remote classification receives excerpts without local paths, while model output retains validated aggregate and per-candidate judgments.
- Treat NUL-bearing binary Concept sources as explicit normal skips, preserve source navigation and custom credential-variable compatibility, and reject unsafe remote HTTP endpoints.

## [1.6.7] - 2026-09-21

- Make the optional Jev semantic-judgment configuration resolve consistently across Pi, OMP and standalone MCP, with explicit-path failures and startup diagnostics instead of silent disablement.
- Keep Jev opt-in: local literal and Concept search remain the default, and an enabled provider is contacted only for retained hybrid semantic candidates.
- Preserve semantic-judgment status, provider identity, candidate counts and partial failures in hybrid evidence so callers can distinguish a real completed judgment from an unavailable or skipped provider.
- Keep MCP model-mode source visibility, pagination, inspection identity and structured evidence aligned across the bundled host integrations.
- Refresh the published platform artifacts and documentation so the four supported host paths use the same release metadata and configuration contract.

## [1.6.6] - 2026-09-21

- Add an opt-in semantic judge boundary for hybrid searches. Local search and Concept retrieval remain the default; a configured provider is never contacted unless `semanticJudge.enabled` is explicitly true.
- Keep API credentials out of configuration files. The configuration names the environment variable to read, and missing credentials fail clearly when the feature is enabled.
- Classify semantic candidates as implementation-candidate, caller-candidate, mention-only, documentation, test-only, irrelevant or uncertain, preserving the classification, probability, model and provider status in the analysis evidence.
- Use bounded candidate input, response size, timeout and retry limits. Provider failures remain visible as partial hybrid evidence and never become a successful verified claim.
- Preserve the existing hybrid snapshot, exact-first evidence, cursors, source references, revision checks and pagination contract.

## [1.6.3-1] - 2026-09-16

- Stop advertising fields with the call-shaped `name={a,b,c}` notation that appeared in mode and selector guidance, and that could be copied into the arguments as a `{"mode":"files","files":{…}}` nested object no schema accepts. Field lists are prose again, mode guidance carries the field catalog exactly once instead of twice, and repeated name prefixes (`inspect=inspect={…}`, `pattern=pattern is regex…`) are gone. The advertised schema drops 468 characters and all 32 braces in the `mode` description without changing accepted requests.
- Name the flat-field rule and the mode's accepted field names when a request is rejected for carrying a per-mode object or an unknown field, so one failure teaches the executable flat request. This text is emitted only on the failure path and adds nothing to the resident context.
- Report the descriptive text as an explicit contract: the field catalog must stay single-sourced and no advertised description may reintroduce `name={a,b,c}`.
- Rework the terminal dashboard so its statistics read as one table: a left gutter on every line, blank lines between the header, distribution and footnote sections, and a path column that stops growing instead of absorbing every spare terminal column. Per-file counts and bars now sit beside the paths they describe rather than stranded at the right edge of a wide terminal. An over-long path drops its middle and keeps the basename that distinguishes sibling files such as `README.md` from `README.zh.md`.
- Fill the empty corner beside the block totals by moving the distribution strip up next to them, so the totals, the strip and every file row end on the same column. The two file-count notes merge into one line, falling back to the plain notes only when the terminal is too narrow to hold them without truncating a count mid-number.

## [1.6.2] - 2026-09-16

- Correct MCP initialization instructions and output-schema descriptions to document bounded source excerpts in automatic results, summaries and inspection, resolving #78 without removing model-facing evidence.
- Introduce a responsive neon statistics dashboard for Pi and OMP with warm candy colors, host-aware light/dark palettes, file distributions and expanded file statistics.
- Keep source code and protocol diagnostics out of terminal presentation, including error and background-operation paths; preserve full tool result data for model consumers.
- Distinguish partial results, pagination and failed or cancelled searches without fabricating completion percentages.

## [1.6.1] - 2026-09-16

- Reject `mode=files` queries that contain `*` or `?` glob wildcards with an actionable error, instead of scoring every enumerated file out and reporting `0 retained files` as a complete result. Omitting the query still lists every file under the requested path, and `glob` remains the name-pattern filter; bracket characters stay valid query text.
- Offer an executable repair when the hard search policy blocks a bare directory enumeration: plain `find <root> [-name <pattern>] -type f` commands, including inside a compound atomic call, translate to one concrete `{"mode":"files",…}` request with `-name` mapped to `glob`.
- Present `{"mode":"files","path":"<scope>"}` with query documented as optional as the blocked-file-search template, and give untranslatable `find` forms (depth limits, case-insensitive or repeated name predicates, other tests and actions) a manual-recovery reason that names those forms instead of the ripgrep-specific one.

## [1.6.0] - 2026-09-14

- Simplify interactive host output to the essential result statistics: match or item count, file count, completion state, budget state and continuation availability. File lists, source excerpts and raw failure diagnostics stay available to the model through structured evidence and inspect requests.
- Keep model-facing evidence navigable with bounded match metadata, source inspection, semantic excerpts and explicit continuation requests. Recoverable request-contract failures remain actionable for the model without leaking their raw diagnostic text into the human-facing display.
- Refresh Claude Code, Codex and Kimi MCP manifests to resolve the published `siftlight@latest` package and keep all generated plugin artifacts on one release version.
- Add one owned lifecycle for long-running Concept and hybrid requests: the initial wait returns an exact `mode="await"` continuation with an operation id and progress, continuation resumes the same computation, final results are stably retained, and explicit cancellation waits for owned cleanup. Pending operations are bounded per service session, idle leases expire abandoned work, and real failures remain diagnostic instead of degrading to literal-only evidence.
- Re-enumerate and verify a complete Concept source generation before publishing either Concept or hybrid evidence. Empty, unavailable, added, deleted and replaced files remain visible in coverage; source changes refresh within the operation deadline and mixed generations cannot be reported complete.
- Deduplicate repeated embedding inputs before inference and atomically cache each completed embedding batch, exposing progress for unique embeddings and mapped passages. Cache reads distinguish misses or rebuildable corruption from real I/O failures.
- Add `mode: "validate"` for saved search and analysis evidence. Validation checks retained source, configuration, manifest, and provider dependencies against the current worktree and reports `current`, `stale`, or `unknown` without changing the original snapshot or turning partial coverage into a complete result.
- Accept only current configuration: `enforceSearch` uses `hard`, `prefer` or `off`; retired boolean values and unknown config keys fail explicitly. No compatibility aliases or silent ignored settings.
- Remove language-service navigation and its runtime dependencies, provider processes, graph traversal, snapshots and filesystem watchers. Removed modes: `definitions`, `references`, `implementations`, `callers`, `callees`, `dependencies`, `dependents`, `trace` and `impact`; requests fail explicitly without a weaker automatic fallback.
- Retain ast-grep syntax analysis, bounded Python outline, static JS/TS/TSX imports/tests, exact/file searches, source inspection, Concept and hybrid. Swift outline is no longer advertised; Swift content search and inspection remain available.
- Preserve the complete source-validation report in compact MCP output, including freshness, comparison target, check interval and per-source status; source rows use one-based indices and retained/returned counts agree.
- Keep saved-source `validate` independent from language services. Metadata now uses `validation` instead of `relationship`; removed trace cursors and graph fields are unsupported. TypeScript is a development-only dependency and Pyright is no longer installed.
- Deduplicate overlapping semantic passages in rank order before applying the hybrid supplement limit; retained counts and the non-overlap claim now describe the same evidence.
- Mark truncated matching-line excerpts in tool text, disclose the snapshot-wide line count and per-line bound, and retain an executable inspection request even after the last match page.
- Put ordinary search scope-expansion notices before evidence while preserving the documented default and explicit `scope="strict"` behavior.
- Require every word in multi-word file queries to occur literally in the candidate path, preventing unrelated long build paths from satisfying independent fuzzy character walks. Single-word filename abbreviations remain supported.
- Clarify the ordinary page limit, concrete-file outline requirement, structure language/pattern requirements, and continuation workflow in model-facing contracts.
- Run JavaScript workers correctly inside compiled Bun hosts such as OMP and include the syntax/concept workers with the bundled OMP extension.

## [1.5.6-3] - 2026-09-10

- Provide ready-to-copy `siftlight` requests when the hard search policy blocks a static standalone `rg` or `ripgrep` command that can be translated without ambiguity, while preserving search options, the original working-directory scope, and conservative manual recovery for unsupported shell behavior.

## [1.5.6-2] - 2026-09-10

- Preserve executable permissions on the published MCP and Concept worker entrypoints so npm-installed bins can be launched by Node-based hosts.

## [1.5.6-1] - 2026-09-10

- Preserve literal evidence when hybrid Concept retrieval reports any non-cancellation provider failure. The semantic branch is marked `skipped`, the diagnostic remains visible in partial coverage, and literal search ownership is not discarded.
- Refresh the published Claude/Codex/Kimi search-policy hook, OMP extension and MCP server artifacts so the package contents match the current source and release metadata.

## [1.5.6] - 2026-09-10

- Fix Concept token-window binary search stalls on UTF-16 surrogate-pair interiors (emoji and other astral characters). `maximumTokenSafeEnd` and `overlapStart` now strictly advance `low`, minimum overlap progress crosses a complete code point, and `tokenSafeWindows` rejects a non-advancing overlap instead of spinning until the 10-minute deadline.
- Add an explicit iteration budget so a future tokenizer or boundary regression fails fast with a clear diagnostic instead of hanging.
- Keep hybrid literal evidence when Concept inference fails: semantic candidates are marked `skipped`, reasons name the failure, and the request returns partial hybrid results instead of discarding an in-flight exact search.
- Keep models on the strongest applicable search mode after a rejected request: every host now instructs one corrected retry without copying the old error/request or weakening the search. Pi, OMP and MCP share one single-line 1,024-character error boundary with a 4,096-character raw scan limit; unknown objects are never coerced, so causes, stacks, hostile conversion hooks and repeated request text cannot accumulate in model context or block error formatting. Only explicit capability unavailability permits a visibly partial alternative.
- Allow hosts to bound the complete Concept request—including queue admission, source planning and inference—with `SIFTLIGHT_CONCEPT_TIMEOUT_MS` (1s–1h). Missing or empty keeps the 10-minute default; invalid values fail closed before planning with an explicit configuration error.
- Surface Concept admission planning in `counts`/`coverage` (`filesEnumerated`, `filesAdmitted`, `filesSkippedEmpty`, `filesUnavailable`, `passagesQueued`, `admissionPlan`) and warn when interactive Concept enumerates more than 500 files. Empty files remain a normal skip and do not mark Concept coverage partial.

## [1.4.0] - 2026-09-09

- Identify the exact Bash or PowerShell subcommand that triggered strict native search enforcement, including its sequence and bounded source position, while preserving the existing allow/deny policy. Denials now explain that the host call is atomic and instruct agents to split non-search work before routing only the search through `siftlight`.
- Add explicit `"hard"`, `"prefer"`, and `"off"` search-enforcement modes while retaining `true` and `false` configuration compatibility. Hard enforcement remains the default; prefer mode keeps the dedicated tool and model guidance without denying conventional searches.
- Let Claude Code, Codex and Kimi native hooks select enforcement through `SIFTLIGHT_ENFORCE_SEARCH=hard|prefer|off`. Missing configuration remains hard, and unsupported values fail closed with a visible configuration error.
- Document why output-only pipeline filters remain available while direct content searches and pipelines containing another search producer remain blocked.

## [1.3.2] - 2026-09-09

- Reduce the native model-host MCP description and workflow instructions while preserving ordinary search, strict scope, completeness, cursor and inspection recovery guidance. Structured and text consumers retain the full compatibility instructions.
- Make invalid new-search `paths` requests explain the scope-preserving repair: run one request per path instead of copying a request that was never returned or silently widening to a common parent.
- Inspect Markdown through a bounded line window without invoking or repeatedly warning about an unavailable Universal Ctags provider; code structure provider failures remain explicit.
- State that a blocked search denies the entire tool call before execution, so no preceding or following compound-shell operation can be mistaken for completed work.

## [1.3.1] - 2026-09-09

- Rank every Concept passage admitted by the documented source budget instead of stopping after 128 candidates. Token-overlong passages now use overlapping tokenizer-verified windows and max-pooled similarity, so no ranking relies on a silently truncated prefix.
- Reuse offline query and passage embeddings through a model/chunking-versioned, content-addressed 512 MiB cache. Cache hits, misses, ranked windows and cache maintenance failures are observable; changed content invalidates naturally.
- Allow ordinary compound shell commands containing unsupported zsh argument syntax while continuing to block recognized search executables recovered from the same syntax tree.

## [1.3.0] - 2026-09-08

- Add fixed `mode=hybrid` retrieval that always runs exact literal and local Concept searches under one cancellation owner, ranks exact evidence first, removes overlapping semantic passages and retains a configurable top semantic supplement (default 3, maximum 20).
- Store hybrid evidence in one version-checked pageable snapshot with an exact-plus-semantic preview, shared source references and one inspection cursor. Counts distinguish ranked, deduplicated, selected and omitted semantic candidates, while literal, Concept, deduplication, inspection and retention coverage remain independently observable.
- Keep hybrid model output below equivalent separate literal and Concept responses by sharing metadata and continuation instructions, limiting the initial preview and deferring exhaustive exact-first evidence to the same snapshot's match pages.

## [1.2.3-7] - 2026-09-08

- Add opt-in MCP text and model output modes for hosts that serialize both readable and structured results into model context. Model mode selects the smaller of the standard page and a compact analysis view without repeated paths, inspect requests or outline excerpts while preserving counts, coverage, partial state and continuations; the existing structured result remains the default.

## [1.2.3-6] - 2026-09-08

- Expose bounded Concept score profiles so broad candidate results remain distinguishable without treating similarity as a relevance threshold.
- Label syntax-fallback source windows explicitly and provide executable continuation requests after parser errors so large TSX inspections do not imply semantic completeness.
- Make Concept field-validation errors list the accepted request fields.

## [1.2.3-5] - 2026-09-08

- Clarify that `within` is only valid with `allOf`, so ordinary single-pattern MCP calls omit it and receive an actionable repair message when a host re-injects it.
- Document the project-local Kimi Code MCP `cwd` workaround for web sessions that launch servers from the CLI installation directory.

## [1.2.3-4] - 2026-09-07

- Keep impact and related-test navigation inside the target's containing Git repository instead of a broad MCP cwd.
- Preserve readable matches when ripgrep skips inaccessible descendants, reporting skipped paths as partial coverage while keeping root access failures fatal.
- Advertise that related-test navigation supports JS/TS/TSX only and return an actionable partial result for Python sources.

## [1.2.3-3] - 2026-09-07

- Recover from oversized ripgrep match lines during impact and broad searches, retaining partial status and source diagnostics instead of aborting the search.

## [1.2.3-2] - 2026-09-06

- Fix redaction coverage for suffixed and compound sensitive variable names, including service keys and access-token variants.
- Make large test and impact discovery scans filterable and degrade to explicit partial search results when file-summary metadata reaches its budget.
- Limit semantic navigation stability checks to admitted source and module-resolution files, so unrelated workspace artifacts do not invalidate a query while relevant changes still request a retry.
- Classify nested Python functions by their nearest declaration scope and suppress concept-worker stack traces in user-facing diagnostics.

## [1.2.3-1] - 2026-09-06

- Scope semantic project snapshots and stability checks to the target's containing project boundary, so unrelated files outside that project do not invalidate navigation.
- Make file-discovery validation errors name the valid discovery modes and show the `mode="files"` plus `query` repair shape.
- Rank file-discovery candidates relative to the requested root, so the root's own path cannot create false filename matches.

## [1.2.3] - 2026-09-06

- Add native OMP (Oh My Pi) compatibility with the `siftlight` tool, profile-aware configuration, direct-search enforcement, lifecycle cleanup and a self-contained published extension bundle.
- Keep the existing Pi, Claude Code, Codex CLI/App, Kimi Code and MCP integrations unchanged while sharing configuration and search-policy behavior across hosts.

## [1.2.2] - 2026-09-06

- Add inclusive `modifiedAfter` and exclusive `modifiedBefore` Unix-millisecond filters for worktree searches, with the same verified metadata behavior for content and filename discovery.
- Add bounded Python `mode="outline"` support for indentation-based class, function and method ranges. The result explicitly remains outline evidence rather than compiler bindings or runtime call relationships.
- Validate path, pattern and file-filter sizes before starting search processes, and explain effective scope and modification-time bounds in returned details.
- Keep analysis bodies concise while retaining per-item evidence in structured `details`, and make missing Universal Ctags actionable with a supported outline alternative.
- Calibrate native search enforcement so output-only `grep`/`egrep`/`fgrep` (and PowerShell `Select-String`/`sls`) filters remain usable while alternate search producers and wrappers stay blocked.

## [1.2.1] - 2026-09-06

- Bundle platform-specific ripgrep through a pinned dependency so MCP and Pi searches work without `rg` in `PATH`, including installations with lifecycle scripts disabled. Use one executable resolver for content, filename and Git-source searches, with an explicit `SIFTLIGHT_RG_PATH` override and actionable dependency errors.
- Make every MCP installation command follow the latest published version when the server starts.

## [1.2.0] - 2026-09-05

- Fix missing file maps and matching lines in MCP clients that select structured results.
- Make `siftlight` the default conventional search tool in Pi; add native enforcement plugins for Claude Code, Codex and Kimi Code. MCP-only connections remain non-enforcing.
- Add filename discovery, whole-word and strict-scope searches, JS/TS symbol and call navigation, module relationships, and code-pattern search.
- Add optional offline natural-language code discovery after explicit model installation.
- Improve large-result pagination, partial-result reporting and cancellation handling.

## Pre-release development milestone 1.0.0 - 2026-09-04

- Add local stdio MCP connections for Claude Code, Codex and compatible clients.
- Begin the internal migration of the package, tool, executable and Pi configuration to the `siftlight` family. This milestone was not published under the Siftlight npm package identity. MCP environment variables use `SIFTLIGHT_MCP_*`; retired names are not aliases.

## [0.7.0] - 2026-09-03

- Add an HTTP MCP server with configurable browser origins and session limits.

## [0.6.6] - 2026-09-03

- Add optional display redaction, clearer search coverage and continuation errors, and broader multi-term searches.

## [0.6.2] - 2026-09-03

- Allow explicitly requested external paths with protected-path restrictions.

## [0.6.0] - 2026-09-02

- Expand code analysis, source inspection and multi-term search.

## Earlier releases

Versions 0.1–0.5 introduced the Pi extension, automatic file summaries, matching-line pagination and bounded source inspection, with subsequent search and display fixes.
