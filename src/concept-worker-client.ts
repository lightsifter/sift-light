import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StringDecoder } from "node:string_decoder";
import type { Writable } from "node:stream";
import { abortError, ConceptUnavailableError, SiftLightError } from "./errors.js";
import {
  conceptCacheDirectory,
  conceptModelDirectory,
  MAX_CONCEPT_WORKER_INPUT_BYTES,
  MAX_CONCEPT_WORKER_OUTPUT_BYTES,
} from "./concept-model.js";
import { runOwnedProcess } from "./owned-process.js";
import { OwnedTaskQueue } from "./owned-task-queue.js";
import { scriptRuntimeEnvironment } from "./script-runtime.js";
import { isRecordValue } from "./record-value.js";
import {
  ConceptWorkerExitError,
  parseConceptProgress,
  parseConceptResult,
  type ConceptInferenceResult,
} from "./concept-worker-protocol.js";
import type { ConceptInferenceRunner } from "./concept-search.js";
import type { OperationProgress } from "./operation-lifecycle.js";

interface Pending {
  id: string;
  count: number;
  bytes: number;
  resolve: (value: ConceptInferenceResult) => void;
  reject: (reason: unknown) => void;
  progress?: (value: OperationProgress) => void;
}

interface WorkerSession {
  controller: AbortController;
  ready: Promise<Writable>;
  finished: Promise<void>;
  pending: Pending | undefined;
  modelDirectory: string;
}

const DEFAULT_IDLE_MS = 30_000;
// Recycle after an observed high-water mark. This is not a hard native memory limit.
const RECYCLE_RSS_BYTES = 2 * 1024 * 1024 * 1024;

/** Bounded NDJSON protocol; cancellation reaps the process before queued work can enter. */
export class ConceptWorkerClient {
  readonly #queue = new OwnedTaskQueue();
  readonly #idleMs: number;
  readonly #worker: string;
  #session: WorkerSession | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #closed = false;
  #backgroundFailure: unknown;
  #lifecycle = new AbortController();

