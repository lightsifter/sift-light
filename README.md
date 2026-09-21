# baoer_signal_grep

English · [简体中文](README.zh-CN.md)

**A general-purpose local search plugin that helps agents find files, documents, notes, logs and other text material.**

Think of a patient librarian: describe what you need, and it helps locate the shelf, open the relevant page and follow the next lead. A small search brings the passages straight to you. A broad search starts with a map so you can decide where to look first.

## How it helps

### Find a passage without opening every folder

Looking for an error message, a sentence or a name is like giving a librarian a keyword. When there are only a few matches, the plugin returns their text and locations directly, saving repeated file opening and scrolling.

### Start with a map when the collection is large

“Which documents mention refunds?” can produce a lot of material. The plugin first presents matching files and snippets, like marking promising stops on a map. The agent can choose what to open before filling the conversation with entire documents.

### Keep your bookmark for the next question

“Continue from where we stopped” can follow the existing result to its next page. The agent can also open the surrounding text of a match, like returning to a bookmarked passage to read what came before and after it.

### Recover when the remembered wording is not exact

Use `mode: "hybrid"` with one natural-language `query` when a sentence may have been remembered with different wording. Hybrid always runs an exact literal search and the installed local Concept model under one owned request. Exact evidence appears first; semantic candidates are clearly labeled, ranked only by similarity and removed when they overlap an exact match. The initial page shares counts, coverage, source references, one inspection cursor and a compact preview instead of concatenating two complete responses. `conceptLimit` changes only the non-overlapping semantic supplement (default 3, maximum 20); it never displaces literal evidence. The returned matches request opens the same snapshot's complete exact-first pagination without rerunning either search.

Concept ranking covers every UTF-8 passage admitted by the request's documented source budget; it no longer samples a fixed prefix of the scope. Passages that exceed the model token window are ranked through overlapping token-safe windows, so later text is not silently discarded. Offline embeddings are cached by content, model revision and chunking revision in a bounded 512 MiB local cache. Repeated content is reused, changed content misses naturally, and cache write or cleanup failures remain visible in the result.

Slow Concept and hybrid requests return within the default five-second wait window with `status: "waiting"` or `"running"`, an `operationId`, progress and an exact `nextRequest` such as `{ "mode": "await", "operationId": "..." }`. Copy that request unchanged: it resumes the same computation and never restarts the query or downgrades to a literal-only result. A final result remains available for stable re-fetch for 10 minutes, with up to 32 terminal results retained per service session, and `mode: "cancel"` stops the owned work and waits for cleanup. Each service session admits at most eight pending operations; an operation has one total deadline controlled by `BAOER_SIGNAL_GREP_CONCEPT_TIMEOUT_MS` (integer milliseconds from 1000 through 3600000; default 600000) and a 120-second idle continuation lease. A real model, source or resource failure is returned as a failure with its diagnostic. Source generation is re-enumerated and re-verified before publication, so changes refresh the operation and mixed versions are never marked complete. Admission planning counts (`filesEnumerated`, `filesAdmitted`, `filesSkippedEmpty`, `filesUnavailable`, `passagesQueued`) stay visible so large libraries can be narrowed with `path` or `glob` before another attempt. Empty files are a normal skip and do not mark the result partial.

### Give several search conditions together

“Find files mentioning both the customer and a refund” works like selecting documents with two labels. “Any of these words will do” works like handing over a shortlist. Multiple conditions can be expressed together to reduce repeated searches.

### Choose the drawer you want searched

Ask the agent to restrict a search to one folder when that is the scope you need. If you remember only part of a filename, start by finding the file and then inspect its contents—like narrowing a cabinet down to a shelf and then a document.

Multi-word `files` queries require each word literally in the path; a single abbreviation still supports fuzzy matching. Use `hybrid` or `concept` for business intent. Ordinary content searches retain their default zero-result expansion; use `scope: "strict"` to stay within an explicit path. Expansion is announced before returned evidence.

### Know what has been shown

Long results arrive in pages with a way to continue. When the original material changes, the plugin asks for a fresh check. Like a careful research assistant, it distinguishes the passages already shown from the pages still to come.

A complete snapshot describes match retention, not complete source text. Truncated matching-line excerpts show their limit and an executable `inspectRequest`, which remains usable after the final match page. Follow pagination cursors instead of repeating the query with a different limit.
In Pi and OMP, the passive session status includes the loaded package version, counts returned new queries, distinguishes complete, partial and unfinished results, and reports non-cancelled failed calls. Cursor and operation continuations do not inflate the new-query count.

### Discover language capabilities before loading a provider

Use `mode: "capabilities"` with the project root for a compact, names-only inventory. JavaScript, TypeScript and TSX support AST structure, roles, outline, static imports and related-test candidates. Go supports AST structure and roles. Python supports bounded indentation-based outline. Swift and other languages remain available to ordinary content search, filename discovery and source inspection. Capability inventory does not start parsers or the Concept model.

Language-service navigation is out of scope. Asking for `definitions`, `references`, `implementations`, `callers`, `callees`, `dependencies`, `dependents`, `trace` or `impact` fails explicitly, because a text search dressed up as precise navigation would be a worse answer than a clear refusal. No language server runs while you work.

