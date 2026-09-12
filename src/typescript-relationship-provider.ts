import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { abortError, SignalGrepError } from "./errors.js";
import { semanticProject } from "./semantic-project.js";
import { semanticSources } from "./semantic-sources.js";
import {
  byteRange,
  lspPosition,
  lspRange,
  locations,
  semanticLocation,
  type LspPosition,
  type LspRange,
} from "./semantic-protocol.js";
import type { SourceAccess } from "./source-access.js";
import type { SourceDocument } from "./source-document.js";
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
  RelationshipValidity,
  RelationshipView,
} from "./relationship-types.js";
import { relationshipNodeKey } from "./relationship-types.js";
import { relationshipRecheck } from "./evidence-validity.js";
import { SourceDocumentError } from "./source-document.js";
import { withTypeScript } from "./typescript-client.js";
import type { JsonRpcChannel } from "./owned-json-rpc.js";
import type { SyntaxAnalysis, SyntaxSymbol } from "./syntax-types.js";

const TYPESCRIPT_PROVIDER_ID = "typescript";

interface CompilerCallItem {
  name: string;
  kind: string | number;
  uri: string;
  range: LspRange;
  selectionRange: LspRange;
  [key: string]: unknown;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}

function callItem(value: unknown): CompilerCallItem | undefined {
  const item = record(value);
  if (
    !item ||
    typeof item.name !== "string" ||
    (typeof item.kind !== "string" && typeof item.kind !== "number")
  )
    return undefined;
  const uri = typeof item.uri === "string" ? item.uri : undefined;
  const rangeValue = item.range;
  const selectionValue = item.selectionRange ?? rangeValue;
  if (!uri || !rangeValue || !selectionValue) return undefined;
  return {
    ...item,
    name: item.name,
    kind: item.kind,
    uri,
    range: lspRange(rangeValue),
    selectionRange: lspRange(selectionValue),
  };
}

function sourceRange(document: SourceDocument, range: LspRange): RelationshipSourceLocation {
  const bytes = byteRange(document, range);
  return {
    path: document.path,
    range: bytes,
    start: document.positionAt(bytes.start),
    end: document.positionAt(bytes.end),
    source: document.reference,
  };
}

function symbolAt(document: SourceDocument, symbol: SyntaxSymbol): RelationshipSourceLocation {
  return sourceRange(document, {
    start: lspPosition(document, symbol.start),
    end: lspPosition(document, symbol.end),
  });
}

function lspAtByte(document: SourceDocument, byte: number): LspPosition {
  const position = document.positionAt(byte);
  return { line: position.line - 1, character: position.column - 1 };
}

function operationMethod(operation: RelationshipOperation): string {
  return operation === "definitions"
    ? "textDocument/definition"
    : operation === "implementations"
      ? "textDocument/implementation"
      : "textDocument/references";
}

function operationEvidence(operation: RelationshipOperation): RelationshipEvidence {
  return {
    level: "compiler",
    basis: "semantic",
    providerBasis: "typescript-language-service",
    reason: `TypeScript language service ${operation} result; static binding does not prove runtime dispatch`,
  };
}

function dependencies(
  documents: readonly SourceDocument[],
  metadata: readonly SourceDocument[],
): RelationshipDependency[] {
  return [
    ...documents.map((document) => ({
      path: document.path,
      role: "source" as const,
      reference: document.reference,
    })),
    ...metadata.map((document) => ({
      path: document.path,
      role: /(?:^|\/)package\.json$/iu.test(document.path)
        ? ("manifest" as const)
        : ("config" as const),
      reference: document.reference,
    })),
  ];
}

function currentStatuses(
  dependenciesList: readonly RelationshipDependency[],
  status: RelationshipValidity,
  reason?: string,
): RelationshipSourceStatus[] {
  return dependenciesList.map((dependency) => ({
    path: dependency.path,
    role: dependency.role,
    status,
    ...(dependency.reference ? { expected: dependency.reference } : {}),
    ...(reason === undefined ? {} : { reason }),
  }));
}

