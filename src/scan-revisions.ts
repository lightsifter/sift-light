import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { abortError, SiftLightError } from "./errors.js";
import { runOwnedProcess } from "./owned-process.js";
import {
  boundedRipgrepDiagnostic,
  classifyRipgrepDiagnostics,
  createRipgrepInputError,
  type RipgrepRecoveryRequest,
  type RipgrepUnreadableDiagnostic,
} from "./ripgrep-diagnostics.js";
import { getSourceRevision, sameSourceRevision, sourceRevisionFromStats } from "./source.js";
import {
  MAX_PROTOCOL_LINE_BYTES,
  MAX_SOURCE_REVISION_CONCURRENCY,
  type SourceRevision,
} from "./types.js";
import type { SourceReference } from "./source-document.js";

const SOURCE_HASH_CONCURRENCY = 4;

async function captureRevision(
  path: string,
  revisions: Map<string, SourceRevision>,
  onRevisionError?: (path: string, error: unknown) => void,
): Promise<void> {
  let failed = false;
  let failure: unknown;
  const revision = await getSourceRevision(path, (error) => {
    failed = true;
    failure = error;
  });
  if (revision) revisions.set(path, revision);
  if (failed) onRevisionError?.(path, failure);
}

async function captureBatch(
  paths: string[],
  revisions: Map<string, SourceRevision>,
  signal?: AbortSignal,
  onRevisionError?: (path: string, error: unknown) => void,
): Promise<void> {
  if (signal?.aborted) throw abortError();
  await Promise.all(paths.map((path) => captureRevision(path, revisions, onRevisionError)));
  if (signal?.aborted) throw abortError();
}

/** Enumerate names only; finish all retained metadata reads before starting content search. */
export async function captureCandidateRevisions(
  executable: string,
  args: string[],
  cwd: string,
  maxFiles: number,
  signal?: AbortSignal,
  redact = false,
  request?: RipgrepRecoveryRequest,
): Promise<{
  revisions: Map<string, SourceRevision>;
  unreadable: RipgrepUnreadableDiagnostic[];
  enumerationTruncated: boolean;
  invalidPathCount: number;
}> {
  const revisions = new Map<string, SourceRevision>();
  let candidateCount = 0;
  let enumerationTruncated = false;
  let invalidPathCount = 0;
  const metadataFailures: RipgrepUnreadableDiagnostic[] = [];
  const recordMetadataFailure = (path: string, error: unknown): void => {
    const reason = error instanceof Error ? error.message : String(error);
    metadataFailures.push({
      path,
      message: `Source metadata unavailable: ${boundedRipgrepDiagnostic(reason, redact)}`,
    });
  };
  const result = await runOwnedProcess(
    { executable, args, cwd, ...(signal ? { signal } : {}) },
    async (stdout) => {
      let pending = Buffer.alloc(0);
      let batch: string[] = [];
      for await (const chunk of stdout) {
        if (signal?.aborted) throw abortError();
        pending = Buffer.concat([pending, chunk]);
        let delimiter = pending.indexOf(0);
        while (delimiter >= 0) {
          const rawPath = pending.subarray(0, delimiter);
          if (rawPath.length > MAX_PROTOCOL_LINE_BYTES) {
            throw new SiftLightError("ripgrep file path exceeds the protocol byte limit");
          }
          const path = rawPath.toString("utf8");
          // Lossy file names cannot provide trustworthy path-based revision evidence.
          if (Buffer.from(path, "utf8").equals(rawPath)) {
            if (candidateCount < maxFiles) {
              candidateCount += 1;
              batch.push(resolve(cwd, path));
            } else {
              enumerationTruncated = true;
            }
            if (batch.length === MAX_SOURCE_REVISION_CONCURRENCY) {
              // oxlint-disable-next-line no-await-in-loop -- backpressure bounds concurrent metadata reads.
              await captureBatch(batch, revisions, signal, recordMetadataFailure);
              batch = [];
            }
          } else {
            invalidPathCount += 1;
          }
          pending = pending.subarray(delimiter + 1);
          delimiter = pending.indexOf(0);
        }
        if (pending.length > MAX_PROTOCOL_LINE_BYTES) {
          throw new SiftLightError("ripgrep file path exceeds the protocol byte limit");
        }
      }
      if (pending.length > 0) {
        throw new SiftLightError("ripgrep file enumeration ended without a NUL delimiter");
      }
      await captureBatch(batch, revisions, signal, recordMetadataFailure);
    },
  );
  const diagnostics = classifyRipgrepDiagnostics(result.stderr);
  const inputError = createRipgrepInputError(result.stderr, redact, request);
  const unreadable = [...diagnostics.unreadable, ...diagnostics.recoverable, ...metadataFailures];
  if (inputError) throw inputError;
  if (result.code === 2 && diagnostics.other.length === 0 && unreadable.length > 0)
    return { revisions, unreadable, enumerationTruncated, invalidPathCount };
  if (result.code !== 0 && result.code !== 1) {
    throw new SiftLightError(
      result.stderr.trim() || `ripgrep file enumeration exited with status ${String(result.code)}`,
    );
  }
  return { revisions, unreadable, enumerationTruncated, invalidPathCount };
}

