import { abortError, SignalGrepError } from "./errors.js";
import { openOwnedJsonRpc, rpcRecord, type JsonRpcChannel } from "./owned-json-rpc.js";
import { semanticUri } from "./semantic-sources.js";
import type { SourceDocument } from "./source-document.js";
import type { PythonLanguageServerCommand } from "./python-language-discovery.js";
import type { PythonSourceContext } from "./python-source-context.js";

export type PythonLspOperation =
  | "definitions"
  | "references"
  | "implementations"
  | "callers"
  | "callees";

export const PYTHON_LSP_REQUEST_TIMEOUT_MS = 60_000;

export interface PythonLspCapabilities {
  readonly operations: ReadonlySet<PythonLspOperation>;
  readonly documentSymbols: boolean;
}

function advertised(value: unknown): boolean {
  return value === true || (value !== null && typeof value === "object");
}

function readCapabilities(value: unknown): PythonLspCapabilities {
  if (!rpcRecord(value) || !rpcRecord(value.capabilities))
    throw new SignalGrepError("Pyright initialize omitted capabilities");
  const capabilities = value.capabilities;
  const operations = new Set<PythonLspOperation>();
  if (advertised(capabilities.definitionProvider)) operations.add("definitions");
  if (advertised(capabilities.referencesProvider)) operations.add("references");
  if (advertised(capabilities.implementationProvider)) operations.add("implementations");
  if (advertised(capabilities.callHierarchyProvider)) {
    operations.add("callers");
    operations.add("callees");
  }
  return {
    operations,
    documentSymbols: advertised(capabilities.documentSymbolProvider),
  };
}

function clientRequest(cwd: string, rootUri: string, method: string, params: unknown): unknown {
  if (method === "workspace/configuration") {
    if (!rpcRecord(params) || !Array.isArray(params.items))
      throw new SignalGrepError("Invalid Pyright workspace/configuration request");
    return params.items.map(() => null);
  }
  if (method === "workspace/workspaceFolders") return [{ uri: rootUri, name: cwd }];
  if (
    method === "client/registerCapability" ||
    method === "client/unregisterCapability" ||
    method === "window/workDoneProgress/create" ||
    method === "window/showMessageRequest"
  )
    return null;
  if (
    method === "window/logMessage" ||
    method === "window/showMessage" ||
    method === "telemetry/event"
  )
    return null;
  if (method === "workspace/applyEdit")
    return { applied: false, failureReason: "Python relationship search is read-only" };
  throw new SignalGrepError(`Unsupported Pyright client request: ${method}`);
}

/** Owns one lazily started Pyright LSP process and its protocol lifecycle. */
export class PythonLspSession {
  readonly #context: PythonSourceContext;
  readonly #command: PythonLanguageServerCommand;
  readonly #signal: AbortSignal;
  #channel: JsonRpcChannel | undefined;
  #completion: Promise<{ code: number | null; stderr: string }> | undefined;
  #abortProcess: (() => void) | undefined;
  #capabilities: PythonLspCapabilities | undefined;
  #closed = false;
  #closePromise: Promise<void> | undefined;

  constructor(context: PythonSourceContext) {
    this.#context = context;
    this.#command = context.command;
    this.#signal = context.signal;
  }

