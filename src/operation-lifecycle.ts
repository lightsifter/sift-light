import { randomUUID } from "node:crypto";

export const OPERATION_INITIAL_WAIT_MS = 5_000;
export const OPERATION_DEFAULT_DEADLINE_MS = 10 * 60_000;
export const OPERATION_DEFAULT_LEASE_MS = 2 * 60_000;
export const OPERATION_RESULT_TTL_MS = 10 * 60_000;
export const MAX_ACTIVE_OPERATIONS = 8;
export const MAX_RETAINED_OPERATIONS = 32;

export type OperationState = "running" | "complete" | "failed" | "cancelled" | "expired";

export interface OperationMetadata {
  mode: "concept" | "hybrid";
  redact: boolean;
  cwd: string;
}

export interface OperationProgress {
  phase: string;
  completed?: number;
  total?: number;
  detail?: string;
}

export interface OperationSnapshot<T> {
  readonly id: string;
  readonly state: OperationState;
  readonly startedAt: number;
  readonly deadlineAt: number;
  readonly leaseExpiresAt: number;
  readonly metadata: OperationMetadata;
  readonly progress?: OperationProgress;
  readonly result?: T;
  readonly error?: unknown;
}

interface OperationEntry<T> {
  readonly id: string;
  readonly startedAt: number;
  readonly deadlineAt: number;
  readonly controller: AbortController;
  readonly promise: Promise<T>;
  state: OperationState;
  leaseExpiresAt: number;
  readonly metadata: OperationMetadata;
  progress?: OperationProgress;
  result?: T;
  error?: unknown;
  settled: boolean;
  retainedAt: number | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
  leaseTimer: ReturnType<typeof setTimeout> | undefined;
  readonly waiters: Set<() => void>;
}

export type OperationWaitResult<T> =
  | { state: "running"; operation: OperationSnapshot<T> }
  | { state: "complete"; operation: OperationSnapshot<T>; result: T }
  | { state: "failed"; operation: OperationSnapshot<T>; error: unknown }
  | { state: "cancelled" | "expired"; operation: OperationSnapshot<T>; error: unknown };

export interface OperationLifecycleOptions {
  now?: () => number;
  maxOperations?: number;
  deadlineMs?: number;
  leaseMs?: number;
  resultTtlMs?: number;
  maxRetainedOperations?: number;
}

function abortReason(signal: AbortSignal | undefined): Error {
  return signal?.reason instanceof Error ? signal.reason : new Error("Operation was cancelled");
}

function snapshot<T>(entry: OperationEntry<T>): OperationSnapshot<T> {
  return {
    id: entry.id,
    state: entry.state,
    startedAt: entry.startedAt,
    deadlineAt: entry.deadlineAt,
    leaseExpiresAt: entry.leaseExpiresAt,
    metadata: entry.metadata,
    ...(entry.progress ? { progress: { ...entry.progress } } : {}),
    ...(entry.result === undefined ? {} : { result: entry.result }),
    ...(entry.error === undefined ? {} : { error: entry.error }),
  };
}

/** Owns long-running work and its retained result for one service session. */
export class OperationLifecycle<T> {
  readonly #operations = new Map<string, OperationEntry<T>>();
  readonly #pending = new Set<Promise<T>>();
  readonly #now: () => number;
  readonly #maxOperations: number;
  readonly #deadlineMs: number;
  readonly #leaseMs: number;
  readonly #resultTtlMs: number;
  readonly #maxRetainedOperations: number;
  #closed = false;