function inputPosition(document: SourceDocument, input: { line: number; column?: number }): number {
  if (!Number.isSafeInteger(input.line) || input.line < 1)
    throw new SignalGrepError("Semantic line must be a positive integer");
  const line = document.lineRange(input.line);
  if (input.column === undefined) return document.toCharacterOffset(line.start);
  if (!Number.isSafeInteger(input.column) || input.column < 1)
    throw new SignalGrepError("Semantic column must be a positive integer");
  const position = document.toCharacterOffset(line.start) + input.column - 1;
  document.toByteOffset(position);
  return position;
}

function candidatesFor(
  document: SourceDocument,
  syntax: SyntaxAnalysis,
  input: { line: number; column?: number; symbol?: string },
): SyntaxSymbol[] {
  const character = inputPosition(document, input);
  return syntax.symbols.filter((candidate) => {
    const line = document.lineAt(document.toByteOffset(candidate.start));
    const bySymbol = input.symbol === undefined || candidate.name === input.symbol;
    const byLine = input.line === undefined || line === input.line;
    const byCharacter =
      input.column === undefined || (candidate.start <= character && character <= candidate.end);
    return bySymbol && byLine && byCharacter && candidate.hasBody;
  });
}

class TypeScriptRelationshipView implements RelationshipView {
  readonly providerId = TYPESCRIPT_PROVIDER_ID;
  readonly analysisViewId: string;
  readonly sourceScope: RelationshipProviderOptions["scope"];
  readonly #access: SourceAccess;
  readonly #documents: SourceDocument[];
  readonly #cwd: string;
  readonly #projectRecheck: () => Promise<void>;
  readonly #sourceAt: (path: string) => Promise<SourceDocument | undefined>;
  readonly #dependencies: RelationshipDependency[];
  readonly #nodes = new Map<string, RelationshipNode>();
  readonly #edges = new Map<string, RelationshipEdge>();
  #closed = false;

  constructor(
    options: RelationshipProviderOptions,
    access: SourceAccess,
    documents: SourceDocument[],
    metadata: SourceDocument[],
    projectRecheck: () => Promise<void>,
    sourceAt: (path: string) => Promise<SourceDocument | undefined>,
  ) {
    this.analysisViewId = options.analysisViewId ?? randomUUID();
    this.sourceScope = options.scope;
    this.#cwd = options.cwd;
    this.#access = access;
    this.#documents = documents;
    this.#projectRecheck = projectRecheck;
    this.#sourceAt = sourceAt;
    this.#dependencies = dependencies(documents, metadata);
  }

