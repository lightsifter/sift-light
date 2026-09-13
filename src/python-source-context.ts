import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import {
  isPythonProjectMarker,
  resolvePythonProjectRoot,
  type PythonLanguageServerCommand,
} from "./python-language-discovery.js";
import { listWorkspaceFiles } from "./workspace-files.js";
import type { RelationshipSourceScope } from "./relationship-types.js";
import type { SourceDocument, SourceReference } from "./source-document.js";
import type { RelationshipProviderOptions } from "./relationship-types.js";

const PYTHON_SOURCE = /\.py$/iu;

export interface PythonSourceContextOptions {
  readonly cwd: string;
  readonly scope: RelationshipSourceScope;
  readonly source: RelationshipProviderOptions["source"];
  readonly signal: AbortSignal;
  readonly maxFiles: number;
  readonly command: PythonLanguageServerCommand;
}

export interface PythonSourceContextOpen {
  readonly context: PythonSourceContext;
  readonly documents: readonly SourceDocument[];
  readonly metadata: readonly SourceDocument[];
  readonly reasons: readonly string[];
  readonly partial: boolean;
}

function admittedSource(path: string): boolean {
  return PYTHON_SOURCE.test(path);
}

function key(cwd: string, path: string): string {
  return resolve(cwd, path);
}

/** Owns Python project admission and source/config snapshots for one view. */
export class PythonSourceContext {
  readonly cwd: string;
  readonly root: string;
  readonly scope: RelationshipSourceScope;
  readonly source: RelationshipProviderOptions["source"];
  readonly signal: AbortSignal;
  readonly command: PythonLanguageServerCommand;
  readonly maxFiles: number;
  readonly inventory: ReadonlySet<string>;
  readonly documents: ReadonlyMap<string, SourceDocument>;
  readonly metadata: ReadonlyMap<string, SourceDocument>;
  readonly aliases: ReadonlyMap<string, SourceDocument>;
  readonly initialReasons: readonly string[];
  readonly initialPartial: boolean;

  private constructor(options: {
    source: PythonSourceContextOptions;
    root: string;
    inventory: ReadonlySet<string>;
    documents: ReadonlyMap<string, SourceDocument>;
    metadata: ReadonlyMap<string, SourceDocument>;
    aliases: ReadonlyMap<string, SourceDocument>;
    reasons: readonly string[];
    partial: boolean;
  }) {
    this.cwd = options.source.cwd;
    this.root = options.root;
    this.scope = options.source.scope;
    this.source = options.source.source;
    this.signal = options.source.signal;
    this.command = options.source.command;
    this.maxFiles = options.source.maxFiles;
    this.inventory = options.inventory;
    this.documents = options.documents;
    this.metadata = options.metadata;
    this.aliases = options.aliases;
    this.initialReasons = options.reasons;
    this.initialPartial = options.partial;
  }

  static async open(options: PythonSourceContextOptions): Promise<PythonSourceContextOpen> {
    if (options.signal.aborted) throw abortError();
    const target = options.scope.root;
    const root = await resolvePythonProjectRoot(options.cwd, target, options.signal);
    const files = await listWorkspaceFiles(options.cwd, options.signal, {
      path: root,
      glob: [...(options.scope.include ?? [])],
      exclude: [...(options.scope.exclude ?? [])],
      ...(options.scope.hidden === undefined ? {} : { hidden: options.scope.hidden }),
      maxFiles: options.maxFiles,
    });
    const inventory = new Set(
      files.paths.filter((path) => admittedSource(path) || isPythonProjectMarker(path)),
    );
    const documents = new Map<string, SourceDocument>();
    const metadata = new Map<string, SourceDocument>();
    const aliases = new Map<string, SourceDocument>();
    const reasons = [...files.reasons];
    let partial = files.partial;
    for (const path of inventory) {
      if (options.signal.aborted) throw abortError();
      try {
        // Serial admission keeps the source ledger deterministic and bounded.
        // oxlint-disable-next-line no-await-in-loop -- source admission is ordered by inventory.
        const document = await options.source.load(path);
        if (!document.utf8) {
          reasons.push(`${path}: source is not lossless UTF-8`);
          partial = true;
          continue;
        }
        if (admittedSource(path)) documents.set(key(options.cwd, path), document);
        if (isPythonProjectMarker(path)) metadata.set(key(options.cwd, path), document);
        const absolute = key(options.cwd, path);
        aliases.set(absolute, document);
        try {
          // macOS may report /var in workspace paths and /private/var in file URIs.
          // oxlint-disable-next-line no-await-in-loop -- aliases are recorded per admitted source.
          aliases.set(await realpath(absolute), document);
        } catch {
          // The source read already verified the path; an alias is best effort only.
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        reasons.push(`${path}: ${error instanceof Error ? error.message : "source unavailable"}`);
        partial = true;
      }
    }
    if (documents.size === 0)
      throw new SignalGrepError("Python semantic provider found no admitted Python source");
    const context = new PythonSourceContext({
      source: options,
      root,
      inventory,
      documents,
      metadata,
      aliases,
      reasons,
      partial,
    });
    return {
      context,
      documents: [...documents.values()],
      metadata: [...metadata.values()],
      reasons,
      partial,
    };
  }

  document(path: string): SourceDocument | undefined {
    return this.aliases.get(key(this.cwd, path));
  }

  documentAtAbsolute(path: string): SourceDocument | undefined {
    return this.aliases.get(path);
  }

  configDocuments(): readonly SourceDocument[] {
    return [...this.metadata.values()];
  }

  sourceReference(path: string): SourceReference | undefined {
    return this.document(path)?.reference ?? this.metadata.get(key(this.cwd, path))?.reference;
  }
}
