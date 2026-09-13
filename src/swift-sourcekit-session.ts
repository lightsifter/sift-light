import { resolve } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import { openOwnedJsonRpc, rpcRecord, type JsonRpcChannel } from "./owned-json-rpc.js";
import type { SourceDocument } from "./source-document.js";
import type { RelationshipOperation, RelationshipSourceScope } from "./relationship-types.js";
import {
  type SwiftRuntimeCapabilities,
  type SwiftWorkspaceConfiguration,
  executablePath,
  isIndexBacked,
  readCapabilities,
  sourceKitRequestCapabilities,
  sourceUri,
} from "./swift-sourcekit-protocol.js";

/** Owns one lazy SourceKit-LSP process and its index barrier. */
export class SwiftSourceKitSession {
  readonly #cwd: string;
  readonly #scope: RelationshipSourceScope;
  readonly #signal: AbortSignal;
  readonly #workspaceConfiguration: SwiftWorkspaceConfiguration;
  #channel: JsonRpcChannel | undefined;
  #completion: Promise<{ code: number | null; stderr: string }> | undefined;
  #abortProcess: (() => void) | undefined;
  #runtimeCapabilities: SwiftRuntimeCapabilities | undefined;
  #openedUris = new Set<string>();
  #backgroundIndexingEnabled = false;
  #indexSynchronized = false;
  #closed = false;

  constructor(options: {
    cwd: string;
    scope: RelationshipSourceScope;
    signal: AbortSignal;
    workspaceConfiguration: SwiftWorkspaceConfiguration;
  }) {
    this.#cwd = options.cwd;
    this.#scope = options.scope;
    this.#signal = options.signal;
    this.#workspaceConfiguration = options.workspaceConfiguration;
  }

  async channel(indexRequired = false): Promise<JsonRpcChannel> {
    return this.#ensureClient(indexRequired);
  }

