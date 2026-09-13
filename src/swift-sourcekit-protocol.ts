/**
 * SourceKit-LSP facts used here are checked against the Swift project's
 * protocol and configuration documentation:
 *
 * - https://github.com/swiftlang/sourcekit-lsp/blob/main/Contributor%20Documentation/LSP%20Extensions.md
 * - https://github.com/swiftlang/sourcekit-lsp/blob/main/Contributor%20Documentation/Background%20Indexing.md
 * - https://github.com/swiftlang/sourcekit-lsp/blob/main/Documentation/Configuration%20File.md
 * - https://microsoft.github.io/language-server-protocol/
 *
 * A documented method remains unavailable to callers until the running
 * SourceKit-LSP server advertises it during initialization.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SignalGrepError } from "./errors.js";
import { rpcRecord } from "./owned-json-rpc.js";
import { byteRange, lspRange, type LspPosition, type LspRange } from "./semantic-protocol.js";
import type { SourceDocument } from "./source-document.js";
import type {
  RelationshipDependency,
  RelationshipEvidence,
  RelationshipOperation,
  RelationshipSourceLocation,
  RelationshipSourceStatus,
  RelationshipUnresolved,
} from "./relationship-types.js";

export const SWIFT_SEMANTIC_PROVIDER_ID = "sourcekit-lsp-swift";
export const SWIFT_SEMANTIC_QUERY_TIMEOUT_MS = 60_000;
export const SWIFT_TOOLCHAIN_PATH = "swift:sourcekit-lsp";

const swiftSource = /\.swift$/iu;

export interface SwiftOutlineItem {
  name: string;
  kind: number;
  range: LspRange;
  selectionRange: LspRange;
  children: SwiftOutlineItem[];
}

export interface SwiftRuntimeCapabilities {
  outline: boolean;
  advertised: readonly RelationshipOperation[];
  experimental: readonly string[];
  indexBarrier: "unknown" | "verified";
  reasons: readonly string[];
}

export interface SwiftWorkspaceConfiguration {
  readonly path: string;
  readonly fingerprint: string;
  readonly initializationOptions: Record<string, unknown>;
}

export type SwiftNode = {
  id: string;
  path: string;
  uri: string;
  range: LspRange;
  selectionRange: LspRange;
  name?: string;
  kind?: number;
};

export type SwiftCallEdge = {
  operation: RelationshipOperation;
  endpoint: SwiftNode;
  callRanges?: LspRange[];
};

export function executablePath(): string {
  const configured = process.env.BAOER_SIGNAL_GREP_SOURCEKIT_LSP_PATH?.trim();
  if (!configured) return "sourcekit-lsp";
  if (!isAbsolute(configured))
    throw new SignalGrepError("BAOER_SIGNAL_GREP_SOURCEKIT_LSP_PATH must be absolute");
  return configured;
}

export function sourcePath(uri: unknown): string {
  if (typeof uri !== "string" || !uri.startsWith("file:"))
    throw new SignalGrepError("SourceKit-LSP returned a non-file URI");
  try {
    return fileURLToPath(uri);
  } catch (error) {
    throw new SignalGrepError("SourceKit-LSP returned an invalid file URI", { cause: error });
  }
}

export function sourceUri(cwd: string, path: string): string {
  return pathToFileURL(resolve(cwd, path)).href;
}

export function sourceDocumentDependency(document: SourceDocument): RelationshipDependency {
  return { path: document.path, role: "source", reference: document.reference, exists: true };
}

export function toolchainDependency(fingerprint: string): RelationshipDependency {
  return { path: SWIFT_TOOLCHAIN_PATH, role: "config", fingerprint, exists: true };
}

export function sourceLocation(
  document: SourceDocument,
  range: LspRange,
): RelationshipSourceLocation {
  const rangeBytes = byteRange(document, range);
  return {
    path: document.path,
    range: rangeBytes,
    start: document.positionAt(rangeBytes.start),
    end: document.positionAt(rangeBytes.end),
    source: document.reference,
  };
}

export function evidence(reason: string): RelationshipEvidence {
  return {
    reason,
    level: "compiler",
    basis: "semantic",
    providerBasis: SWIFT_SEMANTIC_PROVIDER_ID,
  };
}

export function operationMethod(operation: RelationshipOperation): string {
  switch (operation) {
    case "definitions":
      return "textDocument/definition";
    case "references":
      return "textDocument/references";
    case "implementations":
      return "textDocument/implementation";
    default:
      throw new SignalGrepError("Unsupported Swift LSP operation: " + operation);
  }
}

export function relationReason(operation: RelationshipOperation): string {
  if (operation === "callers" || operation === "callees")
    return "SourceKit-LSP indexed call hierarchy; dynamic dispatch is not runtime proof";
  return "SourceKit-LSP compiler-bound " + operation + " result";
}

export function operationUnresolved(
  operation: RelationshipOperation,
  reason: string,
): RelationshipUnresolved {
  return { operation, reason, confidence: "unknown" };
}

function recordString(value: unknown, key: string): string | undefined {
  return rpcRecord(value) && typeof value[key] === "string" ? value[key] : undefined;
}

function recordNumber(value: unknown, key: string): number | undefined {
  return rpcRecord(value) && typeof value[key] === "number" && Number.isSafeInteger(value[key])
    ? value[key]
    : undefined;
}

export function readSwiftNode(value: unknown): SwiftNode {
  if (!rpcRecord(value)) throw new SignalGrepError("Invalid SourceKit-LSP navigation item");
  const uri = recordString(value, "uri") ?? recordString(value, "targetUri");
  if (!uri) throw new SignalGrepError("SourceKit-LSP navigation item has no URI");
  const range = lspRange(value.range ?? value.targetRange ?? value.selectionRange);
  const selectionRange = lspRange(value.selectionRange ?? value.targetSelectionRange ?? range);
  const name = recordString(value, "name");
  const kind = recordNumber(value, "kind");
  return {
    id:
      uri +
      ":" +
      String(selectionRange.start.line) +
      ":" +
      String(selectionRange.start.character) +
      ":" +
      String(selectionRange.end.line) +
      ":" +
      String(selectionRange.end.character),
    path: sourcePath(uri),
    uri,
    range,
    selectionRange,
    ...(name ? { name } : {}),
    ...(kind === undefined ? {} : { kind }),
  };
}

export function readLocations(value: unknown): SwiftNode[] {
  if (value === null) return [];
  return (Array.isArray(value) ? value : [value]).map(readSwiftNode);
}

export function readCallRanges(value: unknown): LspRange[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((range) => lspRange(range));
}

function readOutlineItem(value: unknown): SwiftOutlineItem {
  if (!rpcRecord(value) || typeof value.name !== "string")
    throw new SignalGrepError("Invalid SourceKit-LSP document symbol");
  const range = lspRange(value.range);
  const selectionRange = lspRange(value.selectionRange ?? value.range);
  const kind = recordNumber(value, "kind");
  if (kind === undefined) throw new SignalGrepError("SourceKit-LSP document symbol has no kind");
  const children = value.children ?? [];
  if (!Array.isArray(children))
    throw new SignalGrepError("Invalid SourceKit-LSP document symbol children");
  return { name: value.name, kind, range, selectionRange, children: children.map(readOutlineItem) };
}

export function readSwiftOutline(value: unknown): SwiftOutlineItem[] {
  if (!Array.isArray(value)) throw new SignalGrepError("Invalid SourceKit-LSP document symbols");
  return value.map(readOutlineItem);
}

export function readCapabilities(value: unknown): SwiftRuntimeCapabilities {
  if (!rpcRecord(value) || !rpcRecord(value.capabilities))
    throw new SignalGrepError("SourceKit-LSP initialize response has no capabilities");
  const capabilities = value.capabilities;
  const has = (key: string): boolean =>
    capabilities[key] !== undefined && capabilities[key] !== false;
  const advertised: RelationshipOperation[] = [];
  if (has("definitionProvider")) advertised.push("definitions");
  if (has("referencesProvider")) advertised.push("references");
  if (has("implementationProvider")) advertised.push("implementations");
  if (has("callHierarchyProvider")) advertised.push("callers", "callees");
  const experimental = rpcRecord(capabilities.experimental)
    ? Object.keys(capabilities.experimental).toSorted()
    : [];
  const reasons: string[] = [];
  if (advertised.some((operation) => ["references", "callers", "callees"].includes(operation)))
    reasons.push("Index-backed operations require workspace synchronize(index=true)");
  return {
    outline: has("documentSymbolProvider"),
    advertised: [...new Set(advertised)],
    experimental,
    indexBarrier: "unknown",
    reasons,
  };
}

export function configurationFingerprint(executable: string, workspaceFingerprint: string): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        executable,
        backgroundIndexing: "request-dependent",
        swiftPM: { forceResolvedVersions: true, extraArguments: ["--skip-update"] },
        workspaceFingerprint,
      }),
    )
    .digest("hex");
}

export async function readSwiftWorkspaceConfiguration(
  cwd: string,
  root: string,
): Promise<SwiftWorkspaceConfiguration> {
  const path = resolve(cwd, root, ".sourcekit-lsp", "config.json");
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {
        path,
        fingerprint: "absent",
        initializationOptions: {
          backgroundIndexing: false,
          swiftPM: { forceResolvedVersions: true, extraArguments: ["--skip-update"] },
        },
      };
    }
    throw new SignalGrepError("Unable to read the Swift workspace SourceKit-LSP configuration", {
      cause: error,
    });
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new SignalGrepError("Swift workspace SourceKit-LSP configuration is not valid JSON", {
      cause: error,
    });
  }
  if (!rpcRecord(value))
    throw new SignalGrepError("Swift workspace SourceKit-LSP configuration must be an object");
  const swiftPM = rpcRecord(value.swiftPM) ? value.swiftPM : undefined;
  if (value.backgroundIndexing === true)
    throw new SignalGrepError(
      "Swift workspace SourceKit-LSP configuration enables backgroundIndexing; relationship indexing requires explicit preparation",
    );
  if (swiftPM?.forceResolvedVersions === false)
    throw new SignalGrepError(
      "Swift workspace SourceKit-LSP configuration disables forceResolvedVersions; dependency resolution is not locked",
    );
  if (swiftPM?.extraArguments !== undefined) {
    if (
      !Array.isArray(swiftPM.extraArguments) ||
      !swiftPM.extraArguments.every((item) => typeof item === "string") ||
      !swiftPM.extraArguments.includes("--skip-update")
    )
      throw new SignalGrepError(
        "Swift workspace SourceKit-LSP extraArguments must include --skip-update",
      );
  }
  return {
    path,
    fingerprint: createHash("sha256").update(text).digest("hex"),
    initializationOptions: {
      backgroundIndexing: false,
      swiftPM: { forceResolvedVersions: true, extraArguments: ["--skip-update"] },
    },
  };
}

export function isAdmittedSwiftFile(path: string): boolean {
  return swiftSource.test(path);
}

export function documentRole(path: string): "source" | "manifest" {
  return /(?:^|\/)Package\.swift$/iu.test(path) ? "manifest" : "source";
}

export function sourceStatus(
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

export function currentSourceStatuses(
  documents: Iterable<SourceDocument>,
  fingerprint: string,
): RelationshipSourceStatus[] {
  return [
    ...[...documents].map((document) => sourceStatus(document, "current")),
    { path: SWIFT_TOOLCHAIN_PATH, role: "config", status: "current", reason: fingerprint },
  ];
}

export function positionOf(node: SwiftNode): LspPosition {
  return node.selectionRange.start;
}

export function sourceKitRequestCapabilities(): Record<string, unknown> {
  return {
    general: { positionEncodings: ["utf-16"] },
    workspace: { workspaceFolders: true, configuration: true },
    textDocument: {
      definition: { linkSupport: true },
      references: {},
      implementation: { linkSupport: true },
      documentSymbol: {},
      callHierarchy: {},
    },
    experimental: {
      "sourcekit/isIndexing": { supported: true },
      "sourceKit/_isIndexing": { supported: true },
      "sourcekit/workspace/synchronize": { supported: true },
      "workspace/synchronize": { supported: true },
      "sourcekit/workspace/triggerReindex": { supported: true },
      "workspace/triggerReindex": { supported: true },
    },
  };
}

export function isIndexBacked(operation: RelationshipOperation): boolean {
  return operation === "references" || operation === "callers" || operation === "callees";
}
