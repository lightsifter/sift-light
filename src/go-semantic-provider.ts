import { createHash, randomUUID } from "node:crypto";
import { delimiter, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { abortError, SignalGrepError } from "./errors.js";
import { openOwnedJsonRpc, rpcRecord, type JsonRpcChannel } from "./owned-json-rpc.js";
import { OwnedTaskQueue } from "./owned-task-queue.js";
import { semanticUri } from "./semantic-sources.js";
import {
  byteRange,
  lspPosition,
  lspRange,
  type LspPosition,
  type LspRange,
} from "./semantic-protocol.js";
import type { SourceDocument } from "./source-document.js";
import { listWorkspaceFiles } from "./workspace-files.js";
import type {
  RelationshipDependency,
  RelationshipEdge,
  RelationshipEvidence,
  RelationshipExpansion,
  RelationshipNode,
  RelationshipOperation,
  RelationshipProvider,
  RelationshipProviderOptions,
  RelationshipRecheck,
  RelationshipResolution,
  RelationshipSourceLocation,
  RelationshipSourceStatus,
  RelationshipUnresolved,
  RelationshipView,
} from "./relationship-types.js";

/** gopls is an external, optional provider. It is never installed by this package. */
export const GO_SEMANTIC_QUERY_TIMEOUT_MS = 20_000;
export const GO_SEMANTIC_PROVIDER_ID = "gopls";

type GoNode = {
  id: string;
  path: string;
  uri: string;
  range: LspRange;
  selectionRange: LspRange;
  name?: string;
  kind?: number;
};
type GoEdge = {
  operation: RelationshipOperation;
  from: GoNode;
  to: GoNode;
  callRanges?: LspRange[];
};

const goSource = /\.go$/i;
const goManifest = /(?:^|\/)(?:go\.mod|go\.work|go\.sum)$/i;
const goTextDocument = /(?:\.go|(?:^|\/)(?:go\.mod|go\.work))$/i;
const GO_ENVIRONMENT_PATH = "go:environment";
const GO_INVENTORY_PATH = "go:inventory";
const GO_ENVIRONMENT_KEYS = [
  "GO111MODULE",
  "GOOS",
  "GOARCH",
  "GOARM",
  "GO386",
  "GOEXPERIMENT",
  "CGO_ENABLED",
  "GOFLAGS",
  "GOMOD",
  "GOWORK",
  "GOWASM",
  "GOMODCACHE",
  "GOPRIVATE",
  "GONOPROXY",
  "GONOSUMDB",
  "PATH",
] as const;
const providerQueue = new OwnedTaskQueue();

function executablePath(): string {
  const configured = process.env.BAOER_SIGNAL_GREP_GOPLS_PATH?.trim();
  if (!configured) return "gopls";
  if (!isAbsolute(configured))
    throw new SignalGrepError("BAOER_SIGNAL_GREP_GOPLS_PATH must be an absolute executable path");
  return configured;
}

function environment(executable: string): NodeJS.ProcessEnv {
  const path = process.env.PATH ?? "";
  const executableDirectory = isAbsolute(executable) ? dirname(executable) : undefined;
  const configuredFlags = process.env.GOFLAGS?.trim() ?? "";
  const modFlag = configuredFlags.match(/(?:^|\s)-mod=(\S+)/)?.[1];
  if (modFlag !== undefined && modFlag !== "readonly")
    throw new SignalGrepError(
      `GOFLAGS requests -mod=${modFlag}; Go relationship search requires -mod=readonly`,
    );
  return {
    ...process.env,
    ...(executableDirectory ? { PATH: `${executableDirectory}${delimiter}${path}` } : {}),
    // Search must fail clearly when dependencies are unavailable; it must not download them.
    GOTOOLCHAIN: "local",
    GOPROXY: "off",
    GOSUMDB: "off",
    GOFLAGS: configuredFlags ? `${configuredFlags} -mod=readonly` : "-mod=readonly",
  };
}

function configurationFingerprint(executable: string): string {
  const values: Record<string, string> = {
    executable,
    GOTOOLCHAIN: "local",
    GOPROXY: "off",
    GOSUMDB: "off",
  };
  for (const key of GO_ENVIRONMENT_KEYS) values[key] = process.env[key] ?? "";
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

function isAdmittedGoFile(path: string): boolean {
  return goSource.test(path) || goManifest.test(path);
}

function documentRole(path: string): "source" | "manifest" {
  return goManifest.test(path) ? "manifest" : "source";
}

function languageId(path: string): "go" | "go.mod" {
  return goSource.test(path) ? "go" : "go.mod";
}

function fileUri(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("file:"))
    throw new SignalGrepError("gopls returned a non-file URI");
  return value;
}

function uriPath(uri: string): string {
  try {
    return fileURLToPath(uri);
  } catch (error) {
    throw new SignalGrepError("gopls returned an invalid file URI", { cause: error });
  }
}

function readNode(value: unknown): GoNode {
  if (!rpcRecord(value)) throw new SignalGrepError("gopls returned an invalid navigation item");
  const record = value;
  const uri = fileUri(record.uri ?? record.targetUri);
  const range = lspRange(record.range ?? record.targetRange ?? record.selectionRange);
  const selectionRange = lspRange(record.selectionRange ?? record.targetSelectionRange ?? range);
  return {
    id: `${uri}:${String(selectionRange.start.line)}:${String(selectionRange.start.character)}:${String(selectionRange.end.line)}:${String(selectionRange.end.character)}`,
    path: uriPath(uri),
    uri,
    range,
    selectionRange,
    ...(typeof record.name === "string" && record.name.length > 0 ? { name: record.name } : {}),
    ...(typeof record.kind === "number" && Number.isSafeInteger(record.kind)
      ? { kind: record.kind }
      : {}),
  };
}

function readLocations(value: unknown): GoNode[] {
  if (value === null) return [];
  return (Array.isArray(value) ? value : [value]).map((item) => readNode(item));
}

function readCallRanges(value: unknown): LspRange[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((range) => lspRange(range));
}

function positionOf(node: GoNode): LspPosition {
  return node.selectionRange.start;
}

function sourceLocation(document: SourceDocument, range: LspRange): RelationshipSourceLocation {
  return {
    path: document.path,
    range: byteRange(document, range),
    start: { line: range.start.line + 1, column: range.start.character + 1 },
    end: { line: range.end.line + 1, column: range.end.character + 1 },
    source: document.reference,
  };
}

function symbolPosition(
  document: SourceDocument,
  value: Record<string, unknown>,
  name: string,
): LspPosition | undefined {
  if (value.selectionRange !== undefined) return lspRange(value.selectionRange).start;
  const location = rpcRecord(value.location) ? value.location : undefined;
  if (!location || location.range === undefined) return undefined;
  const range = lspRange(location.range);
  const bytes = byteRange(document, range);
  const offset = document.slice(bytes).indexOf(name);
  if (offset < 0) return undefined;
  return lspPosition(document, document.toCharacterOffset(bytes.start) + offset);
}

function documentDependency(document: SourceDocument): RelationshipDependency {
  return {
    path: document.path,
    role: documentRole(document.path),
    reference: document.reference,
    exists: true,
  };
}

function environmentDependency(fingerprint: string): RelationshipDependency {
  return { path: GO_ENVIRONMENT_PATH, role: "config", fingerprint, exists: true };
}

function evidence(reason: string): RelationshipEvidence {
  return { reason, level: "compiler", basis: "semantic", providerBasis: GO_SEMANTIC_PROVIDER_ID };
}

function operationMethod(operation: RelationshipOperation): string {
  switch (operation) {
    case "definitions":
      return "textDocument/definition";
    case "references":
      return "textDocument/references";
    case "implementations":
      return "textDocument/implementation";
    case "callers":
    case "callees":
      return "textDocument/prepareCallHierarchy";
    default:
      throw new SignalGrepError("Unsupported Go relationship operation");
  }
}

function relationReason(operation: RelationshipOperation): string {
  if (operation === "callers" || operation === "callees")
    return "gopls static call hierarchy; dynamic calls are excluded and runtime dispatch is unproven";
  return "gopls compiler-bound navigation in the active Go build configuration";
}

function operationUnresolved(
  operation: RelationshipOperation,
  reason: string,
): RelationshipUnresolved {
  return { operation, reason, confidence: "unknown" };
}

class GoRelationshipView implements RelationshipView {
  readonly providerId = GO_SEMANTIC_PROVIDER_ID;
  readonly analysisViewId: string;
  readonly sourceScope: RelationshipProviderOptions["scope"];
  readonly #channel: JsonRpcChannel;
  readonly #completion: Promise<{ code: number | null; stderr: string }>;
  readonly #cwd: string;
  readonly #source: RelationshipProviderOptions["source"];
  readonly #signal: AbortSignal;
  readonly #configurationFingerprint: string;
  readonly #inventory: ReadonlySet<string>;
  readonly #documents: Map<string, SourceDocument>;
  readonly #openReasons: string[];
  readonly #initialCoveragePartial: boolean;
  readonly #nodePaths = new Map<string, string>();
  readonly #edgePaths = new Map<string, Set<string>>();
  #closed = false;
  #closePromise: Promise<void> | undefined;

  constructor(
    options: RelationshipProviderOptions,
    channel: JsonRpcChannel,
    completion: Promise<{ code: number | null; stderr: string }>,
    documents: Map<string, SourceDocument>,
    openReasons: readonly string[],
    initialCoveragePartial: boolean,
    executable: string,
    signal: AbortSignal,
    inventory: ReadonlySet<string>,
    releaseQueue: () => void,
    clearTimeout: () => void,
  ) {
    this.analysisViewId = options.analysisViewId ?? randomUUID();
    this.sourceScope = options.scope;
    this.#cwd = options.cwd;
    this.#source = options.source;
    this.#signal = signal;
    this.#configurationFingerprint = configurationFingerprint(executable);
    this.#inventory = inventory;
    this.#channel = channel;
    this.#completion = completion;
    this.#documents = documents;
    this.#openReasons = [...openReasons, `gopls executable: ${executable}`];
    this.#initialCoveragePartial = initialCoveragePartial;
    this.#releaseQueue = releaseQueue;
    this.#clearTimeout = clearTimeout;
  }

  readonly #releaseQueue: () => void;
  readonly #clearTimeout: () => void;

  async resolveNode(
    input: { path: string; line?: number; column?: number; symbol?: string },
    signal?: AbortSignal,
  ): Promise<RelationshipResolution> {
    this.assertOpen();
    if (signal?.aborted) throw abortError();
    const document = this.#documents.get(resolve(this.#cwd, input.path));
    if (!document)
      return {
        status: "unsupported",
        reasons: ["Go target is outside admitted provider source"],
        dependencies: [],
      };
    const position = await this.position(document, input);
    const params = { textDocument: { uri: await semanticUri(this.#cwd, document.path) }, position };
    const prepared = await this.#channel.request("textDocument/prepareCallHierarchy", params);
    const candidates = Array.isArray(prepared) ? prepared.map(readNode) : [];
    if (candidates.length > 1 && input.column === undefined)
      return {
        status: "ambiguous",
        candidates: candidates.map((candidate) => this.node(candidate, document)),
        reasons: ["gopls returned multiple call hierarchy items; include a column"],
        dependencies: [
          documentDependency(document),
          environmentDependency(this.#configurationFingerprint),
        ],
      };
    let selected = candidates[0];
    if (!selected) {
      const definitions = readLocations(
        await this.#channel.request("textDocument/definition", params),
      );
      selected = definitions[0];
    }
    if (!selected)
      return {
        status: "unknown",
        reasons: ["gopls returned no definition or call hierarchy item"],
        dependencies: [
          documentDependency(document),
          environmentDependency(this.#configurationFingerprint),
        ],
      };
    const target = this.#documents.get(resolve(this.#cwd, selected.path));
    if (!target)
      return {
        status: "unknown",
        reasons: ["gopls resolved outside admitted provider source"],
        dependencies: [
          documentDependency(document),
          environmentDependency(this.#configurationFingerprint),
        ],
      };
    return {
      status: "resolved",
      node: this.node(selected, target),
      reasons: [],
      dependencies: [
        documentDependency(document),
        documentDependency(target),
        environmentDependency(this.#configurationFingerprint),
      ],
    };
  }

  async expand(
    node: RelationshipNode,
    operation: RelationshipOperation,
    signal?: AbortSignal,
  ): Promise<RelationshipExpansion> {
    this.assertOpen();
    if (signal?.aborted) throw abortError();
    const internal = this.internalNode(node);
    const document = this.#documents.get(resolve(this.#cwd, internal.path));
    if (!document)
      return {
        edges: [],
        nodes: [],
        unresolved: [
          operationUnresolved(operation, "Node source is outside admitted provider source"),
        ],
        dependencies: [],
        coverage: {
          status: "partial",
          freshness: "unknown",
          sources: [],
          reasons: ["Node source is outside admitted provider source"],
        },
      };
    const params = {
      textDocument: { uri: await semanticUri(this.#cwd, document.path) },
      position: positionOf(internal),
    };
    const goEdges: GoEdge[] = [];
    const unresolved: RelationshipUnresolved[] = [];
    if (operation === "callers" || operation === "callees") {
      const prepared = await this.#channel.request(operationMethod(operation), params);
      if (!Array.isArray(prepared))
        unresolved.push(operationUnresolved(operation, "gopls returned an invalid call hierarchy"));
      else {
        for (const item of prepared) {
          const method =
            operation === "callers" ? "callHierarchy/incomingCalls" : "callHierarchy/outgoingCalls";
          // Keep each call-hierarchy branch ordered; gopls may refresh the workspace while answering it.
          // oxlint-disable-next-line no-await-in-loop -- ordered requests avoid interleaving mutable gopls state.
          const calls = await this.#channel.request(method, { item });
          if (!Array.isArray(calls)) {
            unresolved.push(
              operationUnresolved(operation, "gopls returned an invalid call hierarchy"),
            );
            continue;
          }
          for (const call of calls) {
            if (!rpcRecord(call)) {
              unresolved.push(
                operationUnresolved(operation, "gopls returned an invalid call edge"),
              );
              continue;
            }
            const record = call;
            try {
              const endpoint = readNode(operation === "callers" ? record.from : record.to);
              const callRanges = readCallRanges(record.fromRanges);
              goEdges.push({
                operation,
                from: operation === "callers" ? endpoint : internal,
                to: operation === "callers" ? internal : endpoint,
                ...(callRanges ? { callRanges } : {}),
              });
            } catch (error) {
              unresolved.push(
                operationUnresolved(
                  operation,
                  error instanceof Error ? error.message : "invalid call edge",
                ),
              );
            }
          }
        }
      }
    } else {
      const value = await this.#channel.request(operationMethod(operation), {
        ...params,
        ...(operation === "references" ? { context: { includeDeclaration: true } } : {}),
      });
      const candidates = readLocations(value);
      for (const candidate of candidates)
        goEdges.push({ operation, from: internal, to: candidate });
    }
    const nodes: RelationshipNode[] = [];
    const edges: RelationshipEdge[] = [];
    for (const edge of goEdges) {
      const from = this.convertNode(edge.from, unresolved, operation);
      const to = this.convertNode(edge.to, unresolved, operation);
      if (!from || !to) continue;
      nodes.push(from, to);
      const callRanges = edge.callRanges?.length ? edge.callRanges : [undefined];
      for (const [index, range] of callRanges.entries()) {
        const callSite = range ? this.callSite(edge, range) : undefined;
        const edgeKey = `${operation}:${from.identity.localKey}->${to.identity.localKey}:${String(index)}`;
        const edgePaths = new Set([from.path, to.path, ...(callSite ? [callSite.path] : [])]);
        this.#edgePaths.set(edgeKey, edgePaths);
        edges.push({
          edgeKey,
          operation,
          from,
          to,
          ...(callSite ? { callSite } : {}),
          evidence: [evidence(relationReason(operation))],
          confidence: "verified-static",
          dependencies: [...edgePaths]
            .map((path) =>
              documentDependency(this.#documents.get(resolve(this.#cwd, path)) ?? document),
            )
            .concat(environmentDependency(this.#configurationFingerprint)),
        });
      }
    }
    const uniqueNodes = [...new Map(nodes.map((item) => [item.identity.localKey, item])).values()];
    const reasons = [...this.#openReasons, relationReason(operation)];
    return {
      edges,
      nodes: uniqueNodes,
      unresolved,
      dependencies: [
        documentDependency(document),
        environmentDependency(this.#configurationFingerprint),
      ],
      coverage: {
        status: this.#initialCoveragePartial || unresolved.length ? "partial" : "complete",
        freshness: "current",
        sources: this.currentSourceStatuses(),
        reasons: [...new Set(reasons)],
      },
    };
  }

  async recheck(signal?: AbortSignal): Promise<RelationshipRecheck> {
    this.assertOpen();
    if (signal?.aborted) throw abortError();
    const sources: RelationshipSourceStatus[] = [];
    const reasons: string[] = [];
    for (const document of this.#documents.values()) {
      try {
        // Refresh one document at a time so a changing worktree cannot race the evidence ledger.
        // oxlint-disable-next-line no-await-in-loop -- source refreshes are intentionally serialized.
        await this.#source.refresh(document.path, document.reference);
        sources.push(this.sourceStatus(document, "current"));
      } catch (error) {
        const reason = error instanceof Error ? error.message : "source recheck failed";
        sources.push(this.sourceStatus(document, "stale", reason));
        reasons.push(`${document.path}: ${reason}`);
      }
    }
    let configurationReason: string | undefined;
    let currentConfigurationFingerprint: string | undefined;
    try {
      const executable = executablePath();
      environment(executable);
      currentConfigurationFingerprint = configurationFingerprint(executable);
    } catch (error) {
      configurationReason =
        error instanceof Error ? error.message : "Go build configuration is invalid";
    }
    const configurationChanged =
      configurationReason !== undefined ||
      currentConfigurationFingerprint !== this.#configurationFingerprint;
    sources.push({
      path: GO_ENVIRONMENT_PATH,
      role: "config",
      status: configurationChanged ? "stale" : "current",
      ...(configurationReason
        ? { reason: configurationReason }
        : configurationChanged
          ? { reason: "Go build environment or gopls executable changed during relationship query" }
          : {}),
    });
    if (configurationChanged)
      reasons.push(
        configurationReason ??
          "Go build environment or gopls executable changed during relationship query",
      );
    const inventory = await listWorkspaceFiles(this.#cwd, this.#signal, {
      path: this.sourceScope.root,
      glob: [...(this.sourceScope.include ?? [])],
      exclude: [...(this.sourceScope.exclude ?? [])],
      ...(this.sourceScope.hidden === undefined ? {} : { hidden: this.sourceScope.hidden }),
    });
    const currentInventory = new Set(inventory.paths.filter(isAdmittedGoFile));
    const inventoryChanged =
      currentInventory.size !== this.#inventory.size ||
      [...currentInventory].some((path) => !this.#inventory.has(path));
    if (inventoryChanged || inventory.partial) {
      reasons.push(
        inventoryChanged
          ? "Go source/config inventory changed during relationship query; retry"
          : inventory.reasons.join("; "),
      );
      for (const path of [...this.#inventory].filter((item) => !currentInventory.has(item)))
        sources.push({
          path,
          role: documentRole(path),
          status: "stale",
          reason: "source removed during query",
        });
      for (const path of [...currentInventory].filter((item) => !this.#inventory.has(item)))
        sources.push({
          path,
          role: documentRole(path),
          status: "stale",
          reason: "source added during query; retry",
        });
      if (inventory.partial)
        sources.push({
          path: GO_INVENTORY_PATH,
          role: "metadata",
          status: "unknown",
          reason: inventory.reasons.join("; ") || "Go source/config inventory is incomplete",
        });
    }
    const stalePaths = new Set(
      sources.filter((source) => source.status === "stale").map((source) => source.path),
    );
    const inventoryUnknown = sources.some(
      (source) => source.path === GO_INVENTORY_PATH && source.status === "unknown",
    );
    const sourceUnknown = sources.some((source) => source.status === "unknown");
    const configurationStale = sources.some(
      (source) => source.path === GO_ENVIRONMENT_PATH && source.status !== "current",
    );
    return {
      validity: stalePaths.size ? "stale" : sourceUnknown ? "unknown" : "current",
      coverage:
        this.#initialCoveragePartial || stalePaths.size || sourceUnknown ? "partial" : "complete",
      sources,
      affectedNodeKeys:
        configurationStale || inventoryUnknown
          ? [...this.#nodePaths.keys()]
          : [...this.#nodePaths.entries()]
              .filter(([, path]) =>
                sources.some((source) => source.path === path && source.status !== "current"),
              )
              .map(([key]) => key),
      affectedEdgeKeys:
        configurationStale || inventoryUnknown
          ? [...this.#edgePaths.keys()]
          : [...this.#edgePaths.entries()]
              .filter(([, paths]) => [...paths].some((path) => stalePaths.has(path)))
              .map(([key]) => key),
      reasons: [...new Set(reasons)],
    };
  }

  close(): Promise<void> {
    if (!this.#closePromise) this.#closePromise = this.closeOnce();
    return this.#closePromise;
  }

  async closeOnce(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    try {
      await this.#channel.request("shutdown", undefined);
      await this.#channel.notify("exit");
      this.#channel.endInput();
      const result = await this.#completion;
      if (result.code !== 0)
        throw new SignalGrepError(
          `gopls process failed (${String(result.code)}): ${result.stderr}`,
        );
    } catch (error) {
      this.#channel.close();
      await this.#completion.catch(() => undefined);
      throw error;
    } finally {
      this.#clearTimeout();
      this.#releaseQueue();
    }
  }

  private async position(
    document: SourceDocument,
    input: { line?: number; column?: number; symbol?: string },
  ): Promise<LspPosition> {
    if (input.line !== undefined && (!Number.isSafeInteger(input.line) || input.line < 1))
      throw new SignalGrepError("Go semantic target line must be one-based");
    if (input.column !== undefined && (!Number.isSafeInteger(input.column) || input.column < 1))
      throw new SignalGrepError("Go semantic target column must be one-based");
    if (input.column !== undefined) {
      if (input.line === undefined) throw new SignalGrepError("Go semantic column requires a line");
      return { line: input.line - 1, character: input.column - 1 };
    }
    if (!input.symbol) throw new SignalGrepError("Go semantic target requires a column or symbol");
    const symbolName = input.symbol;
    const symbols = await this.#channel.request("textDocument/documentSymbol", {
      textDocument: { uri: await semanticUri(this.#cwd, document.path) },
    });
    const found: LspPosition[] = [];
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      if (!rpcRecord(value)) return;
      const record = value;
      const position = symbolPosition(document, record, symbolName);
      if (record.name === symbolName && position) {
        if (input.line === undefined || position.line + 1 === input.line) found.push(position);
      }
      if (Array.isArray(record.children)) for (const child of record.children) visit(child);
    };
    if (Array.isArray(symbols)) for (const symbol of symbols) visit(symbol);
    if (found.length !== 1)
      throw new SignalGrepError(
        found.length
          ? "Go semantic target symbol is ambiguous"
          : "Go semantic target symbol is absent",
      );
    const position = found[0];
    if (!position) throw new SignalGrepError("Go semantic target symbol is absent");
    return position;
  }

  private node(internal: GoNode, document: SourceDocument): RelationshipNode {
    const range = byteRange(document, internal.range);
    const selection = byteRange(document, internal.selectionRange);
    const localKey = `${document.path}:${String(selection.start)}:${String(selection.end)}`;
    this.#nodePaths.set(localKey, document.path);
    return {
      identity: {
        providerId: GO_SEMANTIC_PROVIDER_ID,
        analysisViewId: this.analysisViewId,
        sourceScope: this.sourceScope.root,
        localKey,
      },
      path: document.path,
      name: internal.name ?? document.path,
      kind: internal.kind === undefined ? "unknown" : String(internal.kind),
      range,
      start: {
        line: internal.selectionRange.start.line + 1,
        column: internal.selectionRange.start.character + 1,
      },
      end: {
        line: internal.selectionRange.end.line + 1,
        column: internal.selectionRange.end.character + 1,
      },
      source: document.reference,
      evidence: [evidence("gopls compiler-bound Go navigation result")],
    };
  }

  private convertNode(
    internal: GoNode,
    unresolved: RelationshipUnresolved[],
    operation: RelationshipOperation,
  ): RelationshipNode | undefined {
    const document = this.#documents.get(resolve(this.#cwd, internal.path));
    if (!document) {
      unresolved.push(operationUnresolved(operation, "gopls result is outside admitted Go source"));
      return undefined;
    }
    return this.node(internal, document);
  }

  private callSite(edge: GoEdge, range: LspRange): RelationshipSourceLocation | undefined {
    const document = this.#documents.get(resolve(this.#cwd, edge.from.path));
    return document ? sourceLocation(document, range) : undefined;
  }

  private sourceStatus(
    document: SourceDocument,
    status: "current" | "stale",
    reason?: string,
  ): RelationshipSourceStatus {
    return {
      path: document.path,
      role: documentRole(document.path),
      status,
      expected: document.reference,
      ...(reason ? { reason } : {}),
    };
  }

  private currentSourceStatuses(): RelationshipSourceStatus[] {
    return [
      ...[...this.#documents.values()].map((document) => this.sourceStatus(document, "current")),
      { path: GO_ENVIRONMENT_PATH, role: "config", status: "current" },
    ];
  }

  private internalNode(node: RelationshipNode): GoNode {
    const document = this.#documents.get(resolve(this.#cwd, node.path));
    if (!document) throw new SignalGrepError("Relationship node is outside this Go view");
    const start = { line: node.start.line - 1, character: node.start.column - 1 };
    const end = {
      line: (node.end?.line ?? node.start.line) - 1,
      character: (node.end?.column ?? node.start.column) - 1,
    };
    return {
      id: node.identity.localKey,
      path: document.path,
      uri: "",
      range: { start, end },
      selectionRange: { start, end },
      name: node.name,
    };
  }

  private assertOpen(): void {
    if (this.#closed) throw new SignalGrepError("Go relationship view is closed");
  }
}

export const goSemanticProvider: RelationshipProvider = {
  providerId: GO_SEMANTIC_PROVIDER_ID,
  async open(options): Promise<RelationshipView> {
    const releaseQueue = await providerQueue.acquire(options.signal);
    try {
      const files = await listWorkspaceFiles(options.cwd, options.signal, {
        path: options.scope.root,
        glob: [...(options.scope.include ?? [])],
        exclude: [...(options.scope.exclude ?? [])],
        ...(options.scope.hidden === undefined ? {} : { hidden: options.scope.hidden }),
        ...(options.limits?.maxFiles === undefined ? {} : { maxFiles: options.limits.maxFiles }),
      });
      const documents = new Map<string, SourceDocument>();
      const reasons = [...files.reasons];
      let initialCoveragePartial = files.partial;
      for (const path of files.paths.filter(isAdmittedGoFile)) {
        if (options.signal.aborted) throw abortError();
        try {
          // Loading in enumeration order keeps source evidence deterministic and avoids a read burst.
          // oxlint-disable-next-line no-await-in-loop -- each load is bounded by the source reader budget.
          const document = await options.source.load(path);
          if (!document.utf8) {
            reasons.push(`${path}: source is not lossless UTF-8`);
            initialCoveragePartial = true;
            continue;
          }
          documents.set(resolve(options.cwd, path), document);
        } catch (error) {
          reasons.push(`${path}: ${error instanceof Error ? error.message : "source unavailable"}`);
          initialCoveragePartial = true;
        }
      }
      if (documents.size === 0)
        throw new SignalGrepError("Go semantic provider found no admitted Go source");
      const executable = executablePath();
      const deadline = new AbortController();
      const signal = AbortSignal.any([options.signal, deadline.signal]);
      const timer = setTimeout(() => deadline.abort(), GO_SEMANTIC_QUERY_TIMEOUT_MS);
      let owned: Awaited<ReturnType<typeof openOwnedJsonRpc>> | undefined;
      try {
        owned = await openOwnedJsonRpc(
          {
            executable,
            args: ["serve"],
            cwd: resolve(options.cwd, options.scope.root),
            signal,
            env: environment(executable),
          },
          (method, params) => {
            if (method === "workspace/configuration") {
              if (!rpcRecord(params) || !Array.isArray(params.items))
                throw new SignalGrepError("Invalid gopls configuration request");
              return params.items.map(() => ({}));
            }
            if (
              method === "client/registerCapability" ||
              method === "client/unregisterCapability" ||
              method === "window/workDoneProgress/create"
            )
              return null;
            if (method === "workspace/applyEdit")
              return { applied: false, failureReason: "Relationship search is read-only" };
            throw new SignalGrepError(`Unsupported gopls client request: ${method}`);
          },
        );
        const initialize = await owned.channel.request("initialize", {
          processId: process.pid,
          rootUri: await semanticUri(options.cwd, options.scope.root),
          workspaceFolders: [
            { uri: await semanticUri(options.cwd, options.scope.root), name: options.scope.root },
          ],
          capabilities: {
            workspace: { workspaceFolders: true, configuration: true },
            textDocument: {
              definition: { linkSupport: true },
              references: {},
              implementation: { linkSupport: true },
              callHierarchy: {},
            },
            general: { positionEncodings: ["utf-16"] },
          },
          initializationOptions: {},
        });
        if (
          !initialize ||
          typeof initialize !== "object" ||
          Array.isArray(initialize) ||
          !("capabilities" in initialize)
        )
          throw new SignalGrepError("gopls initialize omitted capabilities");
        await owned.channel.notify("initialized", {});
        for (const document of documents.values()) {
          if (!goTextDocument.test(document.path)) continue;
          // gopls applies didOpen notifications to its mutable workspace in order.
          // oxlint-disable-next-line no-await-in-loop -- preserve LSP document-open ordering.
          const uri = await semanticUri(options.cwd, document.path);
          // oxlint-disable-next-line no-await-in-loop -- preserve LSP document-open ordering.
          await owned.channel.notify("textDocument/didOpen", {
            textDocument: {
              uri,
              languageId: languageId(document.path),
              version: 1,
              text: document.text,
            },
          });
        }
        const inventory = new Set(files.paths.filter(isAdmittedGoFile));
        return new GoRelationshipView(
          options,
          owned.channel,
          owned.completion,
          documents,
          reasons,
          initialCoveragePartial,
          executable,
          signal,
          inventory,
          releaseQueue,
          () => clearTimeout(timer),
        );
      } catch (error) {
        deadline.abort();
        clearTimeout(timer);
        releaseQueue();
        if (owned) {
          owned.channel.close();
          await owned.completion.catch(() => undefined);
        }
        throw error;
      }
    } catch (error) {
      releaseQueue();
      throw error;
    }
  },
};
