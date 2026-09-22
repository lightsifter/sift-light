import { resolve } from "node:path";
import { abortError, SiftlightError } from "./errors.js";
import { runOwnedProcess } from "./owned-process.js";
import {
  boundedRipgrepDiagnostic,
  classifyRipgrepDiagnostics,
  createRipgrepInputError,
  type RipgrepUnreadableDiagnostic,
} from "./ripgrep-diagnostics.js";
import { getSourceRevision, sameSourceRevision } from "./source.js";
import {
  MAX_PROTOCOL_LINE_BYTES,
  MAX_SOURCE_REVISION_CONCURRENCY,
  type SourceRevision,
} from "./types.js";

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
            throw new SiftlightError("ripgrep file path exceeds the protocol byte limit");
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
          throw new SiftlightError("ripgrep file path exceeds the protocol byte limit");
        }
      }
      if (pending.length > 0) {
        throw new SiftlightError("ripgrep file enumeration ended without a NUL delimiter");
      }
      await captureBatch(batch, revisions, signal, recordMetadataFailure);
    },
  );
  const diagnostics = classifyRipgrepDiagnostics(result.stderr);
  const inputError = createRipgrepInputError(result.stderr, redact);
  const unreadable = [...diagnostics.unreadable, ...metadataFailures];
  if (inputError) throw inputError;
  if (result.code === 2 && diagnostics.other.length === 0 && unreadable.length > 0)
    return { revisions, unreadable, enumerationTruncated, invalidPathCount };
  if (result.code !== 0 && result.code !== 1) {
    throw new SiftlightError(
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