### Check saved source evidence

Use `mode: "validate"` with a saved ordinary-search or analysis `cursor`, optionally selecting a `matchIndex`. Validation compares retained sources with the current worktree or their pinned Git objects, reports `current`, `stale` or `unknown`, and preserves incomplete search coverage. Structured metadata is under `details.validation` and `details.analysis.validation`; the removed graph fields and trace cursors are no longer supported. Validation checks sources on demand and does not run background watchers. It checks saved evidence, not whether new matching files have appeared since the search.

### Narrow by file age or inspect code structure

Worktree searches can use `modifiedAfter` and `modifiedBefore` as Unix millisecond bounds. The lower bound is inclusive and the upper bound is exclusive, so a time window can be expressed without changing the search pattern. The same filter applies to content and filename searches; unavailable file metadata is reported as incomplete evidence rather than silently treated as a match.

Use `mode: "outline"` with a concrete JS/TS/TSX or Python file to see bounded symbol ranges. JS/TS/TSX use ast-grep; Python uses indentation-based class, function and method evidence. These ranges do not prove compiler bindings, runtime calls or test coverage. `mode: "tests"` provides JS/TS/TSX related-test candidates; unsupported language operations fail explicitly. Use ordinary search and `inspect` for Swift source.

The readable result keeps the main evidence compact. Per-item ranges, counts, coverage and continuation requests remain in structured `details`, so a client can use the structured fields without requiring a second search.

## Common uses

Tell your agent what you need, for example:

- “Which documents mention the refund deadline?”
- “Find this error in the logs and show the surrounding messages.”
- “Find files containing both the customer name and the order number.”
- “List matches for any of these keywords.”
- “I remember part of the meeting-notes filename. Help me find it.”
- “Search only this folder; do not expand the scope.”
- “Show me which files contain relevant text, then open two of them.”
- “Continue from the previous page and show the remaining passages.”
- “Search files modified since this Unix millisecond timestamp.”
- “I may remember this sentence incorrectly; search exact and semantic evidence together.”
- “Show the Python classes and functions in this file, then inspect the method that matters.”
- “Find this function name in source, inspect the relevant occurrences, then validate the saved evidence after I edit the file.”

The plugin provides file locations and actual text so the agent can answer from the material and you can check the original yourself.

## Install

MCP needs Node.js 22.19+. Pi needs Pi 0.84.3+ with Node.js 22.19+ or Bun 1.4+. The search engine ships with the package for each supported platform, so no system search tool, shell function or `PATH` setup is required, and a search never downloads anything. Install with optional dependencies enabled.

To use your own ripgrep, set `BAOER_SIGNAL_GREP_RG_PATH` to the absolute path of the executable in the MCP server or Pi process environment, then restart the host. It applies to content, filename and Git-source searches. Paths containing spaces work; aliases, shell functions, relative paths and `~` are not expanded. An unusable value fails explicitly instead of silently choosing another executable. If the bundled engine is missing, reinstall with optional dependencies enabled or point this setting at your own binary.

### Pi

```bash
pi install npm:baoer_signal_grep
```

Restart Pi after installing or updating. Pi uses this plugin for conventional searches by default; reads, edits, tests, builds and scripts remain available. `enforceSearch` accepts `"hard"` (the default), `"prefer"` (keep the dedicated tool and guidance without denying alternative searches), or `"off"`. Boolean values and unknown configuration fields are rejected. Configure it in `~/.pi/agent/baoer_signal_grep.json`, then restart. Set `"locale": "zh-CN"` there for the Chinese interface.

### OMP (Oh My Pi)

```bash
omp install npm:baoer_signal_grep@latest
```

Restart OMP after installing or updating. The package declares its native OMP extension and registers `baoer_signal_grep`. In the default hard mode it removes OMP's built-in `grep` and `glob` entries from the active tool set and blocks direct search commands while leaving reads, edits, tests, builds and other development tools available. Prefer mode keeps both the dedicated and alternative tools active, adds model guidance, and does not deny shell searches. OMP's active profile is respected; the default configuration file is `~/.omp/agent/baoer_signal_grep.json`, and a named profile uses `~/.omp/profiles/<profile>/agent/baoer_signal_grep.json`. Set `enforceSearch` to `"hard"` (default), `"prefer"`, or `"off"` in the active file, then restart OMP. Only these current string values are accepted; boolean values and unknown configuration fields are rejected. Set `"locale": "zh-CN"` to use the Chinese interface.

### Optional semantic judge

Hybrid search remains local-only by default. An optional semantic judge can classify retained concept candidates and improve ordering, but it never replaces local matching, source inspection, pagination, or verification.

The feature is enabled only when `semanticJudge.enabled` is explicitly set to `true`. Merely defining the environment variable does not activate network access. Keep the credential in the process environment; do not put the credential value in this file:

```json
{
  "locale": "en",
  "enforceSearch": "hard",
  "semanticJudge": {
    "enabled": false,
    "provider": "jev",
    "apiKeyEnv": "TYPESAFE_API_KEY",
    "model": "jev-latest",
    "timeoutMs": 120000,
    "maxCandidates": 20,
    "maxRetries": 2
  }
}
```

When enabled, the configured endpoint receives only the query and bounded candidate excerpts. A missing key or provider failure is reported as an explicit partial result; local candidates remain available, and semantic classification is not runtime proof.

### Claude Code or Codex: MCP connection

```bash
claude mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@latest baoer_signal_grep_mcp --stdio
```

```bash
codex mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@latest baoer_signal_grep_mcp --stdio
```

`@latest` follows the newest published version when MCP starts. Restart the host to load updates. The server searches the active project; `BAOER_SIGNAL_GREP_MCP_CWD` can select a different root. An MCP-only connection adds the tool without disabling other search tools.

Pi and OMP load their host-scoped configuration by default. Set `BAOER_SIGNAL_GREP_CONFIG` in the actual host process environment when all hosts should share one explicit file; it overrides the host-scoped path for Pi and OMP as well as MCP. Claude Code, Codex and Kimi all start the same standalone MCP server, so add this variable to each host's MCP `env` map rather than relying only on a shell startup file:

```text
BAOER_SIGNAL_GREP_CONFIG=/absolute/path/to/baoer_signal_grep.json
```

Keep `TYPESAFE_API_KEY` in the MCP process environment or its secret manager; never put the credential value in the configuration file or a checked-in host manifest. The standalone MCP server keeps semantic judging disabled when this path is absent, and fails at startup when an explicit path is missing or an enabled configuration has no key. It never silently claims that Jev ran. Startup diagnostics are written to stderr, and hybrid results expose `semanticJudge.status`; `complete` with `judgedCandidates > 0` is the runtime evidence that the layer actually ran.

MCP returns readable text plus structured evidence by default. If a host serializes both forms into the model context, set `BAOER_SIGNAL_GREP_MCP_OUTPUT_MODE=model` in that MCP server's environment and restart it. Model mode omits `structuredContent` and its advertised output schema, advertises concise workflow guidance, and selects the smaller of the standard page and a compact view of the same retained analysis snapshot. Repeated paths and inspect requests are shared, hybrid does not concatenate separate literal and Concept bodies, and outline excerpts are deferred to version-checked inspection. Counts, coverage, partial status, reasons and continuation requests remain visible. Use `text` to omit structured output while preserving the complete standard text and full usage guidance, or retain the default `structured` mode for programmatic consumers and clients that expose only structured results. Any other value fails at startup. The bundled Claude Code, Codex and Kimi native plugins select `model`; direct MCP connections retain the structured default unless configured explicitly.

`paths` selects exact retained files from an existing cursor; a new search accepts one `path`. Split unrelated roots into separate requests rather than replacing them with a broader common parent. Markdown inspection uses a bounded line window and does not require Universal Ctags; missing structure providers remain visible when they affect code structure inspection.

### Native plugins

For conventional search enforcement in other hosts:

- **Claude Code:** `/plugin marketplace add xcjy8bao/baoer_signal_grep`, then `/plugin install baoer-signal-grep@baoer-signal-grep`.
- **Codex:** `codex plugin marketplace add xcjy8bao/baoer_signal_grep`, then `codex plugin add baoer-signal-grep@baoer-signal-grep`; review and trust the hook in `/hooks`.
- **Kimi Code:** `/plugins install /absolute/path/plugins/baoer-signal-grep` using the plugin directory from this repository or installed package, then confirm trust and run `/reload`.

Kimi Code's web mode can start plugin MCP servers from its installation directory. If relative MCP searches resolve to the wrong project, keep the native plugin for search enforcement and add a project-local `.kimi-code/mcp.json` entry with the same `baoer_signal_grep` server and an explicit absolute `cwd` for that project.

Restart after installation. Native hooks use hard enforcement by default. To keep the native plugin, MCP tool and model guidance without denying conventional searches, start the host with `BAOER_SIGNAL_GREP_ENFORCE_SEARCH=prefer`; use `off` to disable only hook enforcement. Accepted values are `hard`, `prefer`, and `off`; an unsupported value fails closed instead of silently allowing a search. The setting is inherited from the host process, so a project cannot lower a user's policy merely by committing a repository configuration file. You can still disable the complete integration through Claude Code `/plugin`, Codex `/hooks`, or Kimi `/plugins disable baoer-signal-grep` followed by `/reload`.

In hard mode, a direct search such as `grep warning report.txt` is denied. A trailing filter such as `cat report.txt | grep warning` remains available because it filters output from a non-search producer; `find src | grep test` and `rg warning src | grep result` remain denied because their pipelines already contain a direct search producer. If one subcommand in a compound shell call is denied, the host executes none of that call. The denial identifies the detected search and tells the agent to retry non-search operations separately.

Local searches stay on your machine. Only grant access to files your agent is allowed to read. HTTP deployments need an authenticated gateway before public exposure; see [Security](SECURITY.md).

[Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [AGPL-3.0-only license](LICENSE)
