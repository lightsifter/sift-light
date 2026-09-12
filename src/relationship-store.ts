import { randomUUID } from "node:crypto";
import { SignalGrepError } from "./errors.js";
import {
  RelationshipExplorer,
  type RelationshipTraceRequest,
  type RelationshipTraceResult,
} from "./relationship-explorer.js";
import type {
  RelationshipEdge,
  RelationshipRecheck,
  RelationshipValidity,
  RelationshipView,
  RelationshipViewFactory,
} from "./relationship-types.js";
import { aggregateRelationshipValidity, relationshipRecheck } from "./evidence-validity.js";

// This is only the maximum edge batch before the formatter applies the
// shared byte budget. The emitted page size is selected from the serialized
// result, so long paths or diagnostics receive smaller stable pages.
const PAGE_SIZE = 30;
const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_ENTRIES = 32;
const DEFAULT_MAX_STATES = 128;
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

interface StoredRelationship {
  id: string;
  factory: RelationshipViewFactory;
  request: RelationshipTraceRequest;
  currentVersion: number;
  states: Map<number, RelationshipTraceResult>;
  touched: number;
  bytes: number;
  active: number;
}

export interface RelationshipPage {
  items: readonly RelationshipEdge[];
  offset: number;
  totalItems: number;
  cursor: string;
  nextCursor?: string;
  exploreCursor?: string;
}

export interface StoredRelationshipResult {
  state: RelationshipTraceResult;
  cursor: string;
  exploreCursor?: string;
}

export class RelationshipChangedError extends SignalGrepError {
  readonly validity: Extract<RelationshipValidity, "stale" | "unknown">;
  constructor(validity: Extract<RelationshipValidity, "stale" | "unknown">, message: string) {
    super(message);
    this.name = "RelationshipChangedError";
    this.validity = validity;
  }
}

interface CursorParts {
  id: string;
  kind: "page" | "explore";
  version: number;
  offset: number;
}

function cursorParts(cursor: string): CursorParts {
  const match = /^relationship\.([a-f0-9-]+)\.(page|explore)\.([0-9a-z]+)\.([0-9a-z]+)$/.exec(
    cursor,
  );
  if (!match) throw new SignalGrepError("Invalid relationship cursor");
  const version = Number.parseInt(match[3] ?? "", 36);
  const offset = Number.parseInt(match[4] ?? "", 36);
  if (
    !Number.isSafeInteger(version) ||
    version < 0 ||
    version.toString(36) !== match[3] ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset.toString(36) !== match[4]
  )
    throw new SignalGrepError("Invalid relationship cursor offset");
  const kind = match[2];
  if (kind !== "page" && kind !== "explore")
    throw new SignalGrepError("Invalid relationship cursor kind");
  return { id: match[1] ?? "", kind, version, offset };
}

function pageCursor(id: string, version: number, offset: number): string {
  return `relationship.${id}.page.${version.toString(36)}.${offset.toString(36)}`;
}

function exploreCursor(id: string, version: number): string {
  return `relationship.${id}.explore.${version.toString(36)}.0`;
}

function referenceKey(value: unknown): string {
  return JSON.stringify(value);
}

function compareCaptured(
  captured: RelationshipTraceResult,
  current: RelationshipRecheck,
): RelationshipRecheck {
  const actual = new Map(
    current.sources.map((source) => [`${source.role}:${source.path}`, source]),
  );
  const statuses = [...captured.coverage.sources].map((expected) => {
    const found = actual.get(`${expected.role}:${expected.path}`);
    if (!found) {
      const wasPresent = expected.expected !== undefined || expected.current !== undefined;
      return Object.assign({}, expected, {
        status: wasPresent ? ("stale" as const) : ("unknown" as const),
        reason: wasPresent
          ? "Captured dependency is no longer present"
          : "Dependency could not be rechecked",
      });
    }
    const expectedReference = expected.expected ?? expected.current;
    const currentReference = found.current ?? found.expected;
    if (
      expectedReference &&
      currentReference &&
      referenceKey(expectedReference) !== referenceKey(currentReference)
    )
      return Object.assign({}, found, {
        status: "stale" as const,
        expected: expectedReference,
        reason: "Captured dependency revision changed",
      });
    return found;
  });
  const reasons = [
    ...new Set([
      ...current.reasons,
      ...statuses
        .filter((source) => source.reason)
        .map((source) => `${source.path}: ${source.reason}`),
    ]),
  ];
  return relationshipRecheck(
    statuses,
    current.affectedNodeKeys,
    current.affectedEdgeKeys,
    reasons,
    aggregateRelationshipValidity(statuses) === "current" ? current.coverage : "partial",
  );
}

