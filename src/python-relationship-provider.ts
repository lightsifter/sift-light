import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import { aggregateRelationshipValidity } from "./evidence-validity.js";
import { OwnedTaskQueue } from "./owned-task-queue.js";
import { rpcRecord } from "./owned-json-rpc.js";
import { byteRange, lspRange, type LspRange, type LspPosition } from "./semantic-protocol.js";
import { semanticUri } from "./semantic-sources.js";
import type { SourceDocument } from "./source-document.js";
import {
  relationshipNodeKey,
  type RelationshipDependency,
  type RelationshipEdge,
  type RelationshipEvidence,
  type RelationshipExpansion,
  type RelationshipNode,
  type RelationshipOperation,
  type RelationshipProvider,
  type RelationshipProviderOptions,
  type RelationshipRecheck,
  type RelationshipResolution,
  type RelationshipSourceLocation,
  type RelationshipSourceStatus,
  type RelationshipUnresolved,
  type RelationshipView,
} from "./relationship-types.js";
import {
  isPythonProjectMarker,
  pythonEnvironmentKeys,
  pythonLanguageServerCommand,
  type PythonLanguageServerCommand,
} from "./python-language-discovery.js";
import { PythonLspSession } from "./python-lsp-session.js";
import { PythonSourceContext } from "./python-source-context.js";
import { listWorkspaceFiles } from "./workspace-files.js";

export const PYTHON_SEMANTIC_PROVIDER_ID = "pyright-python";
const providerQueue = new OwnedTaskQueue();
const PYTHON_SOURCE = /\.py$/iu;
const PYTHON_ENVIRONMENT_PATH = "python:environment";
const PYTHON_INVENTORY_PATH = "python:inventory";

interface LspLocation {
  readonly uri: string;
  readonly range: LspRange;
  readonly selectionRange: LspRange;
  readonly name?: string;
  readonly kind?: number;
}

interface LspCallEdge {
  readonly from: LspLocation;
  readonly to: LspLocation;
  readonly ranges: readonly LspRange[];
}

function readLocation(value: unknown): LspLocation {
  if (!rpcRecord(value)) throw new SignalGrepError("Pyright returned an invalid navigation item");
  const uri = value.uri ?? value.targetUri;
  const range = value.range ?? value.targetRange ?? value.targetSelectionRange;
  const selectionRange = value.selectionRange ?? value.targetSelectionRange ?? range;
  if (typeof uri !== "string" || !uri.startsWith("file:"))
    throw new SignalGrepError("Pyright returned a non-file navigation URI");
  if (!range || !selectionRange) throw new SignalGrepError("Pyright navigation item omitted range");
  return {
    uri,
    range: lspRange(range),
    selectionRange: lspRange(selectionRange),
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    ...(typeof value.kind === "number" ? { kind: value.kind } : {}),
  };
}

function locations(value: unknown): LspLocation[] {
  if (value === null) return [];
  return (Array.isArray(value) ? value : [value]).map(readLocation);
}

function sourceLocation(document: SourceDocument, range: LspRange): RelationshipSourceLocation {
  const bytes = byteRange(document, range);
  return {
    path: document.path,
    range: bytes,
    start: document.positionAt(bytes.start),
    end: document.positionAt(bytes.end),
    source: document.reference,
  };
}

function position(
  document: SourceDocument,
  input: { line?: number; column?: number },
): LspPosition {
  if (input.line !== undefined && (!Number.isSafeInteger(input.line) || input.line < 1))
    throw new SignalGrepError("Python semantic target line must be one-based");
  if (input.column !== undefined && (!Number.isSafeInteger(input.column) || input.column < 1))
    throw new SignalGrepError("Python semantic target column must be one-based");
  if (input.column !== undefined) {
    if (input.line === undefined)
      throw new SignalGrepError("Python semantic column requires a line");
    return { line: input.line - 1, character: input.column - 1 };
  }
  return { line: (input.line ?? 1) - 1, character: 0 };
}

