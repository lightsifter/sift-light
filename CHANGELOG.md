# Changelog

## 1.0.5-1 — 2026-10-09

- Fix OMP plugin-cache searches when the generated bundle cannot resolve its platform ripgrep package. Bundled ripgrep remains preferred; an executable `rg` on `PATH` is now a bounded compatibility fallback, while explicit `SIFT_LIGHT_RG_PATH` values retain strict absolute-path and executable validation.
- Document the fallback and update the packaged Pi, OMP, MCP and Codex plugin artifacts.

## 1.0.3-6 — 2026-10-09

- Add bounded, read-only configured data-source adapters with explicit HTTPS/loopback validation, credential references and revision-aware source reads.
- Improve hybrid relevance ranking with request-scoped BM25 and semantic rank fusion, identifier-declaration candidates and distinct passage handling.
- Harden MCP/request-contract integration and add a packaged MCP smoke test so the published artifact is exercised through the real stdio transport.

## 1.0.3-5 — 2026-10-07

- Update the MCP SDK to 1.31.0 and Transformers.js to 4.3.1 to remove the dependency vulnerabilities reported in [#111](https://github.com/lightsifter/sift-light/issues/111), including the old ONNX proxy/logging dependency chain. Refresh compatible SDK transitive dependencies in the lockfile.
- Recompute cached text embeddings after the inference runtime upgrade; the pinned offline model and search interfaces remain unchanged.

## 1.0.3-4 — 2026-10-05

- Allow recognized stdin-only filters at any pipeline position, including `cmd | grep pattern | head` and `cmd | grep pattern | wc -l`. Deny file operands, recursive search, file-sourced patterns, input redirection, and unsafe dynamic arguments even when a filter receives piped input ([#109](https://github.com/lightsifter/sift-light/issues/109)).
- Apply the same input-aware policy to Pi, OMP, and native plugin hooks, including PowerShell file-object pipeline handling.

## 1.0.3-3 — 2026-10-04

- Keep explicit paths outside the MCP project isolated after zero matches by default, and evaluate content-search and file-discovery globs/exclusions from the selected external root. Explicit `scope: "expand"` still retries the MCP project ([#106](https://github.com/lightsifter/sift-light/issues/106)).

## 1.0.3-2 — 2026-09-30

- Accept an empty `sourceCursor` placeholder outside `mode: "inspect"` by removing the key before mode validation, with the normalization disclosed in text and `details.requestNotes` ([#101](https://github.com/lightsifter/sift-light/issues/101)). Nonempty source continuation tokens still require inspection mode; empty inspection tokens and ordinary `cursor` validation retain their existing failure behavior.
- Apply the same normalization to Pi, OMP and MCP through the shared request boundary. This fixes the reported rejected request shape without attributing the placeholder to a particular model or host.

## 1.0.3-1 — 2026-09-30

- Explain missing inspection paths explicitly while retaining the `source-unavailable` status for compatibility.
- Label term counts with numbered input literals in text, structured output and continuation pages; keep anonymized labels when redaction is requested.
- Bundle a Codex local-search skill and discovery guidance that checks the complete runtime registry, including deferred tools, before reporting sift-light unavailable.

## 1.0.2 — 2026-09-29

### Fixed

- Inspecting an outline item (`cursor` + `matchIndex` from `mode: "outline"`) now returns the symbol's version-checked source with its syntax boundary instead of metadata only ([#96](https://github.com/lightsifter/sift-light/issues/96)).
- `mode: "files"` no longer reports `complete` coverage when ignore rules skipped files. It reports `policy-filtered` coverage, the number of ignored files and how many of them match the query with examples, and accepts `ignorePolicy: "include"` to list them. File candidates show their score and ranking reason in text and compact model output ([#97](https://github.com/lightsifter/sift-light/issues/97)).
- Display redaction keeps the source's own quoting. An unquoted secret such as `DB_PASSWORD=value` is shown as `DB_PASSWORD=[REDACTED]` instead of `DB_PASSWORD="[REDACTED]"`, so masked output no longer suggests quotes that are not in the file.
- Display redaction no longer masks source code that reads a secret. An unquoted value that starts as a call or index expression, such as `password = env.get("DB_PASS", "")` or `api_key = os.environ["API_KEY"]`, stays visible, so the key being read remains available as evidence. A literal secret that is unquoted and itself begins with letters followed by `(` or `[` is therefore not masked.
- `mode: "inspect"` with a direct `path` and no `line` opens the file from line 1 instead of failing. Cursor inspection still requires the exact retained line.

### Changed

These request shapes were observed from real agent sessions; each was rejected although its intent was unambiguous. Rewrites are disclosed in `details.requestNotes` and as `[Request note: …]` lines.

- `mode: "files"` accepts `limit` (files per page, default 30), the redundant `scope: "strict"` and `ignorePolicy`. A wildcard-only `query` (`*`, `**`, `.*`) lists every file, and a plain glob query such as `*.py` is applied as a glob filter; regex-like queries still fail with guidance. `pattern: ".*"` gets an exact retry request.
- `mode: "inspect"` accepts `paths` without a cursor to open several files from line 1, and the redundant `scope: "strict"` (`scope: "expand"` fails). `targets` and `matchIndices` accept up to 20 entries: five are inspected per response and the rest are returned as an exact `nextRequest`. A `sourceCursor` request may repeat its own `path` (a different path fails) and ignores `line` with a note.
- `anyOf` accepts one term and `allOf` accepts one to three terms. `mode: "anyOf"` and `mode: "allOf"` are accepted as aliases for omitting `mode`, and `anyOf` with `mode: "summary"` is served by its analysis page.
- `roles` supports Python through a bounded lexical scanner: comments, strings and code are exact; declarations and imports are line facts; calls are candidates. `mode: "capabilities"` lists it.
- A request without `pattern` explains how to list files or read a known file.

## 1.0.1 — 2026-09-23

### Changed

- Local vector search is now off by default. Existing `concept` and `hybrid` calls require `"vectorSearchEnabled": true` in the active `sift-light.json` and an installed model; otherwise they fail explicitly. Ordinary search remains available. Installing the model or enabling the optional Jev judge alone does not opt in.

### Fixed

- Improve semantic ranking when very short passages compete with more detailed source evidence. Raw cosine similarity remains available alongside the ranking score; results are still relevance candidates, not verified behavior.
- Give `files` requests that mistakenly use a plain `pattern` a complete, scope-preserving `query` recovery request. Reduce repeated request-error text.
- Condense hybrid and Concept diagnostics in model-facing output while keeping coverage, progress, recovery, and semantic-judge status visible.
- Ask the optional Jev semantic judge to classify each candidate by its own excerpt, avoiding a shared classification instruction across candidates.

### Performance and compatibility

- Use length-aware inference ordering, batches of four, four ONNX CPU threads, and a shorter token window to reduce cold semantic search time on the tested workloads. The changed windowing invalidates older embedding cache entries once; subsequent searches refill the cache.
- Cold semantic inference can still take tens of seconds and use more than 1 GiB of worker memory. The improvement is workload-dependent and is not a memory cap or a subsecond cold-start guarantee.