function rootViewId(request: RelationshipTraceRequest): string | undefined {
  const root = request.root
    ? "identity" in request.root
      ? request.root
      : request.root.node
    : undefined;
  return root?.identity.analysisViewId;
}

/** Bounded serializable relationship snapshots. Compiler/provider views exist only during one operation. */
export class RelationshipStore {
  readonly #entries = new Map<string, StoredRelationship>();
  readonly #locks = new Map<string, Promise<void>>();
  readonly #active = new Set<Promise<void>>();
  readonly #explorer: RelationshipExplorer;
  readonly #pageSize: number;
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #maxStates: number;
  readonly #maxBytes: number;
  #stateCount = 0;
  #bytes = 0;
  #generation = 0;
  #closed = false;

  constructor(
    explorer = new RelationshipExplorer(),
    pageSize = PAGE_SIZE,
    options: { ttlMs?: number; maxEntries?: number; maxStates?: number; maxBytes?: number } = {},
  ) {
    if (!Number.isSafeInteger(pageSize) || pageSize < 1)
      throw new SignalGrepError("Relationship page size must be positive");
    this.#explorer = explorer;
    this.#pageSize = pageSize;
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.#maxStates = options.maxStates ?? DEFAULT_MAX_STATES;
    this.#maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    if (
      ![this.#ttlMs, this.#maxEntries, this.#maxStates, this.#maxBytes].every(
        (value) => Number.isSafeInteger(value) && value >= 1,
      )
    )
      throw new SignalGrepError("Invalid relationship store bounds");
  }

  async create(
    factory: RelationshipViewFactory,
    request: RelationshipTraceRequest,
    prepare?: (view: RelationshipView) => Promise<RelationshipTraceRequest>,
  ): Promise<StoredRelationshipResult> {
    this.assertOpen();
    const generation = this.#generation;
    let effectiveRequest = request;
    const state = await this.#withView(
      factory,
      request.signal,
      rootViewId(request),
      async (view) => {
        const before = await view.recheck(request.signal);
        this.assertCurrent(before);
        effectiveRequest = prepare ? await prepare(view) : request;
        const explored = await this.#explorer.start(view, effectiveRequest);
        const after = await view.recheck(request.signal);
        this.assertCurrent(after);
        return explored;
      },
    );
    if (generation !== this.#generation)
      throw new SignalGrepError("Relationship store was cleared during the operation");
    const bytes = Buffer.byteLength(JSON.stringify(state));
    if (bytes > this.#maxBytes)
      throw new SignalGrepError("Relationship snapshot exceeds the storage byte limit");
    this.#expire();
    const id = randomUUID();
    const entry: StoredRelationship = {
      id,
      factory,
      request: effectiveRequest,
      currentVersion: 0,
      states: new Map([[0, state]]),
      touched: Date.now(),
      bytes,
      active: 0,
    };
    this.#entries.set(id, entry);
    this.#stateCount += 1;
    this.#bytes += bytes;
    this.#evict(id);
    if (!this.#entries.has(id))
      throw new SignalGrepError("Relationship snapshot was evicted before it could be returned");
    return this.#stored(entry, state, 0);
  }

  page(cursor: string, limit = this.#pageSize): RelationshipPage {
    this.assertOpen();
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new SignalGrepError("Relationship page limit must be positive");
    this.#expire();
    const parts = cursorParts(cursor);
    if (parts.kind !== "page")
      throw new SignalGrepError("Relationship exploration cursor cannot page results");
    const entry = this.#entry(parts.id);
    const state = entry.states.get(parts.version);
    if (!state) throw new SignalGrepError("Relationship page was evicted; start the trace again");
    if (parts.offset > state.edges.length)
      throw new SignalGrepError("Relationship page offset is beyond the snapshot");
    entry.touched = Date.now();
    const items = state.edges.slice(parts.offset, parts.offset + limit);
    const nextOffset = parts.offset + items.length;
    const nextCursor =
      nextOffset < state.edges.length ? pageCursor(entry.id, parts.version, nextOffset) : undefined;
    const continuation = this.#continuation(entry, parts.version);
    return {
      items,
      offset: parts.offset,
      totalItems: state.edges.length,
      cursor,
      ...(nextCursor ? { nextCursor } : {}),
      ...(continuation ? { exploreCursor: continuation } : {}),
    };
  }

  snapshot(cursor: string): RelationshipTraceResult {
    this.assertOpen();
    this.#expire();
    const parts = cursorParts(cursor);
    const entry = this.#entry(parts.id);
    const state = entry.states.get(parts.version);
    if (!state) throw new SignalGrepError("Relationship snapshot was evicted");
    entry.touched = Date.now();
    return state;
  }

  async continue(
    exploreCursorValue: string,
    signal?: AbortSignal,
  ): Promise<StoredRelationshipResult> {
    this.assertOpen();
    const parts = cursorParts(exploreCursorValue);
    if (parts.kind !== "explore")
      throw new SignalGrepError("Relationship page cursor cannot explore");
    const generation = this.#generation;
    return this.#locked(parts.id, async (entry) => {
      const previous = entry.states.get(parts.version);
      if (!previous) throw new SignalGrepError("Relationship exploration snapshot was evicted");
      if (parts.version !== entry.currentVersion)
        throw new SignalGrepError(
          "Relationship exploration cursor is superseded by a newer snapshot",
        );
      if (previous.frontier.length === 0)
        return this.#stored(entry, previous, entry.currentVersion);
      const state = await this.#withView(
        entry.factory,
        signal,
        rootViewId(entry.request),
        async (view) => {
          const before = compareCaptured(previous, await view.recheck(signal));
          this.assertCurrent(before);
          const next = await this.#explorer.continue(view, previous, signal, { extendDepth: 1 });
          const after = compareCaptured(previous, await view.recheck(signal));
          this.assertCurrent(after);
          return next;
        },
      );
      if (this.#generation !== generation)
        throw new SignalGrepError("Relationship store was cleared during the operation");
      const bytes = Buffer.byteLength(JSON.stringify(state));
      if (bytes > this.#maxBytes)
        throw new SignalGrepError("Relationship continuation exceeds the storage byte limit");
      const version = entry.currentVersion + 1;
      entry.currentVersion = version;
      entry.states.set(version, state);
      entry.bytes += bytes;
      this.#stateCount += 1;
      this.#bytes += bytes;
      entry.touched = Date.now();
      this.#evict(entry.id);
      if (!this.#entries.has(entry.id))
        throw new SignalGrepError(
          "Relationship continuation was evicted before it could be returned",
        );
      return this.#stored(entry, state, version);
    });
  }

  async validate(cursor: string, signal?: AbortSignal): Promise<RelationshipRecheck> {
    this.assertOpen();
    const parts = cursorParts(cursor);
    const entry = this.#entry(parts.id);
    if (!entry.states.has(parts.version))
      throw new SignalGrepError("Relationship evidence snapshot was evicted");
    entry.touched = Date.now();
    const state = entry.states.get(parts.version);
    if (!state) throw new SignalGrepError("Relationship evidence snapshot was evicted");
    const generation = this.#generation;
    const result = await this.#withView(
      entry.factory,
      signal,
      rootViewId(entry.request),
      async (view) => compareCaptured(state, await view.recheck(signal)),
    );
    if (generation !== this.#generation)
      throw new SignalGrepError("Relationship store was cleared during the operation");
    return result;
  }

  clear(): void {
    this.#generation += 1;
    this.#entries.clear();
    this.#stateCount = 0;
    this.#bytes = 0;
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#generation += 1;
    await Promise.allSettled(this.#active);
    this.#entries.clear();
    this.#locks.clear();
    this.#stateCount = 0;
    this.#bytes = 0;
  }

  async #locked<T>(id: string, operation: (entry: StoredRelationship) => Promise<T>): Promise<T> {
    const previous = this.#locks.get(id) ?? Promise.resolve();
    const done = Promise.withResolvers<void>();
    const chain = previous.then(() => done.promise);
    this.#locks.set(id, chain);
    await previous;
    const entry = this.#entries.get(id);
    if (!entry) throw new SignalGrepError("Relationship exploration was not found or has expired");
    entry.active += 1;
    const marker = Promise.withResolvers<void>();
    this.#active.add(marker.promise);
    try {
      return await operation(entry);
    } finally {
      entry.active -= 1;
      done.resolve();
      marker.resolve();
      this.#active.delete(marker.promise);
      if (this.#locks.get(id) === chain) this.#locks.delete(id);
    }
  }

  async #withView<T>(
    factory: RelationshipViewFactory,
    signal: AbortSignal | undefined,
    analysisViewId: string | undefined,
    operation: (view: RelationshipView) => Promise<T>,
  ): Promise<T> {
    const marker = Promise.withResolvers<void>();
    this.#active.add(marker.promise);
    let view: RelationshipView | undefined;
    try {
      view = await factory.open(signal, analysisViewId);
      return await operation(view);
    } finally {
      try {
        if (view) await view.close();
      } finally {
        marker.resolve();
        this.#active.delete(marker.promise);
      }
    }
  }

  #stored(
    entry: StoredRelationship,
    state: RelationshipTraceResult,
    version: number,
  ): StoredRelationshipResult {
    const continuation = this.#continuation(entry, version);
    return {
      state,
      cursor: pageCursor(entry.id, version, 0),
      ...(continuation ? { exploreCursor: continuation } : {}),
    };
  }

  #continuation(entry: StoredRelationship, version: number): string | undefined {
    const state = entry.states.get(version);
    return state && state.frontier.length > 0 && state.coverage.freshness === "current"
      ? exploreCursor(entry.id, version)
      : undefined;
  }

  #entry(id: string): StoredRelationship {
    const entry = this.#entries.get(id);
    if (!entry) throw new SignalGrepError("Relationship result was not found or has expired");
    return entry;
  }

  #expire(): void {
    const cutoff = Date.now() - this.#ttlMs;
    for (const [id, entry] of this.#entries)
      if (entry.active === 0 && entry.touched < cutoff) this.#drop(id, entry);
  }

  #evict(preserveId?: string): void {
    while (
      this.#entries.size > this.#maxEntries ||
      this.#stateCount > this.#maxStates ||
      this.#bytes > this.#maxBytes
    ) {
      const oldest = [...this.#entries.values()]
        .filter((entry) => entry.active === 0 && entry.id !== preserveId)
        .toSorted((left, right) => left.touched - right.touched)[0];
      if (!oldest) break;
      this.#drop(oldest.id, oldest);
    }
  }

  #drop(id: string, entry: StoredRelationship): void {
    if (!this.#entries.delete(id)) return;
    this.#stateCount -= entry.states.size;
    this.#bytes -= entry.bytes;
  }

  assertCurrent(recheck: RelationshipRecheck): void {
    if (recheck.validity !== "current")
      throw new RelationshipChangedError(
        recheck.validity,
        `Relationship evidence is ${recheck.validity}; the operation was not published`,
      );
  }

  private assertOpen(): void {
    if (this.#closed) throw new SignalGrepError("Relationship store is closed");
  }
}
