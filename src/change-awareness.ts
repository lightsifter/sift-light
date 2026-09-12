import { statSync, watch, type FSWatcher } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { RelationshipDependencyRole } from "./relationship-types.js";

/** A best-effort notification. It never establishes that a stored view is stale. */
export interface RelationshipChangeHint {
  path: string;
  role: RelationshipDependencyRole;
  observedAt: number;
  reason?: string;
}

export type RelationshipChangeListener = (hint: RelationshipChangeHint) => void;

export type RelationshipWatchHealthStatus = "healthy" | "degraded" | "unknown" | "closed";

export interface RelationshipWatchHealth {
  status: RelationshipWatchHealthStatus;
  activeSources: number;
  activeWatchers: number;
  maxSources: number;
  retainedHints: number;
  maxHints: number;
  overflowed: boolean;
  droppedHints: number;
  watcherErrors: number;
  partialStarts: number;
  reasons: readonly string[];
}

export interface RelationshipWatchOptions {
  role?: RelationshipDependencyRole;
  maxSources?: number;
  maxHints?: number;
  recursive?: boolean;
}

interface WatchSubscription {
  readonly token: number;
  readonly path: string;
  readonly role: RelationshipDependencyRole;
  readonly directory: boolean;
  readonly recursive: boolean;
  readonly groupKeys: readonly string[];
}

interface WatchGroup {
  readonly key: string;
  readonly root: string;
  readonly recursive: boolean;
  readonly subscriptions: Map<number, WatchSubscription>;
  watchRecursive: boolean;
  watcher: FSWatcher | undefined;
}

const DEFAULT_MAX_SOURCES = 1_024;
const DEFAULT_MAX_HINTS = 1_024;
const MAX_HEALTH_REASONS = 32;

function errorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== "object" || !("code" in error)) return undefined;
  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

function watcherFailureReason(error: unknown, recursive: boolean): string {
  const code = errorCode(error);
  return `${recursive ? "recursive " : ""}filesystem watcher failed${
    code === undefined ? "" : ` (${code})`
  }`;
}

function sourceUnavailableReason(error: unknown): string {
  const code = errorCode(error);
  return `relationship watcher source is unavailable${code === undefined ? "" : ` (${code})`}`;
}

function isInsideOrEqual(root: string, candidate: string): boolean {
  const value = relative(root, candidate);
  const separator = process.platform === "win32" ? "\\" : "/";
  return value === "" || (value !== ".." && !value.startsWith(`..${separator}`));
}

function isRecursiveUnsupported(error: unknown): boolean {
  return errorCode(error) === "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM";
}

/**
 * In-process dirty hints for long-lived clients. The provider's recheck remains
 * authoritative, while health exposes watcher degradation and bounded-hint loss.
 */
export class RelationshipChangeAwareness {
  readonly #dirty = new Map<string, RelationshipChangeHint>();
  readonly #listeners = new Set<RelationshipChangeListener>();
  readonly #groups = new Map<string, WatchGroup>();
  readonly #subscriptions = new Map<number, WatchSubscription>();
  readonly #healthReasons = new Set<string>();
  #maxSources = DEFAULT_MAX_SOURCES;
  #maxHints = DEFAULT_MAX_HINTS;
  #nextToken = 0;
  #droppedHints = 0;
  #watcherErrors = 0;
  #partialStarts = 0;
  #closed = false;

  markDirty(
    path: string,
    role: RelationshipDependencyRole = "source",
    reason?: string,
    observedAt = Date.now(),
  ): RelationshipChangeHint {
    const hint: RelationshipChangeHint = {
      path,
      role,
      observedAt,
      ...(reason === undefined ? {} : { reason }),
    };
    this.#dirty.set(resolve(path), { ...hint, path: resolve(path) });
    this.#trimHints();
    for (const listener of this.#listeners) {
      try {
        listener(hint);
      } catch {
        this.#rememberHealthReason("change listener failed");
      }
    }
    return hint;
  }

