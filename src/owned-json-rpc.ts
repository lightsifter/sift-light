import type { Writable } from "node:stream";
import { abortError, SignalGrepError } from "./errors.js";
import { runOwnedProcess } from "./owned-process.js";

const MAX_RPC_FRAME_BYTES = 16 * 1024 * 1024;
const MAX_RPC_TOTAL_BYTES = 64 * 1024 * 1024;

export function rpcRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

/** Only framing and request ownership live here; language semantics belong to the caller. */
export class JsonRpcChannel {
  readonly #stdin: Writable;
  readonly #pending = new Map<number, PendingRequest>();
  readonly #onRequest: (method: string, params: unknown) => unknown;
  #nextId = 0;
  #closed = false;
  #inputEnded = false;
  constructor(stdin: Writable, onRequest: (method: string, params: unknown) => unknown) {
    this.#stdin = stdin;
    this.#onRequest = onRequest;
  }

  async #send(message: unknown): Promise<void> {
    if (this.#closed) throw new SignalGrepError("Language-service connection closed");
    const body = Buffer.from(JSON.stringify(message));
    if (body.length > MAX_RPC_FRAME_BYTES)
      throw new SignalGrepError("Language-service request exceeds the frame budget");
    const frame = Buffer.concat([
      Buffer.from(`Content-Length: ${String(body.length)}\r\n\r\n`),
      body,
    ]);
    await new Promise<void>((resolve, reject) => {
      this.#stdin.write(frame, (error?: Error | null) => (error ? reject(error) : resolve()));
    });
  }

