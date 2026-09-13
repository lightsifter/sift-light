import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import { rpcRecord } from "./owned-json-rpc.js";
import { OwnedTaskQueue } from "./owned-task-queue.js";
import { byteRange, type LspPosition, type LspRange } from "./semantic-protocol.js";
import type { SourceDocument } from "./source-document.js";
import {
  relationshipNodeKey,
  type RelationshipEdge,
  type RelationshipExpansion,
  type RelationshipNode,
  type RelationshipOutlineItem,
  type RelationshipOperation,
  type RelationshipProvider,
  type RelationshipProviderOptions,
  type RelationshipRecheck,
  type RelationshipResolution,
  type RelationshipSourceLocation,
  type RelationshipUnresolved,
  type RelationshipView,
} from "./relationship-types.js";
import { SwiftSourceContext } from "./swift-source-context.js";
import { SwiftSourceKitSession } from "./swift-sourcekit-session.js";
import {
  SWIFT_SEMANTIC_PROVIDER_ID,
  SWIFT_SEMANTIC_QUERY_TIMEOUT_MS,
  type SwiftCallEdge,
  type SwiftNode,
  type SwiftOutlineItem,
  currentSourceStatuses,
  evidence,
  isIndexBacked,
  operationMethod,
  operationUnresolved,
  positionOf,
  readCallRanges,
  readLocations,
  readSwiftNode,
  readSwiftOutline,
  relationReason,
  sourceDocumentDependency,
  sourceLocation,
  sourceUri,
  toolchainDependency,
} from "./swift-sourcekit-protocol.js";

export {
  SWIFT_SEMANTIC_PROVIDER_ID,
  SWIFT_SEMANTIC_QUERY_TIMEOUT_MS,
} from "./swift-sourcekit-protocol.js";

export interface SwiftOutlineView {
  outline(path: string): Promise<readonly RelationshipOutlineItem[]>;
}

const providerQueue = new OwnedTaskQueue();

class SwiftRelationshipView implements RelationshipView {
  readonly providerId = SWIFT_SEMANTIC_PROVIDER_ID;
  readonly analysisViewId: string;
  readonly sourceScope: RelationshipProviderOptions["scope"];
  readonly #cwd: string;
  readonly #signal: AbortSignal;
  readonly #context: SwiftSourceContext;
  readonly #configurationFingerprint: string;
  readonly #releaseQueue: () => void;
  readonly #clearTimeout: () => void;
  readonly #nodes = new Map<string, string>();
  readonly #edgePaths = new Map<string, Set<string>>();
  readonly #session: SwiftSourceKitSession;
  #closed = false;
  #closePromise: Promise<void> | undefined;