  /**
   * Subscribe to real worktree changes. The OS watcher only emits dirty hints;
   * a provider recheck is still required to decide current/stale/unknown.
   */
  start(paths: readonly string[], options: RelationshipWatchOptions = {}): () => void {
    if (this.#closed) throw new Error("Relationship watcher is closed");
    const requestedMaxSources = options.maxSources ?? this.#maxSources;
    if (!Number.isSafeInteger(requestedMaxSources) || requestedMaxSources < 1)
      throw new Error("Relationship watcher source limit must be a positive integer");
    const requestedMaxHints = options.maxHints ?? this.#maxHints;
    if (!Number.isSafeInteger(requestedMaxHints) || requestedMaxHints < 1)
      throw new Error("Relationship watcher hint limit must be a positive integer");
    if (requestedMaxSources < this.#subscriptions.size)
      throw new Error(
        `Relationship watcher source limit is below active subscriptions (${String(this.#subscriptions.size)})`,
      );
    this.#maxSources = Math.min(this.#maxSources, requestedMaxSources);
    const uniquePaths = new Set(paths.map((path) => resolve(path)));
    if (this.#subscriptions.size + uniquePaths.size > this.#maxSources)
      throw new Error(`Relationship watcher source limit exceeded (${String(this.#maxSources)})`);
    this.#maxHints = Math.min(this.#maxHints, requestedMaxHints);
    this.#trimHints();

    const recursive = options.recursive ?? false;
    const role = options.role ?? "source";
    const tokens: number[] = [];
    try {
      for (const path of uniquePaths) tokens.push(this.#addSubscription(path, role, recursive));
    } catch (error) {
      this.#partialStarts += 1;
      this.#rememberHealthReason("watcher start was rolled back after a resource failure");
      const cleanupErrors: unknown[] = [];
      for (const token of tokens.toReversed()) {
        try {
          this.#releaseToken(token);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (cleanupErrors.length)
        throw new AggregateError(
          [error, ...cleanupErrors],
          "Relationship watcher start failed and cleanup was incomplete",
          { cause: error },
        );
      throw error;
    }

    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const errors: unknown[] = [];
      for (const token of tokens) {
        try {
          this.#releaseToken(token);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "Relationship watcher stop failed");
    };
  }

  /** Release one subscription for a path, or all subscriptions when omitted. */
  stop(path?: string): void {
    const tokenList: number[] =
      path === undefined
        ? [...this.#subscriptions.keys()]
        : (() => {
            const token = [...this.#subscriptions.values()].find(
              (subscription) => subscription.path === resolve(path),
            )?.token;
            return token === undefined ? [] : [token];
          })();
    const errors: unknown[] = [];
    for (const token of tokenList) {
      try {
        this.#releaseToken(token);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "Relationship watcher stop failed");
  }

  close(): void {
    let failure: unknown;
    try {
      this.stop();
    } catch (error) {
      failure = error;
    } finally {
      this.#listeners.clear();
      this.#dirty.clear();
      this.#closed = true;
    }
    if (failure) throw failure;
  }

  subscribe(listener: RelationshipChangeListener): () => void {
    if (this.#closed) throw new Error("Relationship watcher is closed");
    this.#listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#listeners.delete(listener);
    };
  }

  dirty(path?: string): readonly RelationshipChangeHint[] {
    if (path !== undefined) {
      const hint = this.#dirty.get(resolve(path));
      return hint === undefined ? [] : [hint];
    }
    return [...this.#dirty.values()];
  }

  clear(path?: string): void {
    if (path === undefined) this.#dirty.clear();
    else this.#dirty.delete(resolve(path));
  }

  clearAll(): void {
    this.#dirty.clear();
  }

  health(): RelationshipWatchHealth {
    const reasons = [...this.#healthReasons];
    const status: RelationshipWatchHealthStatus = this.#closed
      ? "closed"
      : reasons.length
        ? "degraded"
        : this.#subscriptions.size
          ? "healthy"
          : "unknown";
    return {
      status,
      activeSources: this.#subscriptions.size,
      activeWatchers: [...this.#groups.values()].filter((group) => group.watcher !== undefined)
        .length,
      maxSources: this.#maxSources,
      retainedHints: this.#dirty.size,
      maxHints: this.#maxHints,
      overflowed: this.#droppedHints > 0,
      droppedHints: this.#droppedHints,
      watcherErrors: this.#watcherErrors,
      partialStarts: this.#partialStarts,
      reasons,
    };
  }

  #rememberHealthReason(reason: string): void {
    if (this.#healthReasons.size < MAX_HEALTH_REASONS) this.#healthReasons.add(reason);
    else this.#healthReasons.add("additional watcher health issues occurred");
  }

  #trimHints(): void {
    while (this.#dirty.size > this.#maxHints) {
      const oldest = this.#dirty.keys().next().value;
      if (oldest === undefined) break;
      this.#dirty.delete(oldest);
      this.#droppedHints += 1;
      this.#rememberHealthReason("dirty hint retention overflow");
    }
  }

  #addSubscription(path: string, role: RelationshipDependencyRole, recursive: boolean): number {
    let sourceStats: ReturnType<typeof statSync> | undefined;
    try {
      sourceStats = statSync(path, { throwIfNoEntry: false });
    } catch (error) {
      throw new Error(sourceUnavailableReason(error), { cause: error });
    }
    const parent = dirname(path);
    let parentStats: ReturnType<typeof statSync> | undefined;
    try {
      parentStats = statSync(parent, { throwIfNoEntry: false });
    } catch (error) {
      throw new Error(sourceUnavailableReason(error), { cause: error });
    }
    if (!parentStats?.isDirectory())
      throw new Error(sourceUnavailableReason(new Error("parent directory is unavailable")));
    if (!sourceStats && recursive)
      this.#rememberHealthReason(
        "recursive source is absent; only parent replacement events are watched",
      );
    const specs =
      sourceStats?.isDirectory() && recursive
        ? [{ root: path, recursive: true }]
        : [{ root: parent, recursive: false }];
    const groupKeys: string[] = [];
    const createdGroups: WatchGroup[] = [];
    try {
      for (const spec of specs) {
        const key = `${spec.root}\u0000${spec.recursive ? "recursive" : "direct"}`;
        let group = this.#groups.get(key);
        if (!group) {
          group = {
            key,
            root: spec.root,
            recursive: spec.recursive,
            subscriptions: new Map(),
            watchRecursive: spec.recursive,
            watcher: undefined,
          };
          this.#groups.set(key, group);
          createdGroups.push(group);
        }
        if (!group.watcher) group.watcher = this.#openWatcher(group);
        groupKeys.push(key);
      }
    } catch (error) {
      for (const group of createdGroups) {
        if (group.subscriptions.size !== 0) continue;
        this.#groups.delete(group.key);
        group.watcher?.close();
        group.watcher = undefined;
      }
      throw new Error(sourceUnavailableReason(error), { cause: error });
    }
    const token = ++this.#nextToken;
    const subscription: WatchSubscription = {
      token,
      path,
      role,
      directory: sourceStats?.isDirectory() ?? recursive,
      recursive,
      groupKeys,
    };
    for (const key of groupKeys) {
      const group = this.#groups.get(key);
      if (!group) throw new Error("Relationship watcher group was not created");
      group.subscriptions.set(token, subscription);
    }
    this.#subscriptions.set(token, subscription);
    return token;
  }

  #openWatcher(group: WatchGroup): FSWatcher {
    const onChange = (_event: string, name: string | Buffer | null) => {
      const changed =
        name === null
          ? undefined
          : resolve(group.root, typeof name === "string" ? name : name.toString());
      for (const subscription of group.subscriptions.values()) {
        if (changed === undefined) {
          this.markDirty(subscription.path, subscription.role, "filesystem change");
        } else if (
          changed === subscription.path ||
          (group.watchRecursive &&
            subscription.directory &&
            subscription.recursive &&
            isInsideOrEqual(subscription.path, changed))
        ) {
          this.markDirty(changed, subscription.role, "filesystem change");
          if (changed === subscription.path && subscription.directory && subscription.recursive)
            this.#refreshDirectoryGroup(subscription);
        }
      }
    };
    let watcher: FSWatcher;
    try {
      watcher = watch(group.root, { recursive: group.recursive }, onChange);
      group.watchRecursive = group.recursive;
    } catch (error) {
      if (!group.recursive || !isRecursiveUnsupported(error)) throw error;
      this.#rememberHealthReason(watcherFailureReason(error, true));
      watcher = watch(group.root, { recursive: false }, onChange);
      group.watchRecursive = false;
    }
    watcher.on("error", (error: Error) => {
      this.#watcherErrors += 1;
      this.#rememberHealthReason(watcherFailureReason(error, group.recursive));
      if (group.watcher !== watcher) return;
      group.watcher = undefined;
      try {
        watcher.close();
      } catch {
        this.#rememberHealthReason("filesystem watcher close failed");
      }
    });
    watcher.on("close", () => {
      if (group.watcher !== watcher) return;
      group.watcher = undefined;
      if (group.subscriptions.size)
        this.#rememberHealthReason("filesystem watcher closed while subscriptions remained");
    });
    return watcher;
  }

  #refreshDirectoryGroup(subscription: WatchSubscription): void {
    const key = subscription.groupKeys.find((groupKey) => this.#groups.get(groupKey)?.recursive);
    if (key === undefined) return;
    const group = this.#groups.get(key);
    if (!group || group.watcher) return;
    let stats: ReturnType<typeof statSync> | undefined;
    try {
      stats = statSync(subscription.path, { throwIfNoEntry: false });
    } catch {
      this.#rememberHealthReason("directory watcher refresh could not inspect the source");
      return;
    }
    if (!stats?.isDirectory()) return;
    try {
      group.watcher = this.#openWatcher(group);
    } catch (error) {
      this.#rememberHealthReason(watcherFailureReason(error, true));
    }
  }

  #releaseToken(token: number): void {
    const subscription = this.#subscriptions.get(token);
    if (!subscription) return;
    this.#subscriptions.delete(token);
    for (const groupKey of subscription.groupKeys) {
      const group = this.#groups.get(groupKey);
      if (!group) continue;
      group.subscriptions.delete(token);
      if (group.subscriptions.size !== 0) continue;
      this.#groups.delete(group.key);
      const watcher = group.watcher;
      group.watcher = undefined;
      watcher?.close();
    }
  }
}