  async request(method: string, params: unknown): Promise<unknown> {
    if (this.#pending.size >= 32)
      throw new SignalGrepError("Language-service request concurrency exceeded");
    const id = ++this.#nextId;
    const deferred = Promise.withResolvers<unknown>();
    this.#pending.set(id, deferred);
    try {
      const [, response] = await Promise.all([
        this.#send({ jsonrpc: "2.0", id, method, params }),
        deferred.promise,
      ]);
      return response;
    } finally {
      this.#pending.delete(id);
    }
  }

  notify(method: string, params?: unknown): Promise<void> {
    return this.#send({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) });
  }

  async accept(value: unknown): Promise<void> {
    if (!rpcRecord(value) || value.jsonrpc !== "2.0")
      throw new SignalGrepError("Invalid language-service JSON-RPC message");
    if (typeof value.method === "string") {
      // After acknowledged shutdown + EOF, late server registrations cannot affect a result.
      if (this.#inputEnded) return;
      if (value.id === undefined) return;
      if (typeof value.id !== "number" && typeof value.id !== "string")
        throw new SignalGrepError("Invalid language-service request id");
      const result = this.#onRequest(value.method, value.params);
      await this.#send({ jsonrpc: "2.0", id: value.id, result });
      return;
    }
    if (typeof value.id !== "number")
      throw new SignalGrepError("Invalid language-service response id");
    const pending = this.#pending.get(value.id);
    if (!pending) throw new SignalGrepError("Unexpected language-service response id");
    if (value.error !== undefined) {
      if (!rpcRecord(value.error) || typeof value.error.message !== "string")
        throw new SignalGrepError("Invalid language-service error");
      pending.reject(new SignalGrepError(`Language service: ${value.error.message}`));
    } else if ("result" in value) pending.resolve(value.result);
    else throw new SignalGrepError("Language-service response omitted its result");
  }

  endInput(): void {
    if (this.#inputEnded) return;
    if (this.#pending.size) throw new Error("Cannot end JSON-RPC input with pending requests");
    this.#inputEnded = true;
    this.#stdin.end();
  }

  close(): void {
    this.#closed = true;
    for (const pending of this.#pending.values())
      pending.reject(new SignalGrepError("Language service closed before responding"));
    this.#pending.clear();
  }
}

export interface OwnedJsonRpcSession {
  readonly channel: JsonRpcChannel;
  /** Resolves after the owned process and protocol reader have closed. */
  readonly completion: Promise<{ code: number | null; stderr: string }>;
  /** Terminates the owned process; callers must await completion afterward. */
  abort(): void;
}

async function readMessages(
  stdout: AsyncIterable<Uint8Array>,
  channel: JsonRpcChannel,
): Promise<void> {
  let buffered = Buffer.alloc(0);
  let total = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for await (const chunk of stdout) {
      total += chunk.byteLength;
      if (total > MAX_RPC_TOTAL_BYTES)
        throw new SignalGrepError("Language-service output exceeds the 64 MiB protocol budget");
      buffered = Buffer.concat([buffered, chunk]);
      while (buffered.length) {
        const boundary = buffered.indexOf("\r\n\r\n");
        if (boundary < 0) {
          if (buffered.length > 8_192)
            throw new SignalGrepError("Language-service header exceeds the framing budget");
          break;
        }
        if (boundary > 8_192)
          throw new SignalGrepError("Language-service header exceeds the framing budget");
        const headers = buffered.subarray(0, boundary).toString("ascii");
        const fields = [...headers.matchAll(/^Content-Length:\s*(\d+)\s*$/gim)];
        if (fields.length !== 1) throw new SignalGrepError("Invalid language-service frame header");
        const length = Number(fields[0]?.[1]);
        if (!Number.isSafeInteger(length) || length < 0 || length > MAX_RPC_FRAME_BYTES)
          throw new SignalGrepError("Language-service frame exceeds the 16 MiB limit");
        const end = boundary + 4 + length;
        if (buffered.length < end) break;
        const value: unknown = JSON.parse(decoder.decode(buffered.subarray(boundary + 4, end)));
        buffered = buffered.subarray(end);
        // oxlint-disable-next-line no-await-in-loop -- server requests and responses preserve wire order.
        await channel.accept(value);
      }
    }
    if (buffered.length)
      throw new SignalGrepError("Language service closed with an incomplete frame");
  } finally {
    channel.close();
  }
}

/**
 * Start one interactive JSON-RPC process and keep it alive for a caller-owned
 * analysis view. The caller must perform the protocol shutdown and then call
 * `channel.endInput()`; process cleanup remains owned by this helper.
 */
export async function openOwnedJsonRpc(
  options: {
    executable: string;
    args: string[];
    cwd: string;
    signal: AbortSignal;
    env?: NodeJS.ProcessEnv;
  },
  onRequest: (method: string, params: unknown) => unknown,
): Promise<OwnedJsonRpcSession> {
  const ready = Promise.withResolvers<JsonRpcChannel>();
  const termination = new AbortController();
  let settled = false;
  const signal = AbortSignal.any([options.signal, termination.signal]);
  const completion = runOwnedProcess(
    { ...options, signal, interactive: true },
    async (stdout, stdin) => {
      if (!stdin) {
        const error = new SignalGrepError("Missing interactive language-service stdin");
        if (!settled) ready.reject(error);
        throw error;
      }
      const channel = new JsonRpcChannel(stdin, onRequest);
      if (!settled) {
        settled = true;
        ready.resolve(channel);
      }
      await readMessages(stdout, channel);
    },
  );
  // A process that fails before emitting a channel must reject the open call,
  // while later failures remain observable through completion.
  void completion.catch((error: unknown) => {
    if (!settled) {
      settled = true;
      ready.reject(error);
    }
  });
  let channel: JsonRpcChannel;
  try {
    channel = await ready.promise;
  } catch (error) {
    await completion.catch(() => undefined);
    throw error;
  }
  return { channel, completion, abort: () => termination.abort() };
}

export async function runOwnedJsonRpc<T>(
  options: {
    executable: string;
    args: string[];
    cwd: string;
    signal: AbortSignal;
    env?: NodeJS.ProcessEnv;
  },
  operation: (channel: JsonRpcChannel) => Promise<T>,
  onRequest: (method: string, params: unknown) => unknown,
): Promise<T> {
  const session = await openOwnedJsonRpc(options, onRequest);
  try {
    const value = await operation(session.channel);
    session.channel.endInput();
    const result = await session.completion;
    if (result.code !== 0)
      throw new SignalGrepError(
        `Language-service process failed (${String(result.code)}): ${result.stderr}`,
      );
    return value;
  } catch (error) {
    session.channel.close();
    session.abort();
    const completionFailure = await session.completion.catch(
      (completionError: unknown) => completionError,
    );
    if (options.signal.aborted) throw abortError();
    if (completionFailure instanceof Error && completionFailure.name !== "AbortError")
      throw completionFailure;
    throw error;
  }
}
