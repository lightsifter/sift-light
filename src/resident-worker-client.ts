import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import type { Writable } from "node:stream";
import type { NativeTextConfig } from "./native-text-config.js";
import { runOwnedProcess } from "./owned-process.js";
import { OwnedTaskQueue } from "./owned-task-queue.js";
import { abortError, SiftLightError } from "./errors.js";

interface Pending<Response> {
  id: string;
  bytes: number;
  resolve: (result: Response) => void;
  reject: (error: unknown) => void;
}
interface Session<Response> {
  controller: AbortController;
  ready: Promise<Writable>;
  finished: Promise<void>;
  pending: Pending<Response> | undefined;
  failure: unknown;
}
export interface ResidentProtocol<Response extends { id: string }> {
  parse: (value: unknown) => Response;
  maxResponseBytes: number;
}

/** One resident model per service. Cancelled work is reaped before reuse or restart. */
export class ResidentWorkerClient<Response extends { id: string }> {
  readonly #protocol: ResidentProtocol<Response>;
  readonly #queue = new OwnedTaskQueue();
  readonly #lifecycle = new AbortController();
  readonly #config: NativeTextConfig;
  readonly #root: string;
  readonly #corpus: string;
  readonly #index: string;
  readonly #idleMs: number;
  #session: Session<Response> | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #backgroundFailure: unknown;
  #closed = false;

  constructor(
    config: NativeTextConfig,
    root: string,
    corpus: string,
    index: string,
    protocol: ResidentProtocol<Response>,
    idleMs = 60_000,
  ) {
    if (!Number.isSafeInteger(idleMs) || idleMs < 1 || idleMs > 300_000)
      throw new SiftLightError("Native text idle timeout must be 1–300000 ms");
    this.#protocol = protocol;
    this.#config = config;
    this.#root = root;
    this.#corpus = corpus;
    this.#index = index;
    this.#idleMs = idleMs;
  }

  async #start(): Promise<Session<Response>> {
    const ready = Promise.withResolvers<Writable>();
    void ready.promise.catch(() => undefined);
    const session: Session<Response> = {
      controller: new AbortController(),
      ready: ready.promise,
      finished: Promise.resolve(),
      pending: undefined,
      failure: undefined,
    };
    this.#session = session;
    let exposed = false;
    session.finished = (async () => {
      try {
        const result = await runOwnedProcess(
          {
            executable: this.#config.executable,
            args: [this.#config.modelDirectory, this.#corpus, this.#index, "--serve"],
            cwd: this.#root,
            interactive: true,
            signal: session.controller.signal,
          },
          async (stdout, stdin) => {
            if (!stdin) throw new SiftLightError("Native text stdin unavailable");
            exposed = true;
            ready.resolve(stdin);
            const decoder = new StringDecoder("utf8");
            let buffered = "";
            for await (const chunk of stdout) {
              const pending = session.pending;
              if (!pending) throw new SiftLightError("Unsolicited native text output");
              pending.bytes += chunk.byteLength;
              if (pending.bytes > this.#protocol.maxResponseBytes)
                throw new SiftLightError("Native text response exceeded its protocol budget");
              buffered += decoder.write(Buffer.from(chunk));
              let newline = buffered.indexOf("\n");
              while (newline >= 0) {
                const frame = buffered.slice(0, newline);
                buffered = buffered.slice(newline + 1);
                const response = this.#protocol.parse(JSON.parse(frame));
                if (!session.pending || response.id !== session.pending.id)
                  throw new SiftLightError("Native text response identity mismatch");
                session.pending.resolve(response);
                session.pending = undefined;
                newline = buffered.indexOf("\n");
              }
            }
            buffered += decoder.end();
            if (buffered.trim()) throw new SiftLightError("Incomplete native text response frame");
          },
        );
        if (session.pending || result.code !== 0)
          throw new SiftLightError(
            `Native text worker closed (exit ${String(result.code)}): ${result.stderr}`,
          );
      } catch (error) {
        session.failure = error;
        ready.reject(error);
        session.pending?.reject(error);
        if (exposed && !session.controller.signal.aborted && !session.pending) throw error;
      } finally {
        session.pending = undefined;
        if (this.#session === session) this.#session = undefined;
      }
    })();
    void session.finished.catch((error: unknown) => {
      this.#backgroundFailure = error;
    });
    return session;
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
  #reportBackgroundFailure(): void {
    if (this.#backgroundFailure === undefined) return;
    const error = this.#backgroundFailure;
    this.#backgroundFailure = undefined;
    throw new SiftLightError("Native text background process or cleanup failed", { cause: error });
  }

  async search(request: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    if (this.#closed) throw new SiftLightError("Native text worker owner is closed");
    this.#reportBackgroundFailure();
    const combined = signal
      ? AbortSignal.any([signal, this.#lifecycle.signal])
      : this.#lifecycle.signal;
    return this.#queue.run(async () => {
      this.#clearTimer();
      if (combined.aborted) throw abortError();
      const session = this.#session ?? (await this.#start());
      const abort = () => session.controller.abort();
      combined.addEventListener("abort", abort, { once: true });
      if (combined.aborted) abort();
      try {
        const stdin = await session.ready;
        if (combined.aborted) throw abortError();
        const response = Promise.withResolvers<Response>();
        void response.promise.catch(() => undefined);
        const id = randomUUID();
        session.pending = { id, bytes: 0, resolve: response.resolve, reject: response.reject };
        const body = JSON.stringify({ ...request, id }) + "\n";
        if (Buffer.byteLength(body) > 4096)
          throw new SiftLightError("Native text request exceeded its protocol budget");
        await new Promise<void>((done, reject) =>
          stdin.write(body, (error) => (error ? reject(error) : done())),
        );
        const result = await response.promise;
        if (combined.aborted) throw abortError();
        this.#timer = setTimeout(() => {
          this.#timer = undefined;
          void this.#queue
            .run(() => this.#stop())
            .catch((error: unknown) => {
              this.#backgroundFailure = error;
            });
        }, this.#idleMs);
        this.#timer.unref();
        return result;
      } catch (error) {
        await this.#stop();
        if (combined.aborted) throw abortError();
        throw session.failure ?? error;
      } finally {
        combined.removeEventListener("abort", abort);
      }
    }, combined);
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#lifecycle.abort();
    await this.#queue.run(() => this.#stop());
    this.#reportBackgroundFailure();
  }
}
