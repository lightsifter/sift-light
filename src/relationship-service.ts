import { resolve } from "node:path";
import { CursorError, SignalGrepError } from "./errors.js";
import {
  RelationshipChangeAwareness,
  type RelationshipChangeHint,
  type RelationshipWatchHealth,
} from "./change-awareness.js";
import { goSemanticProvider } from "./go-semantic-provider.js";
import {
  DEFAULT_RELATIONSHIP_TRACE_BUDGET,
  type RelationshipTraceBudget,
  type RelationshipTraceRequest,
} from "./relationship-explorer.js";
import { traceResult, validationResult } from "./relationship-output.js";
import { RelationshipStore, type StoredRelationshipResult } from "./relationship-store.js";
import type {
  RelationshipProvider,
  RelationshipSourceScope,
  RelationshipViewFactory,
} from "./relationship-types.js";
import { createTypeScriptRelationshipProvider } from "./typescript-relationship-provider.js";
import type { SignalGrepInput } from "./service.js";
import { MAX_RESULT_BYTES, type SearchRequest, type SignalGrepResult } from "./types.js";
import { SourceAccess, SyntaxQueue } from "./source-access.js";
import { isPathInsideCwd } from "./path-policy.js";

export interface RelationshipScopeResolution {
  root: string;
  filters: Pick<SearchRequest, "glob" | "exclude" | "hidden">;
}

export interface RelationshipServiceOptions {
  queue: SyntaxQueue;
  resolveScope: (
    cwd: string,
    target: string,
    input: SignalGrepInput,
    signal?: AbortSignal,
  ) => Promise<RelationshipScopeResolution>;
  maxFilesToParse: (value: number | undefined) => number;
}

/**
 * Owns the relationship capability boundary. The evidence service dispatches
 * here; providers, snapshots, paging, continuation and filesystem hints stay
 * behind this service so no request can accidentally create a second runtime.
 */
export class RelationshipService {
  readonly #queue: SyntaxQueue;
  readonly #resolveScope: RelationshipServiceOptions["resolveScope"];
  readonly #maxFilesToParse: RelationshipServiceOptions["maxFilesToParse"];
  readonly #relationships = new RelationshipStore();
  readonly #changeAwareness = new RelationshipChangeAwareness();
  readonly #relationshipWatchStops = new Set<() => void>();
  readonly #watchedRelationshipRoots = new Set<string>();

  constructor(options: RelationshipServiceOptions) {
    this.#queue = options.queue;
    this.#resolveScope = options.resolveScope;
    this.#maxFilesToParse = options.maxFilesToParse;
  }

  clear(): void {
    this.#relationships.clear();
  }

