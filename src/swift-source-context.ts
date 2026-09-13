import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import { SourceBudgetError } from "./source-access.js";
import { SourceDocumentError, type SourceDocument } from "./source-document.js";
import type {
  RelationshipCoverageStatus,
  RelationshipProviderOptions,
  RelationshipSourceScope,
  RelationshipSourceStatus,
  RelationshipValidity,
} from "./relationship-types.js";
import { listWorkspaceFiles } from "./workspace-files.js";
import {
  configurationFingerprint,
  documentRole,
  executablePath,
  isAdmittedSwiftFile,
  readSwiftWorkspaceConfiguration,
  sourceStatus,
  SWIFT_TOOLCHAIN_PATH,
  type SwiftWorkspaceConfiguration,
} from "./swift-sourcekit-protocol.js";

export interface SwiftSourceRecheck {
  validity: RelationshipValidity;
  coverage: RelationshipCoverageStatus;
  sources: readonly RelationshipSourceStatus[];
  reasons: readonly string[];
  stalePaths: ReadonlySet<string>;
  configurationChanged: boolean;
  inventoryUnknown: boolean;
}

function isRecoverableSourceReadFailure(error: unknown): error is Error {
  return error instanceof SourceDocumentError || error instanceof SourceBudgetError;
}

/** Owns the admitted Swift snapshot, configuration fingerprint, and recheck. */
export class SwiftSourceContext {
  readonly cwd: string;
  readonly scope: RelationshipSourceScope;
  readonly signal: AbortSignal;
  readonly source: RelationshipProviderOptions["source"];
  readonly documents: ReadonlyMap<string, SourceDocument>;
  readonly inventory: ReadonlySet<string>;
  readonly initialReasons: readonly string[];
  readonly initialCoveragePartial: boolean;
  readonly configurationFingerprint: string;
  readonly workspaceConfiguration: SwiftWorkspaceConfiguration;

  private constructor(options: {
    cwd: string;
    scope: RelationshipSourceScope;
    signal: AbortSignal;
    source: RelationshipProviderOptions["source"];
    documents: Map<string, SourceDocument>;
    inventory: ReadonlySet<string>;
    initialReasons: readonly string[];
    initialCoveragePartial: boolean;
    workspaceConfiguration: SwiftWorkspaceConfiguration;
  }) {
    this.cwd = options.cwd;
    this.scope = options.scope;
    this.signal = options.signal;
    this.source = options.source;
    this.documents = options.documents;
    this.inventory = options.inventory;
    this.initialReasons = options.initialReasons;
    this.initialCoveragePartial = options.initialCoveragePartial;
    this.workspaceConfiguration = options.workspaceConfiguration;
    this.configurationFingerprint = configurationFingerprint(
      executablePath(),
      options.workspaceConfiguration.fingerprint,
    );
  }

  static async open(options: RelationshipProviderOptions): Promise<SwiftSourceContext> {
    const files = await listWorkspaceFiles(options.cwd, options.signal, {
      path: options.scope.root,
      glob: [...(options.scope.include ?? [])],
      exclude: [...(options.scope.exclude ?? [])],
      ...(options.scope.hidden === undefined ? {} : { hidden: options.scope.hidden }),
      ...(options.limits?.maxFiles === undefined ? {} : { maxFiles: options.limits.maxFiles }),
    });
    const workspaceConfiguration = await readSwiftWorkspaceConfiguration(
      options.cwd,
      options.scope.root,
    );
    const documents = new Map<string, SourceDocument>();
    const reasons = [...files.reasons];
    let partial = files.partial;
    const inventory = new Set(files.paths.filter(isAdmittedSwiftFile));
    for (const path of inventory) {
      if (options.signal.aborted) throw abortError();
      try {
        // Keep source reads ordered so the dependency set is deterministic.
        // oxlint-disable-next-line no-await-in-loop -- source budget is per document.
        const document = await options.source.load(path);
        if (!document.utf8) {
          reasons.push(path + ": source is not lossless UTF-8");
          partial = true;
          continue;
        }
        documents.set(resolve(options.cwd, path), document);
      } catch (error) {
        if (options.signal.aborted || (error instanceof Error && error.name === "AbortError"))
          throw abortError();
        if (!isRecoverableSourceReadFailure(error)) throw error;
        reasons.push(path + ": " + (error instanceof Error ? error.message : "source unavailable"));
        partial = true;
      }
    }
    if (documents.size === 0)
      throw new SignalGrepError("Swift semantic provider found no admitted Swift source");
    return new SwiftSourceContext({
      cwd: options.cwd,
      scope: options.scope,
      signal: options.signal,
      source: options.source,
      documents,
      inventory,
      initialReasons: reasons,
      initialCoveragePartial: partial,
      workspaceConfiguration,
    });
  }