  constructor(options: { idleMs?: number; worker?: string } = {}) {
    this.#idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
    this.#worker =
      options.worker ?? fileURLToPath(new URL("./concept-worker.mjs", import.meta.url));
    if (!Number.isSafeInteger(this.#idleMs) || this.#idleMs < 1 || this.#idleMs > 300_000)
      throw new SiftLightError("Concept worker idle timeout must be 1–300000 ms");
  }

  async #start(): Promise<WorkerSession> {
    const stagingRoot = join(conceptCacheDirectory(), ".staging", randomUUID());
    await mkdir(stagingRoot, { recursive: true });
    const ready = Promise.withResolvers<Writable>();
    // Observe startup rejection even if cancellation wins before the ready await.
    void ready.promise.catch(() => undefined);
    const controller = new AbortController();
    const session: WorkerSession = {
      controller,
      ready: ready.promise,
      finished: Promise.resolve(),
      modelDirectory: conceptModelDirectory(),
      pending: undefined,
    };
    this.#session = session;
    const config = fileURLToPath(new URL("./syntax-worker.toml", import.meta.url));
    const args = process.versions.bun
      ? [
          `--config=${config}`,
          "--no-env-file",
          "--no-macros",
          "--no-install",
          this.#worker,
          "--serve",
        ]
      : [this.#worker, "--serve"];
    session.finished = (async () => {
      try {
        const result = await runOwnedProcess(
          {
            executable: process.execPath,
            args,
            cwd: dirname(this.#worker),
            env: {
              ...scriptRuntimeEnvironment(),
              SIFT_LIGHT_CONCEPT_CACHE_STAGING_DIR: stagingRoot,
            },
            interactive: true,
            signal: controller.signal,
          },
          async (stdout, stdin) => {
            if (!stdin) throw new SiftLightError("Concept worker stdin unavailable");
            ready.resolve(stdin);
            const decoder = new StringDecoder("utf8");
            let buffered = "";
            for await (const chunk of stdout) {
              const pending = session.pending;
              if (!pending) throw new SiftLightError("Unsolicited concept worker output");
              pending.bytes += chunk.byteLength;
              if (pending.bytes > MAX_CONCEPT_WORKER_OUTPUT_BYTES)
                throw new SiftLightError("Concept worker exceeded its 4 MiB response budget");
              buffered += decoder.write(Buffer.from(chunk));
              let newline = buffered.indexOf("\n");
              while (newline >= 0) {
                const line = buffered.slice(0, newline);
                buffered = buffered.slice(newline + 1);
                this.#receive(session, line);
                newline = buffered.indexOf("\n");
              }
            }
            buffered += decoder.end();
            if (buffered.trim())
              throw new SiftLightError("Incomplete concept worker response frame");
          },
        );
        if (session.pending)
          throw new ConceptWorkerExitError(result.code, "worker closed before result");
        if (result.code !== 0)
          throw new ConceptUnavailableError(
            `Concept worker exited with code ${String(result.code)}`,
          );
      } catch (error) {
        ready.reject(error);
        session.pending?.reject(error);
        // Protocol, inference and lifecycle failures are delivered to the active request.
        if (!controller.signal.aborted && !session.pending) throw error;
      } finally {
        session.pending = undefined;
        if (this.#session === session) this.#session = undefined;
        await rm(stagingRoot, { recursive: true, force: true });
      }
    })();
    // Awaited by request/close; keep an idle rejection observed until the next call.
    void session.finished.catch((error: unknown) => {
      this.#backgroundFailure = error;
    });
    return session;
  }

  #receive(session: WorkerSession, line: string): void {
    const value: unknown = JSON.parse(line);
    const pending = session.pending;
    if (!pending || !isRecordValue(value) || value.id !== pending.id)
      throw new SiftLightError("Concept worker response identity mismatch");
    if (value.type === "progress") pending.progress?.(parseConceptProgress(value));
    else if (value.type === "result") {
      const result = parseConceptResult(value, pending.count);
      session.pending = undefined;
      pending.resolve(result);
    } else if (value.type === "error") {
      throw new ConceptUnavailableError(
        typeof value.message === "string"
          ? value.message.slice(0, 512)
          : "Concept inference failed",
      );
    } else throw new SiftLightError("Invalid concept worker response type");
  }

  #clearTimer(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  async #stop(): Promise<void> {
    this.#clearTimer();
    const session = this.#session;
    if (!session) return;
    session.controller.abort();
    await session.finished;
  }

  readonly infer: ConceptInferenceRunner = async (query, passages, signal, onProgress) => {
    if (this.#closed) throw new SiftLightError("Concept worker owner is closed");
    this.#reportBackgroundFailure();
    const combined = signal
      ? AbortSignal.any([signal, this.#lifecycle.signal])
      : this.#lifecycle.signal;
    return this.#queue.run(async () => {
      this.#clearTimer();
      if (combined.aborted) throw abortError();
      if (this.#session && this.#session.modelDirectory !== conceptModelDirectory())
        await this.#stop();
      const session = this.#session ?? (await this.#start());
      const abort = () => session.controller.abort();
      combined.addEventListener("abort", abort, { once: true });
      if (combined.aborted) abort();
      try {
        const input = await session.ready;
        if (combined.aborted) throw abortError();
        const id = randomUUID();
        const body =
          JSON.stringify({
            id,
            query,
            encodedPassages: passages.map((item) => Buffer.from(item.text).toString("base64")),
          }) + "\n";
        if (Buffer.byteLength(body) > MAX_CONCEPT_WORKER_INPUT_BYTES)
          throw new SiftLightError("Concept input exceeds 64 MiB protocol budget");
        const response = Promise.withResolvers<ConceptInferenceResult>();
        void response.promise.catch(() => undefined);
        session.pending = {
          id,
          count: passages.length,
          bytes: 0,
          resolve: response.resolve,
          reject: response.reject,
          ...(onProgress ? { progress: onProgress } : {}),
        };
        await new Promise<void>((resolveWrite, rejectWrite) =>
          input.write(body, (error) => (error ? rejectWrite(error) : resolveWrite())),
        );
        const result = await response.promise;
        if (combined.aborted) throw abortError();
        if (result.peakRssBytes > RECYCLE_RSS_BYTES) await this.#stop();
        else {
          this.#timer = setTimeout(() => {
            this.#timer = undefined;
            // Queue ownership prevents expiry from killing a newly admitted request.
            void this.#queue
              .run(() => this.#stop())
              .catch((error: unknown) => {
                this.#backgroundFailure = error;
              });
          }, this.#idleMs);
          this.#timer.unref();
        }
        return result;
      } catch (error) {
        await this.#stop();
        if (combined.aborted) throw abortError();
        if (error instanceof ConceptWorkerExitError || error instanceof ConceptUnavailableError)
          throw error;
        throw new ConceptUnavailableError(
          `Local concept inference failed: ${error instanceof Error ? error.message : "unknown worker failure"}`,
          { cause: error },
        );
      } finally {
        combined.removeEventListener("abort", abort);
      }
    }, combined);
  };

  #reportBackgroundFailure(): void {
    if (this.#backgroundFailure === undefined) return;
    const failure = this.#backgroundFailure;
    this.#backgroundFailure = undefined;
    throw new ConceptUnavailableError("Concept worker background cleanup or protocol failed", {
      cause: failure,
    });
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#lifecycle.abort();
    await this.#queue.run(() => this.#stop());
    this.#reportBackgroundFailure();
  }
}

let shared: { client: ConceptWorkerClient; owners: number } | undefined;
export function acquireConceptWorker(): {
  infer: ConceptInferenceRunner;
  close: () => Promise<void>;
} {
  const current = (shared ??= { client: new ConceptWorkerClient(), owners: 0 });
  current.owners += 1;
  let closed = false;
  return {
    infer: current.client.infer,
    close: async () => {
      if (closed) return;
      closed = true;
      current.owners -= 1;
      if (current.owners === 0) {
        if (shared === current) shared = undefined;
        await current.client.close();
      }
    },
  };
}

/** Standalone API calls do not leave a resident process; service owners use the shared client. */
export const singleConceptInference: ConceptInferenceRunner = async (...args) => {
  const client = new ConceptWorkerClient();
  try {
    return await client.infer(...args);
  } finally {
    await client.close();
  }
};