  get capabilities(): PythonLspCapabilities {
    if (!this.#capabilities) throw new SignalGrepError("Pyright session is not initialized");
    return this.#capabilities;
  }

  get channel(): JsonRpcChannel {
    if (!this.#channel) throw new SignalGrepError("Pyright session is not initialized");
    return this.#channel;
  }

  /** Every request has a bounded wait; a timeout is surfaced and the view closes the owned process. */
  async request(method: string, params: unknown): Promise<unknown> {
    const channel = this.channel;
    const deadline = AbortSignal.timeout(PYTHON_LSP_REQUEST_TIMEOUT_MS);
    let onAbort: (() => void) | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      onAbort = () => reject(abortError());
      if (deadline.aborted) onAbort();
      else deadline.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return await Promise.race([channel.request(method, params), timedOut]);
    } catch (error) {
      if (deadline.aborted || this.#signal.aborted) {
        this.#closed = true;
        channel.close();
        this.#abortProcess?.();
        await this.#completion?.catch(() => undefined);
        throw abortError();
      }
      throw error;
    } finally {
      if (onAbort) deadline.removeEventListener("abort", onAbort);
    }
  }

  async start(): Promise<PythonLspCapabilities> {
    if (this.#closed) throw new SignalGrepError("Pyright session is closed");
    if (this.#channel && this.#capabilities) return this.#capabilities;
    const rootUri = await semanticUri(this.#context.cwd, this.#context.root);
    let owned: Awaited<ReturnType<typeof openOwnedJsonRpc>> | undefined;
    try {
      owned = await openOwnedJsonRpc(
        {
          executable: this.#command.executable,
          args: [...this.#command.args],
          cwd: this.#context.root,
          signal: this.#signal,
          env: this.#command.environment,
        },
        (method, params) => clientRequest(this.#context.cwd, rootUri, method, params),
      );
      this.#channel = owned.channel;
      this.#completion = owned.completion;
      this.#abortProcess = () => owned?.abort();
      const initialize = await this.request("initialize", {
        processId: process.pid,
        rootUri,
        workspaceFolders: [{ uri: rootUri, name: this.#context.root }],
        capabilities: {
          workspace: { workspaceFolders: true, configuration: true },
          textDocument: {
            definition: { linkSupport: true },
            references: {},
            implementation: { linkSupport: true },
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
            callHierarchy: {},
          },
          general: { positionEncodings: ["utf-16"] },
        },
        initializationOptions: {},
      });
      const capabilities = readCapabilities(initialize);
      await owned.channel.notify("initialized", {});
      this.#capabilities = capabilities;
      return capabilities;
    } catch (error) {
      owned?.channel.close();
      owned?.abort();
      await owned?.completion.catch(() => undefined);
      this.#channel = undefined;
      this.#completion = undefined;
      this.#abortProcess = undefined;
      if (this.#signal.aborted) throw abortError();
      throw error;
    }
  }

  async openDocuments(documents: readonly SourceDocument[]): Promise<void> {
    await this.start();
    for (const document of documents) {
      if (this.#signal.aborted) throw abortError();
      // Ordered didOpen notifications keep Pyright's in-memory source snapshot deterministic.
      // oxlint-disable-next-line no-await-in-loop -- protocol order is part of document admission.
      await this.channel.notify("textDocument/didOpen", {
        textDocument: {
          // oxlint-disable-next-line no-await-in-loop -- URI resolution stays ordered with didOpen.
          uri: await semanticUri(this.#context.cwd, document.path),
          languageId: "python",
          version: 1,
          text: document.text,
        },
      });
    }
  }

  async close(): Promise<void> {
    if (!this.#closePromise) this.#closePromise = this.closeOnce();
    return this.#closePromise;
  }

  private async closeOnce(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const channel = this.#channel;
    const completion = this.#completion;
    if (!channel || !completion) return;
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(abortError());
      if (this.#signal.aborted) onAbort();
      else this.#signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      await Promise.race([this.request("shutdown", {}), aborted]);
      await Promise.race([channel.notify("exit", {}), aborted]);
      channel.endInput();
      const result = await Promise.race([completion, aborted]);
      if (result.code !== 0)
        throw new SignalGrepError(
          `Pyright language-server process failed (${String(result.code)}): ${result.stderr}`,
        );
    } catch (error) {
      channel.close();
      this.#abortProcess?.();
      await completion.catch(() => undefined);
      if (this.#signal.aborted) throw abortError();
      throw error;
    } finally {
      if (onAbort) this.#signal.removeEventListener("abort", onAbort);
    }
  }
}
