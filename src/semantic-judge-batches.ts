import { SiftLightError } from "./errors.js";
import type {
  SemanticJudgeCandidate,
  SemanticJudgeResult,
  SemanticJudgeRunner,
} from "./semantic-judge.js";

const MAX_SEMANTIC_JUDGE_BATCH_CANDIDATES = 8;
export const MAX_SEMANTIC_JUDGE_REQUEST_BYTES = 64 * 1024;

export class SemanticJudgePayloadTooLargeError extends SiftLightError {
  constructor(message: string) {
    super(message);
    this.name = "SemanticJudgePayloadTooLargeError";
  }
}

interface SemanticJudgeBatch {
  startIndex: number;
  candidates: SemanticJudgeCandidate[];
}

export interface SemanticJudgeBatchSuccess extends SemanticJudgeBatch {
  result: SemanticJudgeResult;
}

export interface SemanticJudgeBatchFailure extends SemanticJudgeBatch {
  error: unknown;
}

export interface SemanticJudgeBatchExecution {
  successes: SemanticJudgeBatchSuccess[];
  failures: SemanticJudgeBatchFailure[];
  attempts: number;
  splits: number;
}

export function createSemanticJudgeBatches(
  candidates: readonly SemanticJudgeCandidate[],
  serializedBytes: (candidates: readonly SemanticJudgeCandidate[]) => number,
): SemanticJudgeBatch[] {
  const batches: SemanticJudgeBatch[] = [];
  let startIndex = 0;
  let current: SemanticJudgeCandidate[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const proposed = [...current, candidate];
    const exceedsCount = proposed.length > MAX_SEMANTIC_JUDGE_BATCH_CANDIDATES;
    const exceedsBytes = serializedBytes(proposed) > MAX_SEMANTIC_JUDGE_REQUEST_BYTES;
    if (current.length > 0 && (exceedsCount || exceedsBytes)) {
      batches.push({ startIndex, candidates: current });
      startIndex = index;
      current = [candidate];
    } else {
      current = proposed;
    }
  }
  if (current.length > 0) batches.push({ startIndex, candidates: current });
  return batches;
}

function combineBatchExecutions(
  executions: readonly SemanticJudgeBatchExecution[],
): SemanticJudgeBatchExecution {
  return {
    successes: executions.flatMap((execution) => execution.successes),
    failures: executions.flatMap((execution) => execution.failures),
    attempts: executions.reduce((total, execution) => total + execution.attempts, 0),
    splits: executions.reduce((total, execution) => total + execution.splits, 0),
  };
}

async function settledBatchExecutions(
  operations: readonly Promise<SemanticJudgeBatchExecution>[],
): Promise<SemanticJudgeBatchExecution[]> {
  const settled = await Promise.allSettled(operations);
  const executions: SemanticJudgeBatchExecution[] = [];
  let hasRejection = false;
  let rejection: unknown;
  for (const result of settled) {
    if (result.status === "rejected") {
      if (!hasRejection) rejection = result.reason;
      hasRejection = true;
    } else executions.push(result.value);
  }
  if (hasRejection) throw rejection;
  return executions;
}

async function judgeBatchWithSplit(
  runner: SemanticJudgeRunner,
  query: string,
  batch: SemanticJudgeBatch,
  signal?: AbortSignal,
): Promise<SemanticJudgeBatchExecution> {
  try {
    const result = await runner(query, batch.candidates, signal);
    return { successes: [{ ...batch, result }], failures: [], attempts: 1, splits: 0 };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof SemanticJudgePayloadTooLargeError && batch.candidates.length > 1) {
      const midpoint = Math.ceil(batch.candidates.length / 2);
      const left = await judgeBatchWithSplit(
        runner,
        query,
        { startIndex: batch.startIndex, candidates: batch.candidates.slice(0, midpoint) },
        signal,
      );
      const right = await judgeBatchWithSplit(
        runner,
        query,
        {
          startIndex: batch.startIndex + midpoint,
          candidates: batch.candidates.slice(midpoint),
        },
        signal,
      );
      const combined = combineBatchExecutions([left, right]);
      return { ...combined, attempts: combined.attempts + 1, splits: combined.splits + 1 };
    }
    return { successes: [], failures: [{ ...batch, error }], attempts: 1, splits: 0 };
  }
}

export async function judgeSemanticCandidateBatches(
  runner: SemanticJudgeRunner,
  query: string,
  batches: readonly SemanticJudgeBatch[],
  signal?: AbortSignal,
): Promise<SemanticJudgeBatchExecution> {
  return combineBatchExecutions(
    await settledBatchExecutions(
      batches.map((batch) => judgeBatchWithSplit(runner, query, batch, signal)),
    ),
  );
}
