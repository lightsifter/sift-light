# Changelog

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