  documentForPath(path: string): SourceDocument | undefined {
    const direct = this.documents.get(resolve(this.cwd, path));
    if (direct) return direct;
    let requested: string;
    try {
      requested = realpathSync(resolve(this.cwd, path));
    } catch {
      return undefined;
    }
    for (const [key, document] of this.documents) {
      try {
        if (realpathSync(key) === requested) return document;
      } catch {
        // A removed target is not admitted evidence.
      }
    }
    return undefined;
  }

  async recheck(): Promise<SwiftSourceRecheck> {
    const statuses: RelationshipSourceStatus[] = [];
    const reasons: string[] = [];
    const stalePaths = new Set<string>();
    for (const document of this.documents.values()) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- source references are checked serially.
        await this.source.refresh(document.path, document.reference);
        statuses.push(sourceStatus(document, "current"));
      } catch (error) {
        if (this.signal.aborted || (error instanceof Error && error.name === "AbortError"))
          throw abortError();
        if (!isRecoverableSourceReadFailure(error)) throw error;
        const reason = error instanceof Error ? error.message : "Swift source recheck failed";
        statuses.push(sourceStatus(document, "stale", reason));
        reasons.push(document.path + ": " + reason);
        stalePaths.add(document.path);
      }
    }
    const inventory = await listWorkspaceFiles(this.cwd, this.signal, {
      path: this.scope.root,
      glob: [...(this.scope.include ?? [])],
      exclude: [...(this.scope.exclude ?? [])],
      ...(this.scope.hidden === undefined ? {} : { hidden: this.scope.hidden }),
    });
    const currentInventory = new Set(inventory.paths.filter(isAdmittedSwiftFile));
    const inventoryChanged =
      currentInventory.size !== this.inventory.size ||
      [...currentInventory].some((path) => !this.inventory.has(path));
    if (inventoryChanged || inventory.partial) {
      reasons.push(
        inventoryChanged
          ? "Swift source inventory changed during relationship query; retry"
          : inventory.reasons.join("; "),
      );
      for (const path of [...this.inventory].filter((item) => !currentInventory.has(item))) {
        statuses.push({
          path,
          role: documentRole(path),
          status: "stale",
          reason: "source removed during query",
        });
        stalePaths.add(path);
      }
      for (const path of [...currentInventory].filter((item) => !this.inventory.has(item))) {
        statuses.push({
          path,
          role: documentRole(path),
          status: "stale",
          reason: "source added during query; retry",
        });
        stalePaths.add(path);
      }
    }
    let currentConfigurationFingerprint: string | undefined;
    let configurationReason: string | undefined;
    try {
      const workspaceConfiguration = await readSwiftWorkspaceConfiguration(
        this.cwd,
        this.scope.root,
      );
      currentConfigurationFingerprint = configurationFingerprint(
        executablePath(),
        workspaceConfiguration.fingerprint,
      );
    } catch (error) {
      configurationReason =
        error instanceof Error ? error.message : "Swift toolchain configuration is invalid";
    }
    const configurationChanged =
      configurationReason !== undefined ||
      currentConfigurationFingerprint !== this.configurationFingerprint;
    if (configurationChanged)
      reasons.push(
        configurationReason ??
          "Swift executable or SourceKit-LSP initialization configuration changed during relationship query",
      );
    statuses.push({
      path: SWIFT_TOOLCHAIN_PATH,
      role: "config",
      status: configurationChanged ? "stale" : "current",
      reason:
        configurationReason ?? currentConfigurationFingerprint ?? this.configurationFingerprint,
    });
    const inventoryUnknown = inventory.partial;
    const invalidated = stalePaths.size > 0 || configurationChanged;
    return {
      validity: invalidated ? "stale" : inventoryUnknown ? "unknown" : "current",
      coverage:
        this.initialCoveragePartial || invalidated || inventoryUnknown ? "partial" : "complete",
      sources: statuses,
      reasons,
      stalePaths,
      configurationChanged,
      inventoryUnknown,
    };
  }
}