export async function retainStableSourceRevisions(
  paths: ReadonlySet<string>,
  before: ReadonlyMap<string, SourceRevision>,
  signal?: AbortSignal,
): Promise<Map<string, SourceRevision>> {
  const after = new Map<string, SourceRevision>();
  const candidates = [...paths].filter((path) => before.has(path));
  for (let offset = 0; offset < candidates.length; offset += MAX_SOURCE_REVISION_CONCURRENCY) {
    // oxlint-disable-next-line no-await-in-loop -- batches keep source metadata concurrency bounded.
    await captureBatch(
      candidates.slice(offset, offset + MAX_SOURCE_REVISION_CONCURRENCY),
      after,
      signal,
    );
  }
  return new Map(
    [...after].filter(([path, revision]) => {
      const initial = before.get(path);
      return initial !== undefined && sameSourceRevision(initial, revision);
    }),
  );
}

async function captureStableSourceReference(
  path: string,
  expected: SourceRevision,
  signal?: AbortSignal,
): Promise<SourceReference | undefined> {
  if (signal?.aborted) throw abortError();
  const before = await getSourceRevision(path);
  if (!before || !sameSourceRevision(expected, before)) return undefined;
  const handle = await open(path, "r");
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || !sameSourceRevision(before, sourceRevisionFromStats(metadata))) {
      return undefined;
    }
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let offset = 0;
    while (offset < before.size) {
      if (signal?.aborted) throw abortError();
      // oxlint-disable-next-line no-await-in-loop -- one bounded file stream owns the hash.
      const read = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, before.size - offset),
        offset,
      );
      if (read.bytesRead === 0) return undefined;
      hash.update(buffer.subarray(0, read.bytesRead));
      offset += read.bytesRead;
    }
    const after = await getSourceRevision(path);
    if (!after || !sameSourceRevision(before, after)) return undefined;
    return {
      path,
      origin: { kind: "worktree", revision: after, contentHash: hash.digest("hex") },
    };
  } finally {
    await handle.close();
  }
}

/** Capture content identities for retained matches without buffering whole files in memory. */
export async function captureStableSourceReferences(
  paths: ReadonlySet<string>,
  before: ReadonlyMap<string, SourceRevision>,
  signal?: AbortSignal,
): Promise<Map<string, SourceReference>> {
  const candidates = [...paths].filter((path) => before.has(path));
  const references = new Map<string, SourceReference>();
  for (let offset = 0; offset < candidates.length; offset += SOURCE_HASH_CONCURRENCY) {
    if (signal?.aborted) throw abortError();
    const batch = candidates.slice(offset, offset + SOURCE_HASH_CONCURRENCY);
    // oxlint-disable-next-line no-await-in-loop -- bounded content hashing avoids unbounded I/O.
    const captured = await Promise.all(
      batch.map(async (path) => {
        const expected = before.get(path);
        if (!expected) return undefined;
        try {
          return await captureStableSourceReference(path, expected, signal);
        } catch (error) {
          if (signal?.aborted) throw error;
          return undefined;
        }
      }),
    );
    for (const reference of captured) {
      if (reference) references.set(reference.path, reference);
    }
  }
  return references;
}