  async requireOperationCapability(operation: RelationshipOperation): Promise<void> {
    const capabilities =
      this.#runtimeCapabilities ??
      (await this.#ensureClient(isIndexBacked(operation)), this.#runtimeCapabilities);
    if (!capabilities?.advertised.includes(operation))
      throw new SignalGrepError("SourceKit-LSP did not advertise Swift operation: " + operation);
  }

  async requireOutlineCapability(): Promise<void> {
    const capabilities =
      this.#runtimeCapabilities ?? (await this.#ensureClient(), this.#runtimeCapabilities);
    if (!capabilities?.outline)
      throw new SignalGrepError("SourceKit-LSP did not advertise documentSymbolProvider");
  }

  async openDocument(document: SourceDocument, indexRequired = false): Promise<void> {
    const channel = await this.#ensureClient(indexRequired);
    const uri = sourceUri(this.#cwd, document.path);
    if (this.#openedUris.has(uri)) return;
    await channel.notify("textDocument/didOpen", {
      textDocument: { uri, languageId: "swift", version: 1, text: document.text },
    });
    // Keep the in-memory SourceDocument authoritative when background indexing
    // is disabled and the worktree has changed since the previous index store.
    await channel.notify("textDocument/didChange", {
      textDocument: { uri, version: 2 },
      contentChanges: [{ text: document.text }],
    });
    this.#openedUris.add(uri);
  }

  async synchronizeIndex(documents: Iterable<SourceDocument>): Promise<void> {
    if (this.#indexSynchronized) return;
    const channel = await this.#ensureClient(true);
    for (const document of documents) {
      // oxlint-disable-next-line no-await-in-loop -- ordered admission makes index evidence deterministic.
      await this.openDocument(document, true);
    }
    try {
      await channel.request("sourcekit/workspace/triggerReindex", {});
    } catch (error) {
      if (!(error instanceof SignalGrepError) || !/method not found/iu.test(error.message))
        throw error;
      // Swift 6.3.3 accepts the documented legacy spelling as well.
      await channel.request("workspace/triggerReindex", {});
    }
    try {
      await channel.request("sourcekit/workspace/synchronize", { index: true });
    } catch (error) {
      if (!(error instanceof SignalGrepError) || !/method not found/iu.test(error.message))
        throw error;
      // Swift 6.3.3 accepts this official compatibility spelling.
      await channel.request("workspace/synchronize", { index: true });
    }
    this.#indexSynchronized = true;
    if (this.#runtimeCapabilities) this.#runtimeCapabilities.indexBarrier = "verified";
  }

  invalidateIndex(): void {
    this.#indexSynchronized = false;
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    try {
      if (this.#channel && this.#completion) await this.#gracefulClose();
    } catch (error) {
      await this.#stopClient();
      if (this.#signal.aborted) throw abortError();
      throw error;
    }
  }

  async #ensureClient(indexRequired = false): Promise<JsonRpcChannel> {
    if (this.#closed) throw new SignalGrepError("Swift SourceKit-LSP session is closed");
    if (this.#channel && indexRequired && !this.#backgroundIndexingEnabled)
      await this.#restartClientForIndex();
    if (this.#channel) return this.#channel;
    const executable = executablePath();
    let owned: Awaited<ReturnType<typeof openOwnedJsonRpc>> | undefined;
    try {
      owned = await openOwnedJsonRpc(
        {
          executable,
          args: [],
          cwd: resolve(this.#cwd, this.#scope.root),
          signal: this.#signal,
          env: process.env,
        },
        (method, params) => this.clientRequest(method, params),
      );
      const initialize = await owned.channel.request("initialize", {
        processId: process.pid,
        rootUri: sourceUri(this.#cwd, this.#scope.root),
        workspaceFolders: [
          {
            uri: sourceUri(this.#cwd, this.#scope.root),
            name: this.#scope.root,
          },
        ],
        capabilities: sourceKitRequestCapabilities(),
        initializationOptions: {
          ...this.#workspaceConfiguration.initializationOptions,
          backgroundIndexing: indexRequired,
        },
      });
      this.#runtimeCapabilities = readCapabilities(initialize);
      await owned.channel.notify("initialized", {});
      this.#channel = owned.channel;
      this.#completion = owned.completion;
      this.#abortProcess = () => owned?.abort();
      this.#backgroundIndexingEnabled = indexRequired;
      return owned.channel;
    } catch (error) {
      owned?.abort();
      await owned?.completion.catch(() => undefined);
      if (this.#signal.aborted) throw abortError();
      throw error;
    }
  }

  async #restartClientForIndex(): Promise<void> {
    await this.#stopClient();
    this.#runtimeCapabilities = undefined;
    this.#openedUris.clear();
    this.#indexSynchronized = false;
  }

  async #stopClient(): Promise<void> {
    const channel = this.#channel;
    const completion = this.#completion;
    const abortProcess = this.#abortProcess;
    this.#channel = undefined;
    this.#completion = undefined;
    this.#abortProcess = undefined;
    if (!channel) return;
    channel.close();
    abortProcess?.();
    await completion?.catch(() => undefined);
  }

  async #gracefulClose(): Promise<void> {
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
      await Promise.race([channel.request("shutdown", {}), aborted]);
      await Promise.race([channel.notify("exit", {}), aborted]);
      channel.endInput();
      const result = await Promise.race([completion, aborted]);
      if (result.code !== 0)
        throw new SignalGrepError(
          "SourceKit-LSP process failed (" + String(result.code) + "): " + result.stderr,
        );
    } finally {
      if (onAbort) this.#signal.removeEventListener("abort", onAbort);
    }
  }

  private clientRequest(method: string, params: unknown): unknown {
    if (method === "workspace/configuration") {
      if (!rpcRecord(params) || !Array.isArray(params.items))
        throw new SignalGrepError("Invalid SourceKit-LSP workspace/configuration request");
      return params.items.map(() => ({}));
    }
    if (method === "workspace/workspaceFolders")
      return [{ uri: sourceUri(this.#cwd, this.#scope.root), name: this.#scope.root }];
    if (
      method === "client/registerCapability" ||
      method === "client/unregisterCapability" ||
      method === "window/workDoneProgress/create"
    )
      return null;
    if (method === "workspace/applyEdit")
      return { applied: false, failureReason: "Swift relationship provider is read-only" };
    throw new SignalGrepError("Unsupported SourceKit-LSP client request: " + method);
  }
}