  constructor(options: OperationLifecycleOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#maxOperations = options.maxOperations ?? MAX_ACTIVE_OPERATIONS;
    this.#deadlineMs = options.deadlineMs ?? OPERATION_DEFAULT_DEADLINE_MS;
    this.#leaseMs = options.leaseMs ?? OPERATION_DEFAULT_LEASE_MS;
    this.#resultTtlMs = options.resultTtlMs ?? OPERATION_RESULT_TTL_MS;
    this.#maxRetainedOperations = options.maxRetainedOperations ?? MAX_RETAINED_OPERATIONS;
    if (!Number.isSafeInteger(this.#maxOperations) || this.#maxOperations < 1)
      throw new Error("maxOperations must be a positive safe integer");
    if (!Number.isSafeInteger(this.#deadlineMs) || this.#deadlineMs < 1)
      throw new Error("deadlineMs must be a positive safe integer");
    if (!Number.isSafeInteger(this.#leaseMs) || this.#leaseMs < 1)
      throw new Error("leaseMs must be a positive safe integer");
    if (!Number.isSafeInteger(this.#resultTtlMs) || this.#resultTtlMs < 1)
      throw new Error("resultTtlMs must be a positive safe integer");
    if (!Number.isSafeInteger(this.#maxRetainedOperations) || this.#maxRetainedOperations < 1)
      throw new Error("maxRetainedOperations must be a positive safe integer");
  }

  get size(): number {
    this.#expireRetained();
    return this.#operations.size;
  }

  start(
    run: (signal: AbortSignal, operationId: string) => Promise<T>,
    metadata: OperationMetadata,
  ): OperationSnapshot<T> & {
    promise: Promise<T>;
  } {
    this.#expireRetained();
    if (this.#closed) throw new Error("Operation lifecycle is closed");
    if (this.#pending.size >= this.#maxOperations)
      throw new Error(
        `Operation resource limit reached (${String(this.#maxOperations)} pending operations)`,
      );
    const id = randomUUID();
    const startedAt = this.#now();
    const controller = new AbortController();
    const promise = Promise.resolve().then(() => run(controller.signal, id));
    const entry: OperationEntry<T> = {
      id,
      startedAt,
      deadlineAt: startedAt + this.#deadlineMs,
      leaseExpiresAt: startedAt + this.#leaseMs,
      metadata,
      controller,
      promise,
      state: "running",
      settled: false,
      retainedAt: undefined,
      waiters: new Set(),
      timer: undefined,
      leaseTimer: undefined,
    };
    this.#operations.set(id, entry);
    this.#pending.add(promise);
    void promise.finally(() => this.#pending.delete(promise)).catch(() => undefined);
    entry.timer = setTimeout(() => {
      this.#finishFailure(entry, "Operation deadline exceeded");
      controller.abort(new Error("Operation deadline exceeded"));
    }, this.#deadlineMs);
    entry.timer.unref?.();
    this.#armLease(entry);
    void entry.promise.then(
      (result) => {
        entry.settled = true;
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = undefined;
        if (entry.state === "running") {
          entry.state = "complete";
          entry.result = result;
          this.#retainResult(entry);
          this.#notify(entry);
        }
        return undefined;
      },
      (error: unknown) => {
        entry.settled = true;
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = undefined;
        if (entry.state === "running") {
          entry.state = controller.signal.aborted ? "cancelled" : "failed";
          entry.error = error;
          this.#retainResult(entry);
          this.#notify(entry);
        }
        return undefined;
      },
    );
    return { ...snapshot(entry), promise: entry.promise };
  }

  get(operationId: string): OperationSnapshot<T> {
    this.#expireRetained();
    const entry = this.#operations.get(operationId);
    if (!entry) throw new Error("Operation was not found or has expired; start the query again");
    return snapshot(entry);
  }

  updateProgress(operationId: string, progress: OperationProgress): void {
    const entry = this.#operations.get(operationId);
    if (!entry || entry.state !== "running") return;
    entry.progress = { ...progress };
  }

  touch(operationId: string): OperationSnapshot<T> {
    const entry = this.#operations.get(operationId);
    if (!entry) throw new Error("Operation was not found or has expired; start the query again");
    if (entry.state === "running") this.#touch(entry);
    return snapshot(entry);
  }

  async wait(
    operationId: string,
    timeoutMs = OPERATION_INITIAL_WAIT_MS,
    signal?: AbortSignal,
  ): Promise<OperationWaitResult<T>> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0)
      throw new Error("timeoutMs must be a non-negative safe integer");
    const entry = this.#operations.get(operationId);
    if (!entry) throw new Error("Operation was not found or has expired; start the query again");
    if (entry.state !== "running") return this.#settled(entry);
    this.#touch(entry);
    return new Promise<OperationWaitResult<T>>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let finished = false;
      let aborting = false;
      const onSettled = (): void => finish(this.#settled(entry));
      const finish = (result: OperationWaitResult<T>): void => {
        if (finished || aborting) return;
        finished = true;
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        entry.waiters.delete(onSettled);
        resolve(result);
      };
      const onAbort = (): void => {
        if (finished || aborting) return;
        aborting = true;
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        entry.waiters.delete(onSettled);
        const reason = abortReason(signal);
        void this.cancelAndWait(operationId, reason).then(
          () => {
            if (!finished) {
              finished = true;
              reject(reason);
            }
            return undefined;
          },
          (error: unknown) => {
            if (!finished) {
              finished = true;
              reject(error);
            }
            return undefined;
          },
        );
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => finish({ state: "running", operation: snapshot(entry) }), timeoutMs);
      timer.unref?.();
      entry.waiters.add(onSettled);
    });
  }

  cancel(operationId: string, reason = new Error("Operation cancelled")): OperationSnapshot<T> {
    const entry = this.#operations.get(operationId);
    if (!entry) throw new Error("Operation was not found or has expired; start the query again");
    if (entry.state === "running") {
      entry.state = "cancelled";
      entry.error = reason;
      entry.controller.abort(reason);
      this.#retainResult(entry);
      this.#notify(entry);
    }
    return snapshot(entry);
  }

  async cancelAndWait(
    operationId: string,
    reason = new Error("Operation cancelled"),
  ): Promise<OperationSnapshot<T>> {
    const entry = this.#operations.get(operationId);
    if (!entry) throw new Error("Operation was not found or has expired; start the query again");
    this.cancel(operationId, reason);
    await Promise.allSettled([entry.promise]);
    return snapshot(entry);
  }

  clear(reason = new Error("Operation session closed")): void {
    this.#closed = true;
    for (const entry of this.#operations.values()) {
      if (entry.state === "running") this.cancel(entry.id, reason);
      this.#clearTimers(entry);
    }
    this.#operations.clear();
  }

  reset(reason = new Error("Operation session reset")): void {
    this.clear(reason);
    this.#closed = false;
  }

  async shutdown(reason = new Error("Operation session closed")): Promise<void> {
    this.clear(reason);
    await Promise.allSettled(this.#pending);
  }

  #settled(entry: OperationEntry<T>): OperationWaitResult<T> {
    const current = snapshot(entry);
    if (entry.state === "complete" && entry.result !== undefined)
      return { state: "complete", operation: current, result: entry.result };
    if (entry.state === "failed")
      return { state: "failed", operation: current, error: entry.error };
    if (entry.state === "cancelled" || entry.state === "expired")
      return { state: entry.state, operation: current, error: entry.error };
    return { state: "running", operation: current };
  }

  #finishFailure(entry: OperationEntry<T>, message: string): void {
    if (entry.state !== "running") return;
    entry.state = "failed";
    entry.error = new Error(message);
    this.#retainResult(entry);
    this.#notify(entry);
  }

  #retainResult(entry: OperationEntry<T>): void {
    if (entry.settled && entry.timer) clearTimeout(entry.timer);
    if (entry.settled) entry.timer = undefined;
    if (entry.leaseTimer) clearTimeout(entry.leaseTimer);
    entry.leaseTimer = undefined;
    entry.retainedAt = this.#now();
    entry.leaseExpiresAt = this.#now() + this.#resultTtlMs;
    entry.leaseTimer = setTimeout(() => this.#evict(entry), this.#resultTtlMs);
    entry.leaseTimer.unref?.();
    this.#evictRetainedOverflow();
  }

  #notify(entry: OperationEntry<T>): void {
    const waiters = [...entry.waiters];
    entry.waiters.clear();
    for (const waiter of waiters) waiter();
  }

  #touch(entry: OperationEntry<T>): void {
    entry.leaseExpiresAt = this.#now() + this.#leaseMs;
    this.#armLease(entry);
  }

  #armLease(entry: OperationEntry<T>): void {
    if (entry.leaseTimer) clearTimeout(entry.leaseTimer);
    entry.leaseTimer = setTimeout(
      () => {
        if (entry.state === "running") {
          entry.state = "expired";
          entry.error = new Error("Operation lease expired without a continuation");
          entry.controller.abort(entry.error);
        }
        this.#evict(entry);
      },
      Math.max(1, entry.leaseExpiresAt - this.#now()),
    );
    entry.leaseTimer.unref?.();
  }

  #evict(entry: OperationEntry<T>): void {
    if (this.#operations.get(entry.id) !== entry) return;
    if (entry.state === "running") {
      entry.state = "expired";
      entry.error = new Error("Operation lease expired without a continuation");
      entry.controller.abort(entry.error);
    }
    this.#notify(entry);
    this.#clearTimers(entry);
    this.#operations.delete(entry.id);
  }

  #evictRetainedOverflow(): void {
    const retained = [...this.#operations.values()]
      .filter((entry) => entry.state !== "running" && entry.retainedAt !== undefined)
      .toSorted(
        (left, right) =>
          (left.retainedAt ?? left.startedAt) - (right.retainedAt ?? right.startedAt),
      );
    while (retained.length > this.#maxRetainedOperations) {
      const candidate = retained.shift();
      if (!candidate || candidate.waiters.size > 0) continue;
      this.#evict(candidate);
    }
  }

  #clearTimers(entry: OperationEntry<T>, includeLease = true): void {
    if (entry.timer) clearTimeout(entry.timer);
    if (includeLease && entry.leaseTimer) clearTimeout(entry.leaseTimer);
    entry.timer = undefined;
    if (includeLease) entry.leaseTimer = undefined;
  }

  #expireRetained(): void {
    const now = this.#now();
    for (const entry of this.#operations.values()) {
      if (entry.leaseExpiresAt <= now) this.#evict(entry);
    }
  }
}