function documentDependency(document: SourceDocument): RelationshipDependency {
  return { path: document.path, role: "source", reference: document.reference, exists: true };
}

function metadataDependency(document: SourceDocument): RelationshipDependency {
  return { path: document.path, role: "config", reference: document.reference, exists: true };
}

function environmentDependency(fingerprint: string): RelationshipDependency {
  return { path: PYTHON_ENVIRONMENT_PATH, role: "config", fingerprint, exists: true };
}

function evidence(operation: RelationshipOperation): RelationshipEvidence {
  return {
    level: "compiler",
    basis: "semantic",
    providerBasis: "pyright",
    reason:
      operation === "callers" || operation === "callees"
        ? "Pyright static call hierarchy; dynamic dispatch and runtime execution remain unproven"
        : `Pyright compiler-bound ${operation} result in the admitted Python project`,
  };
}

function operationMethod(operation: RelationshipOperation): string {
  switch (operation) {
    case "definitions":
      return "textDocument/definition";
    case "references":
      return "textDocument/references";
    case "implementations":
      return "textDocument/implementation";
    default:
      throw new SignalGrepError(`Pyright operation ${operation} uses call hierarchy`);
  }
}

function callUnresolved(operation: RelationshipOperation, reason: string): RelationshipUnresolved {
  return { operation, reason, confidence: "unknown" };
}

function pathFromUri(uri: string): string {
  try {
    return fileURLToPath(uri);
  } catch (error) {
    throw new SignalGrepError("Pyright returned an invalid file URI", { cause: error });
  }
}

function configurationFingerprint(
  command: PythonLanguageServerCommand,
  context: PythonSourceContext,
): string {
  const configurations = [...context.configDocuments()].map((document) => [
    document.path,
    document.reference.origin.kind === "worktree"
      ? document.reference.origin.contentHash
      : document.reference.origin.blob,
  ]);
  const environment = pythonEnvironmentKeys().map((key) => [key, process.env[key] ?? ""]);
  return createHash("sha256")
    .update(
      JSON.stringify({
        command: command.fingerprint,
        configurations,
        environment,
        root: context.root,
      }),
    )
    .digest("hex");
}

class PythonRelationshipView implements RelationshipView {
  readonly providerId = PYTHON_SEMANTIC_PROVIDER_ID;
  readonly analysisViewId: string;
  readonly sourceScope: RelationshipProviderOptions["scope"];
  readonly #context: PythonSourceContext;
  readonly #session: PythonLspSession;
  readonly #documents: ReadonlyMap<string, SourceDocument>;
  readonly #metadata: readonly SourceDocument[];
  readonly #configurationFingerprint: string;
  readonly #inventory: ReadonlySet<string>;
  readonly #nodePaths = new Map<string, string>();
  readonly #edgePaths = new Map<string, Set<string>>();
  readonly #initialReasons: readonly string[];
  readonly #initialPartial: boolean;
  readonly #releaseQueue: () => void;
  #closed = false;
  #closePromise: Promise<void> | undefined;

  constructor(
    options: RelationshipProviderOptions,
    context: PythonSourceContext,
    session: PythonLspSession,
    releaseQueue: () => void,
    open: { reasons: readonly string[]; partial: boolean },
  ) {
    this.analysisViewId = options.analysisViewId ?? randomUUID();
    this.sourceScope = { ...options.scope, root: context.root };
    this.#context = context;
    this.#session = session;
    this.#documents = context.documents;
    this.#metadata = context.configDocuments();
    this.#configurationFingerprint = configurationFingerprint(context.command, context);
    this.#inventory = context.inventory;
    this.#releaseQueue = releaseQueue;
    this.#initialReasons = [...open.reasons];
    this.#initialPartial = open.partial;
  }