  async shutdown(): Promise<void> {
    await this.#relationships.close();
    for (const stop of this.#relationshipWatchStops) stop();
    this.#relationshipWatchStops.clear();
    this.#watchedRelationshipRoots.clear();
    this.#changeAwareness.close();
  }

  async trace(
    input: SignalGrepInput,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<SignalGrepResult> {
    if (input.cursor?.startsWith("relationship.") && input.exploreCursor !== undefined)
      throw new CursorError(
        "Use cursor for immutable pages or exploreCursor for continuation, not both",
        "E_CURSOR_OPTIONS_CONFLICT",
      );
    if (input.exploreCursor !== undefined) {
      rejectFields(
        input,
        [
          "path",
          "line",
          "column",
          "symbol",
          "relation",
          "depth",
          "maxNodes",
          "maxEdges",
          "maxExpansions",
          "cursor",
        ],
        "Trace continuation",
        true,
      );
      const stored = await this.#relationships.continue(input.exploreCursor, signal);
      return this.#pageResult(
        stored,
        stored.state.scope,
        input,
        this.#relationshipHints(stored.state.scope),
        this.#relationshipWatchHealth(),
      );
    }
    if (input.cursor?.startsWith("relationship.")) {
      rejectFields(
        input,
        [
          "path",
          "line",
          "column",
          "symbol",
          "relation",
          "depth",
          "maxNodes",
          "maxEdges",
          "maxExpansions",
        ],
        "Trace continuation",
        true,
      );
      if (input.cursor.includes(".explore."))
        throw new SignalGrepError(
          "Use exploreCursor for relationship continuation; cursor is reserved for immutable pages",
        );
      const state = this.#relationships.snapshot(input.cursor);
      const page = this.#relationships.page(input.cursor);
      return this.#pageResult(
        {
          state,
          cursor: input.cursor,
          ...(page.exploreCursor ? { exploreCursor: page.exploreCursor } : {}),
        },
        state.scope,
        input,
        this.#relationshipHints(state.scope),
        this.#relationshipWatchHealth(),
      );
    }
    rejectFields(
      input,
      [
        "query",
        "pattern",
        "context",
        "wholeWord",
        "literal",
        "ignoreCase",
        "changes",
        "modifiedAfter",
        "modifiedBefore",
        "anyOf",
        "allOf",
        "within",
        "roles",
        "paths",
        "matchIndices",
        "targets",
        "sourceCursor",
        "conceptLimit",
      ],
      "mode=trace",
    );
    const operation = input.relation;
    if (operation !== "callers" && operation !== "callees")
      throw new SignalGrepError("mode=trace requires relation=callers or relation=callees");
    if (!input.path || input.line === undefined)
      throw new SignalGrepError(
        "mode=trace requires path and line; add column or symbol to identify the root",
      );
    const maxDepth = input.depth ?? DEFAULT_RELATIONSHIP_TRACE_BUDGET.maxDepth;
    const budget: RelationshipTraceBudget = {
      maxDepth,
      maxNodes: input.maxNodes ?? DEFAULT_RELATIONSHIP_TRACE_BUDGET.maxNodes,
      maxEdges: input.maxEdges ?? DEFAULT_RELATIONSHIP_TRACE_BUDGET.maxEdges,
      maxExpansions: input.maxExpansions ?? DEFAULT_RELATIONSHIP_TRACE_BUDGET.maxExpansions,
    };
    const maxFiles = this.#maxFilesToParse(input.maxFilesToParse);
    const { factory, scope } = await this.#factory(input, cwd, signal, maxFiles);
    const request: RelationshipTraceRequest = {
      operation,
      budget,
      scope,
      ...(signal ? { signal } : {}),
    };
    const stored = await this.#relationships.create(factory, request, async (view) => ({
      ...request,
      root: await view.resolveNode(
        {
          path: input.path!.replace(/^@/, ""),
          line: input.line!,
          ...(input.column !== undefined ? { column: input.column } : {}),
          ...(input.symbol ? { symbol: input.symbol } : {}),
        },
        signal,
      ),
    }));
    return this.#pageResult(
      stored,
      scope,
      input,
      this.#relationshipHints(scope),
      this.#relationshipWatchHealth(),
    );
  }

  async validate(input: SignalGrepInput, signal?: AbortSignal): Promise<SignalGrepResult> {
    const cursor = input.cursor;
    if (!cursor) throw new SignalGrepError("mode=validate requires a saved evidence cursor");
    rejectFields(
      input,
      [
        "path",
        "line",
        "column",
        "symbol",
        "relation",
        "depth",
        "maxNodes",
        "maxEdges",
        "maxExpansions",
        "exploreCursor",
      ],
      "Evidence validation",
      true,
    );
    const state = this.#relationships.snapshot(cursor);
    const startedAt = Date.now();
    const recheck = await this.#relationships.validate(cursor, signal);
    const finishedAt = Date.now();
    return validationResult(
      state,
      cursor,
      recheck,
      {
        start: startedAt,
        end: finishedAt,
        ...(input.matchIndex !== undefined ? { selected: input.matchIndex } : {}),
      },
      "current-worktree",
      this.#relationshipHints(state.scope),
      this.#relationshipWatchHealth(),
    );
  }

  async #factory(
    input: SignalGrepInput,
    cwd: string,
    signal: AbortSignal | undefined,
    maxFiles: number,
  ): Promise<{ factory: RelationshipViewFactory; scope: RelationshipSourceScope }> {
    const target = input.path?.replace(/^@/, "");
    if (!target) throw new SignalGrepError("mode=trace requires a workspace path");
    const resolved = await this.#resolveScope(cwd, target, input, signal);
    const scope: RelationshipSourceScope = {
      root: resolved.root,
      ...(resolved.filters.glob.length ? { include: resolved.filters.glob } : {}),
      ...(resolved.filters.exclude.length ? { exclude: resolved.filters.exclude } : {}),
      hidden: resolved.filters.hidden,
    };
    if (!this.#watchedRelationshipRoots.has(scope.root)) {
      const stop = this.#changeAwareness.start([scope.root], {
        recursive: true,
        maxSources: 64,
      });
      this.#relationshipWatchStops.add(stop);
      this.#watchedRelationshipRoots.add(scope.root);
    }
    const go = /\.go$/iu.test(target);
    const providerId = go ? goSemanticProvider.providerId : "typescript";
    const factory: RelationshipViewFactory = {
      providerId,
      open: async (operationSignal = new AbortController().signal, analysisViewId) => {
        const access = new SourceAccess(cwd, this.#queue, operationSignal, { maxFiles });
        const implementation: RelationshipProvider = go
          ? goSemanticProvider
          : createTypeScriptRelationshipProvider(access);
        return implementation.open({
          cwd,
          scope,
          source: access,
          signal: operationSignal,
          ...(analysisViewId ? { analysisViewId } : {}),
          limits: { maxFiles },
        });
      },
    };
    return { factory, scope };
  }

  #relationshipHints(scope: RelationshipSourceScope): readonly RelationshipChangeHint[] {
    return this.#changeAwareness
      .dirty()
      .filter((hint) => isPathInsideCwd(resolve(hint.path), scope.root));
  }

  #relationshipWatchHealth(): RelationshipWatchHealth {
    return this.#changeAwareness.health();
  }

  #pageResult(
    stored: StoredRelationshipResult,
    scope: RelationshipSourceScope,
    input: SignalGrepInput,
    changeHints: readonly RelationshipChangeHint[],
    watchHealth: RelationshipWatchHealth,
  ): SignalGrepResult {
    let limit: number | undefined;
    for (;;) {
      const page = this.#relationships.page(stored.cursor, limit);
      const result = traceResult(stored, page, scope, input, changeHints, watchHealth);
      const bytes = Buffer.byteLength(
        JSON.stringify({ text: result.text, details: result.details }),
      );
      if (bytes <= MAX_RESULT_BYTES) return result;
      if (page.items.length <= 1)
        throw new SignalGrepError("Relationship evidence cannot fit the shared result byte budget");
      limit = Math.max(1, Math.floor(page.items.length / 2));
    }
  }
}

function rejectFields(
  input: SignalGrepInput,
  fields: (keyof SignalGrepInput)[],
  operation: string,
  cursor = false,
): void {
  const present = fields.filter((field) => input[field] !== undefined);
  if (!present.length) return;
  const message = `${operation} does not accept ${present.join(", ")}. Remove only those fields, then retry once: copy the complete returned request unchanged. Keep the requested mode and remaining filters unchanged; do not include this error text in the retry.`;
  if (cursor) throw new CursorError(message, "E_CURSOR_OPTIONS_CONFLICT");
  throw new SignalGrepError(message);
}