  #query<T>(operation: (channel: JsonRpcChannel) => Promise<T>): Promise<T> {
    return withTypeScript(
      this.#cwd,
      this.#documents,
      async (channel) => operation(channel),
      this.#access.signal,
      this.#cwd,
    );
  }

  #assertOpen(signal?: AbortSignal): void {
    if (this.#closed) throw new SignalGrepError("Relationship analysis view is closed");
    if (signal?.aborted || this.#access.signal?.aborted) throw abortError();
  }

  #node(
    document: SourceDocument,
    location: RelationshipSourceLocation,
    name: string,
  ): RelationshipNode {
    const node: RelationshipNode = {
      identity: {
        providerId: this.providerId,
        analysisViewId: this.analysisViewId,
        sourceScope: JSON.stringify(this.sourceScope),
        localKey: `${document.path}:${location.range.start}:${location.range.end}:${name}`,
      },
      path: document.path,
      name,
      kind: "function",
      range: location.range,
      start: location.start,
      ...(location.end ? { end: location.end } : {}),
      source: document.reference,
      evidence: [operationEvidence("references")],
    };
    this.#nodes.set(relationshipNodeKey(node), node);
    return node;
  }

  async resolveNode(
    input: { path: string; line: number; column?: number; symbol?: string },
    signal?: AbortSignal,
  ): Promise<RelationshipResolution> {
    this.#assertOpen(signal);
    const document = await this.#sourceAt(input.path);
    if (!document) {
      return {
        status: "unknown",
        reasons: [`Semantic source is outside the admitted TypeScript project: ${input.path}`],
        dependencies: [{ path: input.path, role: "source", reason: "source-not-admitted" }],
      };
    }
    const syntax = await this.#access.syntax(document);
    if (syntax.status !== "ok") {
      return {
        status: "unsupported",
        reasons: [`Cannot resolve a TypeScript symbol because syntax is ${syntax.status}`],
        dependencies: this.#dependencies,
      };
    }
    const candidates = candidatesFor(document, syntax, input);
    if (candidates.length !== 1) {
      return {
        status: candidates.length === 0 ? "unknown" : "ambiguous",
        ...(candidates.length
          ? {
              candidates: candidates.map((candidate) =>
                this.#node(document, symbolAt(document, candidate), candidate.name),
              ),
            }
          : {}),
        reasons: [
          `Semantic target is ${candidates.length === 0 ? "absent" : "ambiguous"}; supply an exact line and UTF-16 column`,
        ],
        dependencies: this.#dependencies,
      };
    }
    const candidate = candidates[0];
    if (!candidate) throw new Error("Missing semantic candidate");
    let location = symbolAt(document, candidate);
    let nodeDocument = document;
    let name = candidate.name;
    try {
      const prepared = await this.#query((channel) =>
        channel.request("textDocument/prepareCallHierarchy", {
          textDocument: { uri: pathToFileURL(resolve(this.#cwd, document.path)).href },
          position: lspPosition(document, candidate.start),
        }),
      );
      if (Array.isArray(prepared)) {
        const preparedItems = prepared
          .map(callItem)
          .filter((item): item is CompilerCallItem => item !== undefined);
        const selected =
          preparedItems.find(
            (item) =>
              item.selectionRange.start.line <= document.lineAt(candidate.start) - 1 &&
              item.selectionRange.end.line >= document.lineAt(candidate.start) - 1,
          ) ?? preparedItems[0];
        if (selected) {
          const selectedLocation = semanticLocation({
            targetUri: selected.uri,
            targetSelectionRange: selected.selectionRange,
          });
          const selectedDocument = await this.#sourceAt(selectedLocation.path);
          if (selectedDocument) {
            location = sourceRange(selectedDocument, selectedLocation.range);
            nodeDocument = selectedDocument;
            name = selected.name;
          }
        }
      }
    } catch (error) {
      if (error instanceof SignalGrepError && error.message.includes("Invalid TypeScript"))
        throw error;
      // Some compiler symbol kinds intentionally have no call hierarchy item;
      // the verified syntax symbol remains a valid navigation anchor.
    }
    return {
      status: "resolved",
      node: this.#node(nodeDocument, location, name),
      reasons: [],
      dependencies: this.#dependencies,
    };
  }

  async expand(
    node: RelationshipNode,
    operation: RelationshipOperation,
    signal?: AbortSignal,
  ): Promise<RelationshipExpansion> {
    this.#assertOpen(signal);
    const document = await this.#sourceAt(node.path);
    if (!document)
      return {
        edges: [],
        nodes: [],
        unresolved: [
          {
            operation,
            reason: `Source is no longer admitted: ${node.path}`,
            confidence: "unknown",
          },
        ],
        dependencies: this.#dependencies,
        coverage: {
          status: "partial",
          freshness: "unknown",
          sources: currentStatuses(this.#dependencies, "unknown", "source-not-admitted"),
          reasons: [`Source is no longer admitted: ${node.path}`],
        },
      };
    const textDocument = {
      uri: await this.#uri(document),
      position: lspAtByte(document, node.range.start),
    };
    const edges: RelationshipEdge[] = [];
    const nodes: RelationshipNode[] = [];
    const unresolved: RelationshipUnresolved[] = [];
    if (operation === "callers" || operation === "callees") {
      const prepared = await this.#query((channel) =>
        channel.request("textDocument/prepareCallHierarchy", {
          textDocument,
          position: textDocument.position,
        }),
      );
      if (prepared === null) {
        unresolved.push({
          operation,
          reason: "Compiler did not provide call hierarchy for this symbol",
          confidence: "unknown",
        });
      } else if (!Array.isArray(prepared)) {
        throw new SignalGrepError("Invalid TypeScript call hierarchy response");
      } else {
        for (const value of prepared) {
          const item = callItem(value);
          if (!item) throw new SignalGrepError("Invalid TypeScript call hierarchy item");
          const method =
            operation === "callers" ? "callHierarchy/incomingCalls" : "callHierarchy/outgoingCalls";
          // oxlint-disable-next-line no-await-in-loop -- call hierarchy requests must stay ordered by the compiler response.
          const response = await this.#query((channel) => channel.request(method, { item }));
          if (response === null) continue;
          if (!Array.isArray(response))
            throw new SignalGrepError("Invalid TypeScript call relationship response");
          for (const raw of response) {
            const call = record(raw);
            if (!call) throw new SignalGrepError("Invalid TypeScript call relationship");
            const from = record(call.from);
            const to = record(call.to);
            const sourceValue = operation === "callers" ? from : to;
            if (!sourceValue) continue;
            const location = semanticLocation(sourceValue);
            // oxlint-disable-next-line no-await-in-loop -- source admission follows each compiler location.
            const targetDocument = await this.#sourceAt(location.path);
            if (!targetDocument) {
              unresolved.push({
                operation,
                reason: `Compiler location is outside admitted sources: ${location.path}`,
                confidence: "unknown",
              });
              continue;
            }
            const targetLocation = sourceRange(targetDocument, location.range);
            const related = this.#node(
              targetDocument,
              targetLocation,
              targetDocument.slice(targetLocation.range),
            );
            nodes.push(related);
            const fromNode = operation === "callers" ? related : node;
            const toNode = operation === "callers" ? node : related;
            // oxlint-disable-next-line no-await-in-loop -- resolve the caller document before mapping its ranges.
            const callerDocument = await this.#sourceAt(
              from?.uri ? semanticLocation(from).path : document.path,
            );
            const ranges = Array.isArray(call.fromRanges) ? call.fromRanges : [];
            for (const rawRange of ranges.length ? ranges : [undefined]) {
              const callSite =
                rawRange === undefined || !callerDocument
                  ? undefined
                  : sourceRange(callerDocument, lspRange(rawRange));
              edges.push({
                edgeKey: JSON.stringify([
                  operation,
                  relationshipNodeKey(fromNode),
                  relationshipNodeKey(toNode),
                  callSite?.range ?? targetLocation.range,
                ]),
                operation,
                from: fromNode,
                to: toNode,
                ...(callSite ? { callSite } : {}),
                evidence: [operationEvidence(operation)],
                confidence: "verified-static",
                dependencies: this.#dependencies,
              });
            }
          }
        }
      }
    } else {
      const response = await this.#query((channel) =>
        channel.request(operationMethod(operation), {
          textDocument,
          position: textDocument.position,
          ...(operation === "references" ? { context: { includeDeclaration: true } } : {}),
        }),
      );
      for (const location of locations(response)) {
        // oxlint-disable-next-line no-await-in-loop -- source admission follows each compiler location.
        const targetDocument = await this.#sourceAt(location.path);
        if (!targetDocument) {
          unresolved.push({
            operation,
            source: {
              path: location.path,
              range: { start: 0, end: 0 },
              start: { line: 1, column: 1 },
            },
            reason: `Compiler location is outside admitted sources: ${location.path}`,
            confidence: "unknown",
          });
          continue;
        }
        const targetLocation = sourceRange(targetDocument, location.range);
        const related = this.#node(
          targetDocument,
          targetLocation,
          targetDocument.slice(targetLocation.range),
        );
        nodes.push(related);
        edges.push({
          edgeKey: JSON.stringify([
            operation,
            relationshipNodeKey(node),
            relationshipNodeKey(related),
            targetLocation.range,
          ]),
          operation,
          from: operation === "definitions" || operation === "implementations" ? node : related,
          to: operation === "definitions" || operation === "implementations" ? related : node,
          evidence: [operationEvidence(operation)],
          confidence: "verified-static",
          dependencies: this.#dependencies,
        });
      }
    }
    const uniqueEdges = [...new Map(edges.map((edge) => [edge.edgeKey, edge])).values()];
    const uniqueNodes = [
      ...new Map(nodes.map((item) => [relationshipNodeKey(item), item])).values(),
    ];
    for (const edge of uniqueEdges) this.#edges.set(edge.edgeKey, edge);
    const reasons = unresolved.map((item) => item.reason);
    const freshness: RelationshipValidity =
      uniqueEdges.length || unresolved.length ? "current" : "unknown";
    return {
      edges: uniqueEdges,
      nodes: uniqueNodes,
      unresolved,
      dependencies: this.#dependencies,
      coverage: {
        status: unresolved.length ? "partial" : "complete",
        freshness,
        sources: currentStatuses(this.#dependencies, freshness),
        reasons,
      },
    };
  }

  async recheck(signal?: AbortSignal): Promise<RelationshipRecheck> {
    this.#assertOpen(signal);
    const statuses: RelationshipSourceStatus[] = [];
    const affectedPaths = new Set<string>();
    for (const dependency of this.#dependencies) {
      this.#assertOpen(signal);
      if (!dependency.reference) {
        statuses.push({
          path: dependency.path,
          role: dependency.role,
          status: "unknown",
          reason: "Missing captured source reference",
        });
        continue;
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- dependencies are rechecked under one bounded source budget.
        const refreshed = await this.#access.refresh(dependency.path, dependency.reference);
        statuses.push({
          path: dependency.path,
          role: dependency.role,
          status: "current",
          expected: dependency.reference,
          current: refreshed.reference,
        });
      } catch (error) {
        if (error instanceof SourceDocumentError) {
          const status: RelationshipValidity =
            error.reason === "source-changed" ? "stale" : "unknown";
          statuses.push({
            path: dependency.path,
            role: dependency.role,
            status,
            expected: dependency.reference,
            reason: error.message,
          });
          if (status === "stale") affectedPaths.add(dependency.path);
          continue;
        }
        throw error;
      }
    }
    try {
      await this.#projectRecheck();
    } catch (error) {
      if (
        error instanceof SignalGrepError &&
        error.message.includes("Workspace file set changed")
      ) {
        for (const dependency of this.#dependencies) {
          const current = statuses.find((status) => status.path === dependency.path);
          if (current?.status === "current") {
            current.status = "stale";
            current.reason = "Workspace file inventory changed during recheck";
            affectedPaths.add(current.path);
          }
        }
      } else throw error;
    }
    const affectedNodeKeys = [...this.#nodes.values()]
      .filter((node) => affectedPaths.has(node.path))
      .map(relationshipNodeKey);
    const affectedEdgeKeys = [...this.#edges.values()]
      .filter((edge) => affectedPaths.has(edge.from.path) || affectedPaths.has(edge.to.path))
      .map((edge) => edge.edgeKey);
    const reasons = statuses
      .filter((status) => status.reason)
      .map((status) => `${status.path}: ${status.reason}`);
    return relationshipRecheck(
      statuses,
      affectedNodeKeys,
      affectedEdgeKeys,
      reasons,
      statuses.some((status) => status.status !== "current") ? "partial" : "complete",
    );
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
  }

  async #uri(document: SourceDocument): Promise<string> {
    const path = resolve(this.#cwd, document.path);
    return pathToFileURL(path).href;
  }
}

export function createTypeScriptRelationshipProvider(access: SourceAccess): RelationshipProvider {
  return {
    providerId: TYPESCRIPT_PROVIDER_ID,
    async open(options) {
      if (options.cwd !== access.cwd)
        throw new SignalGrepError("TypeScript provider cwd does not match SourceAccess");
      const project = await semanticProject(access, options.scope.root, true, {
        ...(options.scope.include ? { glob: [...options.scope.include] } : {}),
        ...(options.scope.exclude ? { exclude: [...options.scope.exclude] } : {}),
        ...(options.scope.hidden === undefined ? {} : { hidden: options.scope.hidden }),
      });
      const documents = [...project.documents.values()];
      const sourceAt = await semanticSources(options.cwd, documents);
      return new TypeScriptRelationshipView(
        options,
        access,
        documents,
        project.metadata,
        project.recheckInventory,
        sourceAt,
      );
    },
  };
}

export { TYPESCRIPT_PROVIDER_ID };