  async resolveNode(
    input: { path: string; line?: number; column?: number; symbol?: string },
    signal?: AbortSignal,
  ): Promise<RelationshipResolution> {
    this.assertOpen(signal);
    const document = this.#context.document(input.path);
    if (!document)
      return {
        status: "unsupported",
        reasons: ["Python target is outside the admitted Pyright project"],
        dependencies: [],
      };
    let selected: LspLocation | undefined;
    let candidates: LspLocation[] = [];
    if (input.symbol !== undefined || input.column === undefined) {
      if (!this.#session.capabilities.documentSymbols)
        return {
          status: "unsupported",
          reasons: ["Pyright did not advertise documentSymbolProvider for symbol selection"],
          dependencies: [documentDependency(document), ...this.configurationDependencies()],
        };
      candidates = await this.symbolCandidates(document, input);
      if (input.symbol !== undefined && candidates.length === 0)
        return {
          status: "unknown",
          reasons: [`Pyright returned no admitted Python symbol named ${input.symbol}`],
          dependencies: [documentDependency(document), ...this.configurationDependencies()],
        };
      if (candidates.length > 1)
        return {
          status: "ambiguous",
          candidates: candidates.map((item) =>
            this.node(item, document, item.name ?? input.symbol ?? "Python symbol"),
          ),
          reasons: ["Pyright returned multiple Python symbols; include a line and column"],
          dependencies: [documentDependency(document), ...this.configurationDependencies()],
        };
      selected = candidates[0];
    }
    if (!selected) {
      const selectedPosition = position(document, input);
      selected = {
        uri: await semanticUri(this.#context.cwd, document.path),
        range: {
          start: selectedPosition,
          end: selectedPosition,
        },
        selectionRange: {
          start: selectedPosition,
          end: selectedPosition,
        },
        ...(input.symbol ? { name: input.symbol } : {}),
      };
    }
    const node = this.node(selected, document, selected.name ?? input.symbol ?? "Python symbol");
    return {
      status: "resolved",
      node,
      reasons: [...this.#initialReasons],
      dependencies: [documentDependency(document), ...this.configurationDependencies()],
    };
  }

  async expand(
    node: RelationshipNode,
    operation: RelationshipOperation,
    signal?: AbortSignal,
  ): Promise<RelationshipExpansion> {
    this.assertOpen(signal);
    if (!this.#session.capabilities.operations.has(operation))
      throw new SignalGrepError(`Pyright did not advertise Python operation: ${operation}`);
    const document = this.#context.document(node.path);
    if (!document)
      return {
        edges: [],
        nodes: [],
        unresolved: [callUnresolved(operation, "Python node is outside the admitted project")],
        dependencies: [],
        coverage: {
          status: "partial",
          freshness: "unknown",
          sources: [],
          reasons: ["Python node is outside the admitted project"],
        },
      };
    const internal = this.internalLocation(node);
    const unresolved: RelationshipUnresolved[] = [];
    const rawEdges: LspCallEdge[] = [];
    const uri = await semanticUri(this.#context.cwd, document.path);
    const internalWithUri = { ...internal, uri };
    if (operation === "callers" || operation === "callees") {
      const prepared = await this.#session.request("textDocument/prepareCallHierarchy", {
        textDocument: { uri },
        position: internal.selectionRange.start,
      });
      if (!Array.isArray(prepared) || prepared.length === 0) {
        unresolved.push(callUnresolved(operation, "Pyright returned no call hierarchy item"));
      } else {
        if (prepared.length > 1)
          unresolved.push(
            callUnresolved(operation, "Pyright returned ambiguous call hierarchy items"),
          );
        for (const candidate of prepared) {
          try {
            const item = readLocation(candidate);
            const method =
              operation === "callers"
                ? "callHierarchy/incomingCalls"
                : "callHierarchy/outgoingCalls";
            // oxlint-disable-next-line no-await-in-loop -- preserve each call-hierarchy branch order.
            const values = await this.#session.request(method, { item: candidate });
            if (!Array.isArray(values)) {
              unresolved.push(
                callUnresolved(operation, "Pyright returned an invalid call hierarchy response"),
              );
              continue;
            }
            for (const value of values) {
              if (!rpcRecord(value)) {
                unresolved.push(
                  callUnresolved(operation, "Pyright returned an invalid call hierarchy edge"),
                );
                continue;
              }
              const endpointValue = operation === "callers" ? value.from : value.to;
              const endpoint = readLocation(endpointValue);
              const ranges = Array.isArray(value.fromRanges) ? value.fromRanges.map(lspRange) : [];
              rawEdges.push({
                from: operation === "callers" ? endpoint : item,
                to: operation === "callers" ? item : endpoint,
                ranges,
              });
            }
          } catch (error) {
            unresolved.push(
              callUnresolved(
                operation,
                error instanceof Error ? error.message : "invalid call edge",
              ),
            );
          }
        }
      }
    } else {
      const response = await this.#session.request(operationMethod(operation), {
        textDocument: { uri },
        position: internal.selectionRange.start,
        ...(operation === "references" ? { context: { includeDeclaration: true } } : {}),
      });
      for (const candidate of locations(response))
        rawEdges.push({
          from: internalWithUri,
          to: candidate,
          ranges: [],
        });
    }
    const edges: RelationshipEdge[] = [];
    const nodes: RelationshipNode[] = [];
    for (const raw of rawEdges) {
      const fromDocument = this.documentForLocation(raw.from);
      const toDocument = this.documentForLocation(raw.to);
      if (!fromDocument || !toDocument) {
        unresolved.push(
          callUnresolved(operation, "Pyright returned a location outside admitted Python source"),
        );
        continue;
      }
      const from = this.node(raw.from, fromDocument, raw.from.name ?? node.name);
      const to = this.node(raw.to, toDocument, raw.to.name ?? node.name);
      const ranges = raw.ranges.length ? raw.ranges : [undefined];
      for (const [index, range] of ranges.entries()) {
        const callSite = range ? sourceLocation(fromDocument, range) : undefined;
        const edgeKey = `${operation}:${from.identity.localKey}->${to.identity.localKey}:${String(index)}`;
        const paths = new Set([from.path, to.path, ...(callSite ? [callSite.path] : [])]);
        this.#edgePaths.set(edgeKey, paths);
        edges.push({
          edgeKey,
          operation,
          from,
          to,
          ...(callSite ? { callSite } : {}),
          evidence: [evidence(operation)],
          confidence: "verified-static",
          dependencies: [...paths]
            .map((path) => this.#documents.get(resolve(this.#context.cwd, path)))
            .filter((item): item is SourceDocument => item !== undefined)
            .map(documentDependency)
            .concat(this.configurationDependencies()),
        });
        nodes.push(from, to);
      }
    }
    const uniqueNodes = [
      ...new Map(nodes.map((item) => [relationshipNodeKey(item), item])).values(),
    ];
    const reasons = [
      ...this.#initialReasons,
      ...unresolved.map((item) => item.reason),
      evidence(operation).reason,
    ];
    return {
      edges,
      nodes: uniqueNodes,
      unresolved,
      dependencies: [documentDependency(document), ...this.configurationDependencies()],
      coverage: {
        status: this.#initialPartial || unresolved.length ? "partial" : "complete",
        freshness: "current",
        sources: this.currentSourceStatuses(),
        reasons: [...new Set(reasons)],
      },
    };
  }

  async recheck(signal?: AbortSignal): Promise<RelationshipRecheck> {
    this.assertOpen(signal);
    const sources: RelationshipSourceStatus[] = [];
    const reasons: string[] = [];
    for (const document of [...this.#documents.values(), ...this.#metadata]) {
      try {
        // Refresh each captured dependency separately so every stale path remains attributable.
        // oxlint-disable-next-line no-await-in-loop -- serialized source freshness ledger.
        await this.#context.source.refresh(document.path, document.reference);
        sources.push(this.sourceStatus(document, "current"));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        const reason = error instanceof Error ? error.message : "Python source recheck failed";
        sources.push(this.sourceStatus(document, "stale", reason));
        reasons.push(`${document.path}: ${reason}`);
      }
    }
    const command = pythonLanguageServerCommand();
    const currentFingerprint = configurationFingerprint(command, this.#context);
    const configurationChanged = currentFingerprint !== this.#configurationFingerprint;
    sources.push({
      path: PYTHON_ENVIRONMENT_PATH,
      role: "config",
      status: configurationChanged ? "stale" : "current",
      ...(configurationChanged
        ? { reason: "Python executable, environment or project configuration changed" }
        : {}),
    });
    if (configurationChanged)
      reasons.push("Python executable, environment or project configuration changed");
    const files = await listWorkspaceFiles(this.#context.cwd, this.#context.signal, {
      path: this.#context.root,
      glob: [...(this.sourceScope.include ?? [])],
      exclude: [...(this.sourceScope.exclude ?? [])],
      ...(this.sourceScope.hidden === undefined ? {} : { hidden: this.sourceScope.hidden }),
      maxFiles: this.#context.maxFiles,
    });
    const currentInventory = new Set(
      files.paths.filter((path) => PYTHON_SOURCE.test(path) || isPythonProjectMarker(path)),
    );
    const inventoryChanged =
      currentInventory.size !== this.#inventory.size ||
      [...currentInventory].some((path) => !this.#inventory.has(path));
    if (inventoryChanged || files.partial) {
      reasons.push(
        inventoryChanged
          ? "Python source/config inventory changed during query; retry"
          : files.reasons.join("; "),
      );
      for (const path of [...this.#inventory].filter((item) => !currentInventory.has(item)))
        sources.push({
          path,
          role: isPythonProjectMarker(path) ? "config" : "source",
          status: "stale",
          reason: "source removed during query",
        });
      for (const path of [...currentInventory].filter((item) => !this.#inventory.has(item)))
        sources.push({
          path,
          role: isPythonProjectMarker(path) ? "config" : "source",
          status: "stale",
          reason: "source added during query; retry",
        });
      if (files.partial)
        sources.push({
          path: PYTHON_INVENTORY_PATH,
          role: "metadata",
          status: "unknown",
          reason: files.reasons.join("; ") || "Python inventory is incomplete",
        });
    }
    const stalePaths = new Set(
      sources.filter((item) => item.status === "stale").map((item) => item.path),
    );
    const unknown = sources.some((item) => item.status === "unknown");
    const configurationStale =
      configurationChanged ||
      sources.some((item) => item.path === PYTHON_INVENTORY_PATH && item.status !== "current");
    return {
      validity: stalePaths.size
        ? "stale"
        : unknown
          ? "unknown"
          : aggregateRelationshipValidity(sources),
      coverage: this.#initialPartial || stalePaths.size || unknown ? "partial" : "complete",
      sources,
      affectedNodeKeys: configurationStale
        ? [...this.#nodePaths.keys()]
        : [...this.#nodePaths.entries()]
            .filter(([, path]) => stalePaths.has(path))
            .map(([nodeKey]) => nodeKey),
      affectedEdgeKeys: configurationStale
        ? [...this.#edgePaths.keys()]
        : [...this.#edgePaths.entries()]
            .filter(([, paths]) => [...paths].some((path) => stalePaths.has(path)))
            .map(([edgeKey]) => edgeKey),
      reasons: [...new Set(reasons)],
    };
  }

  async close(): Promise<void> {
    if (!this.#closePromise) this.#closePromise = this.closeOnce();
    return this.#closePromise;
  }

  private async closeOnce(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    try {
      await this.#session.close();
    } finally {
      this.#releaseQueue();
    }
  }

  private async symbolCandidates(
    document: SourceDocument,
    input: { line?: number; symbol?: string },
  ): Promise<LspLocation[]> {
    const documentUri = await semanticUri(this.#context.cwd, document.path);
    const response = await this.#session.request("textDocument/documentSymbol", {
      textDocument: { uri: documentUri },
    });
    if (!Array.isArray(response)) return [];
    const found: LspLocation[] = [];
    const visit = (value: unknown): void => {
      if (!rpcRecord(value)) return;
      try {
        const item = readLocation(
          value.location
            ? { ...value.location, name: value.name, kind: value.kind }
            : { ...value, uri: documentUri },
        );
        const matchesName = input.symbol === undefined || item.name === input.symbol;
        const matchesLine =
          input.line === undefined || item.selectionRange.start.line + 1 === input.line;
        if (matchesName && matchesLine) found.push(item);
        if (Array.isArray(value.children)) for (const child of value.children) visit(child);
      } catch {
        // Malformed individual symbols are omitted; the provider still reports no false binding.
      }
    };
    for (const item of response) visit(item);
    return found;
  }

  private documentForLocation(location: LspLocation): SourceDocument | undefined {
    try {
      const path = pathFromUri(location.uri);
      return this.#context.documentAtAbsolute(resolve(this.#context.cwd, path));
    } catch {
      return undefined;
    }
  }

  private internalLocation(node: RelationshipNode): LspLocation {
    const start = { line: node.start.line - 1, character: node.start.column - 1 };
    const end = {
      line: (node.end?.line ?? node.start.line) - 1,
      character: (node.end?.column ?? node.start.column) - 1,
    };
    return { uri: "", range: { start, end }, selectionRange: { start, end }, name: node.name };
  }

  private node(location: LspLocation, document: SourceDocument, name: string): RelationshipNode {
    const range = byteRange(document, location.range);
    const selection = byteRange(document, location.selectionRange);
    const localKey = `${document.path}:${String(selection.start)}:${String(selection.end)}:${name}`;
    const node: RelationshipNode = {
      identity: {
        providerId: this.providerId,
        analysisViewId: this.analysisViewId,
        sourceScope: this.sourceScope.root,
        localKey,
      },
      path: document.path,
      name,
      kind: location.kind === undefined ? "symbol" : String(location.kind),
      range,
      start: document.positionAt(selection.start),
      end: document.positionAt(selection.end),
      source: document.reference,
      evidence: [evidence("references")],
    };
    this.#nodePaths.set(relationshipNodeKey(node), document.path);
    return node;
  }

  private sourceStatus(
    document: SourceDocument,
    status: "current" | "stale",
    reason?: string,
  ): RelationshipSourceStatus {
    return {
      path: document.path,
      role: isPythonProjectMarker(document.path) ? "config" : "source",
      status,
      expected: document.reference,
      ...(reason ? { reason } : {}),
    };
  }

  private currentSourceStatuses(): RelationshipSourceStatus[] {
    return [
      ...[...this.#documents.values()].map((document) => this.sourceStatus(document, "current")),
      ...this.#metadata.map((document) => this.sourceStatus(document, "current")),
      { path: PYTHON_ENVIRONMENT_PATH, role: "config", status: "current" },
    ];
  }

  private configurationDependencies(): RelationshipDependency[] {
    return [
      ...this.#metadata.map(metadataDependency),
      environmentDependency(this.#configurationFingerprint),
    ];
  }

  private assertOpen(signal?: AbortSignal): void {
    if (this.#closed) throw new SignalGrepError("Python relationship view is closed");
    if (signal?.aborted || this.#context.signal.aborted) throw abortError();
  }
}

export const pythonSemanticProvider: RelationshipProvider = {
  providerId: PYTHON_SEMANTIC_PROVIDER_ID,
  async open(options): Promise<RelationshipView> {
    const releaseQueue = await providerQueue.acquire(options.signal);
    try {
      const command = pythonLanguageServerCommand();
      const opened = await PythonSourceContext.open({
        cwd: options.cwd,
        scope: options.scope,
        source: options.source,
        signal: options.signal,
        maxFiles: options.limits?.maxFiles ?? 200,
        command,
      });
      const session = new PythonLspSession(opened.context);
      await session.start();
      await session.openDocuments(opened.documents);
      return new PythonRelationshipView(options, opened.context, session, releaseQueue, {
        reasons: opened.reasons,
        partial: opened.partial,
      });
    } catch (error) {
      releaseQueue();
      throw error;
    }
  },
};
