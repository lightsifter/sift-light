# Changelog

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