  constructor(
    options: RelationshipProviderOptions,
    context: SwiftSourceContext,
    releaseQueue: () => void,
    clearTimeout: () => void,
  ) {
    this.analysisViewId = options.analysisViewId ?? randomUUID();
    this.sourceScope = options.scope;
    this.#cwd = options.cwd;
    this.#signal = options.signal;
    this.#context = context;
    this.#configurationFingerprint = context.configurationFingerprint;
    this.#session = new SwiftSourceKitSession({
      cwd: context.cwd,
      scope: context.scope,
      signal: context.signal,
      workspaceConfiguration: context.workspaceConfiguration,
    });
    this.#releaseQueue = releaseQueue;
    this.#clearTimeout = clearTimeout;
  }

  async #position(
    document: SourceDocument,
    input: { line?: number; column?: number; symbol?: string },
  ): Promise<LspPosition> {
    if (input.line !== undefined && (!Number.isSafeInteger(input.line) || input.line < 1))
      throw new SignalGrepError("Swift semantic target line must be one-based");
    if (input.column !== undefined && (!Number.isSafeInteger(input.column) || input.column < 1))
      throw new SignalGrepError("Swift semantic target column must be one-based");
    if (input.column !== undefined) {
      if (input.line === undefined)
        throw new SignalGrepError("Swift semantic column requires a line");
      return { line: input.line - 1, character: input.column - 1 };
    }
    if (!input.symbol)
      throw new SignalGrepError("Swift semantic target requires a column or symbol");
    const outline = await this.#rawOutline(document.path);
    const matches: SwiftOutlineItem[] = [];
    const visit = (items: readonly SwiftOutlineItem[]): void => {
      for (const item of items) {
        if (
          item.name === input.symbol &&
          (input.line === undefined || item.selectionRange.start.line + 1 === input.line)
        )
          matches.push(item);
        visit(item.children);
      }
    };
    visit(outline);
    if (matches.length !== 1)
      throw new SignalGrepError(
        matches.length
          ? "Swift semantic target symbol is ambiguous"
          : "Swift semantic target symbol is absent",
      );
    const match = matches[0];
    if (!match) throw new SignalGrepError("Swift semantic target symbol is absent");
    return match.selectionRange.start;
  }

  async #rawOutline(path: string): Promise<SwiftOutlineItem[]> {
    const document = this.#context.documents.get(resolve(this.#cwd, path));
    if (!document) throw new SignalGrepError("Swift outline target is outside admitted source");
    await this.#session.requireOutlineCapability();
    await this.#session.openDocument(document);
    const response = await (
      await this.#session.channel()
    ).request("textDocument/documentSymbol", {
      textDocument: { uri: sourceUri(this.#cwd, document.path) },
    });
    return readSwiftOutline(response);
  }

  async outline(path: string): Promise<readonly RelationshipOutlineItem[]> {
    const document = this.#context.documents.get(resolve(this.#cwd, path));
    if (!document) throw new SignalGrepError("Swift outline target is outside admitted source");
    const convert = (item: SwiftOutlineItem): RelationshipOutlineItem => {
      const range = byteRange(document, item.range);
      const selection = byteRange(document, item.selectionRange);
      return {
        path: document.path,
        name: item.name,
        kind: String(item.kind),
        range,
        start: document.positionAt(selection.start),
        end: document.positionAt(selection.end),
        source: document.reference,
        children: item.children.map(convert),
      };
    };
    return (await this.#rawOutline(path)).map(convert);
  }

  async resolveNode(
    input: { path: string; line?: number; column?: number; symbol?: string },
    signal?: AbortSignal,
  ): Promise<RelationshipResolution> {
    this.assertOpen(signal);
    const document = this.#context.documentForPath(input.path);
    if (!document)
      return {
        status: "unsupported",
        reasons: ["Swift target is outside admitted provider source"],
        dependencies: [],
      };
    let position: LspPosition;
    try {
      position = await this.#position(document, input);
    } catch (error) {
      if (error instanceof SignalGrepError && /ambiguous/iu.test(error.message))
        return {
          status: "ambiguous",
          reasons: [error.message],
          dependencies: [
            sourceDocumentDependency(document),
            toolchainDependency(this.#configurationFingerprint),
          ],
        };
      if (error instanceof SignalGrepError && /absent/iu.test(error.message))
        return {
          status: "unknown",
          reasons: [error.message],
          dependencies: [
            sourceDocumentDependency(document),
            toolchainDependency(this.#configurationFingerprint),
          ],
        };
      throw error;
    }
    await this.#session.openDocument(document);
    const channel = await this.#session.channel();
    await this.#session.requireOperationCapability("definitions");
    const params = { textDocument: { uri: sourceUri(this.#cwd, document.path) }, position };
    const definitions = readLocations(await channel.request("textDocument/definition", params));
    if (definitions.length === 0)
      return {
        status: "unknown",
        reasons: ["SourceKit-LSP returned no definition for the requested Swift symbol"],
        dependencies: [
          sourceDocumentDependency(document),
          toolchainDependency(this.#configurationFingerprint),
        ],
      };
    const candidates = definitions.flatMap((candidate) => {
      const targetDocument = this.#context.documentForPath(candidate.path);
      return targetDocument ? [this.node(candidate, targetDocument, input.symbol)] : [];
    });
    if (definitions.length !== 1)
      return {
        status: "ambiguous",
        candidates,
        reasons: [
          "SourceKit-LSP returned multiple Swift definitions; include a more precise position",
        ],
        dependencies: [
          sourceDocumentDependency(document),
          toolchainDependency(this.#configurationFingerprint),
        ],
      };
    const selected = definitions[0];
    if (!selected) throw new SignalGrepError("SourceKit-LSP definition candidate disappeared");
    const target = this.#context.documentForPath(selected.path);
    if (!target)
      return {
        status: "unknown",
        reasons: ["SourceKit-LSP resolved outside admitted Swift source"],
        dependencies: [
          sourceDocumentDependency(document),
          toolchainDependency(this.#configurationFingerprint),
        ],
      };
    const resolvedName = input.symbol ?? (await this.nodeName(target, selected));
    return {
      status: "resolved",
      node: this.node(selected, target, resolvedName),
      reasons: [],
      dependencies: [
        sourceDocumentDependency(document),
        sourceDocumentDependency(target),
        toolchainDependency(this.#configurationFingerprint),
      ],
    };
  }

  private async nodeName(document: SourceDocument, target: SwiftNode): Promise<string | undefined> {
    const symbols = await this.#rawOutline(document.path);
    const visit = (items: readonly SwiftOutlineItem[]): string | undefined => {
      for (const item of items) {
        if (
          item.selectionRange.start.line === target.selectionRange.start.line &&
          item.selectionRange.start.character === target.selectionRange.start.character
        )
          return item.name;
        const child = visit(item.children);
        if (child) return child;
      }
      return undefined;
    };
    return visit(symbols);
  }

  async expand(
    node: RelationshipNode,
    operation: RelationshipOperation,
    signal?: AbortSignal,
  ): Promise<RelationshipExpansion> {
    this.assertOpen(signal);
    const document = this.#context.documents.get(resolve(this.#cwd, node.path));
    if (!document)
      return {
        edges: [],
        nodes: [],
        unresolved: [
          operationUnresolved(operation, "Swift node source is outside admitted source"),
        ],
        dependencies: [],
        coverage: {
          status: "partial",
          freshness: "unknown",
          sources: [],
          reasons: ["Swift node source is outside admitted source"],
        },
      };
    const indexRequired = isIndexBacked(operation);
    const channel = await this.#session.channel(indexRequired);
    await this.#session.openDocument(document, indexRequired);
    const internal: SwiftNode = {
      id: node.identity.localKey,
      path: document.path,
      uri: sourceUri(this.#cwd, document.path),
      range: {
        start: { line: node.start.line - 1, character: node.start.column - 1 },
        end: {
          line: (node.end?.line ?? node.start.line) - 1,
          character: (node.end?.column ?? node.start.column) - 1,
        },
      },
      selectionRange: {
        start: { line: node.start.line - 1, character: node.start.column - 1 },
        end: {
          line: (node.end?.line ?? node.start.line) - 1,
          character: (node.end?.column ?? node.start.column) - 1,
        },
      },
      name: node.name,
    };
    await this.#session.requireOperationCapability(operation);
    const params = {
      textDocument: { uri: internal.uri },
      position: positionOf(internal),
    };
    const unresolved: RelationshipUnresolved[] = [];
    const rawEdges: SwiftCallEdge[] = [];
    if (indexRequired) await this.#session.synchronizeIndex(this.#context.documents.values());
    if (operation === "callers" || operation === "callees") {
      const prepared = await channel.request("textDocument/prepareCallHierarchy", params);
      if (!Array.isArray(prepared))
        unresolved.push(operationUnresolved(operation, "SourceKit-LSP returned no call hierarchy"));
      else {
        for (const item of prepared) {
          const method =
            operation === "callers" ? "callHierarchy/incomingCalls" : "callHierarchy/outgoingCalls";
          // Keep each hierarchy item ordered so the server index is not mixed.
          // oxlint-disable-next-line no-await-in-loop -- ordering is part of this query.
          const response = await channel.request(method, { item });
          if (!Array.isArray(response)) {
            unresolved.push(
              operationUnresolved(operation, "SourceKit-LSP returned an invalid call hierarchy"),
            );
            continue;
          }
          for (const value of response) {
            if (!rpcRecord(value)) {
              unresolved.push(
                operationUnresolved(operation, "SourceKit-LSP returned an invalid call edge"),
              );
              continue;
            }
            try {
              const endpoint = readSwiftNode(operation === "callers" ? value.from : value.to);
              const callRanges = readCallRanges(value.fromRanges);
              rawEdges.push({
                operation,
                endpoint,
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
      const response = await channel.request(operationMethod(operation), {
        ...params,
        ...(operation === "references" ? { context: { includeDeclaration: true } } : {}),
      });
      for (const candidate of readLocations(response))
        rawEdges.push({ operation, endpoint: candidate });
    }
    const nodes: RelationshipNode[] = [];
    const edges: RelationshipEdge[] = [];
    for (const raw of rawEdges) {
      const endpoint = this.convertNode(raw.endpoint, unresolved, operation);
      if (!endpoint) continue;
      const from =
        operation === "definitions" || operation === "implementations" || operation === "callees"
          ? node
          : endpoint;
      const to =
        operation === "definitions" || operation === "implementations" || operation === "callees"
          ? endpoint
          : node;
      const ranges = raw.callRanges?.length ? raw.callRanges : [undefined];
      for (const [index, range] of ranges.entries()) {
        const callSite = range
          ? this.callSite(operation === "callers" ? raw.endpoint : internal, range)
          : undefined;
        const edgeKey =
          operation +
          ":" +
          relationshipNodeKey(from) +
          "->" +
          relationshipNodeKey(to) +
          ":" +
          String(index);
        const paths = new Set([from.path, to.path, ...(callSite ? [callSite.path] : [])]);
        this.#edgePaths.set(edgeKey, paths);
        edges.push({
          edgeKey,
          operation,
          from,
          to,
          ...(callSite ? { callSite } : {}),
          evidence: [evidence(relationReason(operation))],
          confidence: "verified-static",
          dependencies: [...paths]
            .map((path) => this.#context.documents.get(resolve(this.#cwd, path)))
            .filter((item): item is SourceDocument => item !== undefined)
            .map(sourceDocumentDependency)
            .concat(toolchainDependency(this.#configurationFingerprint)),
        });
        nodes.push(from, to);
      }
    }
    return {
      edges: [...new Map(edges.map((edge) => [edge.edgeKey, edge])).values()],
      nodes: [...new Map(nodes.map((item) => [relationshipNodeKey(item), item])).values()],
      unresolved,
      dependencies: [
        sourceDocumentDependency(document),
        toolchainDependency(this.#configurationFingerprint),
      ],
      coverage: {
        status: this.#context.initialCoveragePartial || unresolved.length ? "partial" : "complete",
        freshness: "current",
        sources: currentSourceStatuses(
          this.#context.documents.values(),
          this.#configurationFingerprint,
        ),
        reasons: [
          ...new Set([
            ...this.#context.initialReasons,
            relationReason(operation),
            ...unresolved.map((item) => item.reason),
          ]),
        ],
      },
    };
  }

  async recheck(signal?: AbortSignal): Promise<RelationshipRecheck> {
    this.assertOpen(signal);
    const result = await this.#context.recheck();
    if (result.configurationChanged || result.inventoryUnknown) this.#session.invalidateIndex();
    return {
      validity: result.validity,
      coverage: result.coverage,
      sources: result.sources,
      affectedNodeKeys:
        result.configurationChanged || result.inventoryUnknown
          ? [...this.#nodes.keys()]
          : [...this.#nodes.entries()]
              .filter(([, path]) => result.stalePaths.has(path))
              .map(([key]) => key),
      affectedEdgeKeys:
        result.configurationChanged || result.inventoryUnknown
          ? [...this.#edgePaths.keys()]
          : [...this.#edgePaths.entries()]
              .filter(([, paths]) => [...paths].some((path) => result.stalePaths.has(path)))
              .map(([key]) => key),
      reasons: [...result.reasons],
    };
  }

  close(): Promise<void> {
    if (!this.#closePromise) this.#closePromise = this.closeOnce();
    return this.#closePromise;
  }

  private async closeOnce(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    try {
      await this.#session.close();
    } catch (error) {
      if (this.#signal.aborted) throw abortError();
      throw error;
    } finally {
      this.#clearTimeout();
      this.#releaseQueue();
    }
  }

  private node(
    internal: SwiftNode,
    document: SourceDocument,
    fallbackName?: string,
  ): RelationshipNode {
    const range = byteRange(document, internal.range);
    const selection = byteRange(document, internal.selectionRange);
    const localKey = document.path + ":" + String(selection.start) + ":" + String(selection.end);
    const fallback = fallbackName ?? (document.slice(selection) || document.path);
    const node: RelationshipNode = {
      identity: {
        providerId: SWIFT_SEMANTIC_PROVIDER_ID,
        analysisViewId: this.analysisViewId,
        sourceScope: this.sourceScope.root,
        localKey,
      },
      path: document.path,
      name: internal.name ?? fallback,
      kind: internal.kind === undefined ? "unknown" : String(internal.kind),
      range,
      start: document.positionAt(selection.start),
      end: document.positionAt(selection.end),
      source: document.reference,
      evidence: [evidence("SourceKit-LSP Swift compiler navigation result")],
    };
    this.#nodes.set(relationshipNodeKey(node), document.path);
    return node;
  }

  private convertNode(
    internal: SwiftNode,
    unresolved: RelationshipUnresolved[],
    operation: RelationshipOperation,
  ): RelationshipNode | undefined {
    const document = this.#context.documentForPath(internal.path);
    if (!document) {
      unresolved.push(
        operationUnresolved(
          operation,
          "SourceKit-LSP result is outside admitted Swift source: " + internal.path,
        ),
      );
      return undefined;
    }
    return this.node(internal, document);
  }

  private callSite(endpoint: SwiftNode, range: LspRange): RelationshipSourceLocation | undefined {
    const document = this.#context.documentForPath(endpoint.path);
    return document ? sourceLocation(document, range) : undefined;
  }

  private assertOpen(signal?: AbortSignal): void {
    if (this.#closed) throw new SignalGrepError("Swift relationship view is closed");
    if (signal?.aborted || this.#signal.aborted) throw abortError();
  }
}

export const swiftSemanticProvider: RelationshipProvider = {
  providerId: SWIFT_SEMANTIC_PROVIDER_ID,
  async open(options): Promise<RelationshipView> {
    const releaseQueue = await providerQueue.acquire(options.signal);
    const deadline = new AbortController();
    const sessionSignal = AbortSignal.any([options.signal, deadline.signal]);
    const timeout = setTimeout(() => deadline.abort(), SWIFT_SEMANTIC_QUERY_TIMEOUT_MS);
    const clearTimeoutHandle = () => clearTimeout(timeout);
    const viewOptions = { ...options, signal: sessionSignal };
    try {
      const context = await SwiftSourceContext.open(viewOptions);
      return new SwiftRelationshipView(viewOptions, context, releaseQueue, clearTimeoutHandle);
    } catch (error) {
      deadline.abort();
      clearTimeoutHandle();
      releaseQueue();
      throw error;
    }
  },
};

/** Narrow type guard used by core analysis to request outline evidence. */
export function swiftOutlineView(
  view: RelationshipView,
): view is RelationshipView & SwiftOutlineView {
  return view.providerId === SWIFT_SEMANTIC_PROVIDER_ID && view instanceof SwiftRelationshipView;
}
