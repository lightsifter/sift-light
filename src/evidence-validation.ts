import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { AnalysisStore } from "./analysis-store.js";
import { abortError, CursorError, SignalGrepError } from "./errors.js";
import { evidenceRecheck } from "./evidence-validity.js";
import { SearchPathPolicy } from "./path-policy.js";
import { sameSourceRevision, sourceRevisionFromStats } from "./source.js";
import { SourceAccess, SourceBudgetError, SyntaxQueue } from "./source-access.js";
import { SourceDocumentError, type SourceReference } from "./source-document.js";
import { SnapshotStore } from "./snapshot-store.js";
import type { AnalysisItem } from "./analysis-types.js";
import type { SearchRequest, SearchScopeDetails, SearchSnapshot, SourceRevision } from "./types.js";
import type {
  EvidenceCoverageStatus,
  EvidenceComparisonTarget,
  EvidenceRecheck,
  EvidenceSourceScope,
  EvidenceSourceStatus,
} from "./validation-types.js";
import { MAX_STRUCTURE_FILES } from "./analysis-limits.js";

export type { EvidenceComparisonTarget } from "./validation-types.js";

export interface SavedEvidenceValidationOptions {
  cursor: string;
  cwd: string;
  signal?: AbortSignal;
  matchIndex?: number;
  analyses: AnalysisStore;
  snapshots: SnapshotStore;
  queue: SyntaxQueue;
  maxFiles?: number;
}

export interface SavedEvidenceValidationResult {
  scope: EvidenceSourceScope;
  sources: readonly EvidenceSourceStatus[];
  coverage: EvidenceCoverageStatus;
  storedPartial: boolean;
  reasons: readonly string[];
  comparisonTarget: EvidenceComparisonTarget;
  recheck: EvidenceRecheck;
}

interface ValidationTarget {
  key: string;
  path: string;
  expected?: SourceReference;
  revision?: SourceRevision;
}

interface ClassifiedFailure {
  status: EvidenceSourceStatus["status"];
  reason: string;
  budgetReached?: boolean;
}

interface ValidationStatus extends EvidenceSourceStatus {
  budgetReached?: boolean;
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}

function systemErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

function policyFailure(error: unknown): boolean {
  return (
    error instanceof SignalGrepError &&
    (error.message.startsWith("Path is inside a protected credential or system area:") ||
      error.message === "Git internals are excluded from search" ||
      error.message === "Path must stay within the working directory")
  );
}

async function confirmWorktreeState(
  path: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<ClassifiedFailure> {
  const absolute = resolve(cwd, path);
  const policy = new SearchPathPolicy(cwd);
  try {
    policy.assertPath(absolute);
    const before = await stat(absolute);
    const beforeCanonical = await realpath(absolute);
    const after = await stat(absolute);
    const afterCanonical = await realpath(absolute);
    if (!before.isFile() || !after.isFile()) {
      return { status: "stale", reason: "Source is no longer a regular file" };
    }
    if (
      beforeCanonical !== afterCanonical ||
      !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(after))
    ) {
      return { status: "stale", reason: "Source changed while checking its availability" };
    }
    return { status: "unknown", reason: "Source could not be read despite a stable path" };
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    const code = systemErrorCode(error);
    if (code === "ENOENT") return { status: "stale", reason: "Source is unavailable" };
    if (code && ["EACCES", "EPERM", "ELOOP", "ENOTDIR"].includes(code)) {
      return { status: "unknown", reason: `Source could not be checked (${code})` };
    }
    if (policyFailure(error)) {
      return {
        status: "unknown",
        reason: error instanceof Error ? error.message : "Path policy denied source",
      };
    }
    throw error;
  }
}

async function failure(
  error: unknown,
  expected: SourceReference | undefined,
  path: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<ClassifiedFailure> {
  if (error instanceof SourceDocumentError) {
    if (error.reason === "source-changed") {
      return { status: "stale", reason: error.message };
    }
    if (error.reason === "source-unavailable" && expected?.origin.kind === "worktree") {
      return confirmWorktreeState(path, cwd, signal);
    }
    return { status: "unknown", reason: error.message };
  }
  if (error instanceof SourceBudgetError)
    return { status: "unknown", reason: error.message, budgetReached: true };
  const code = systemErrorCode(error);
  if (code === "ENOENT" && expected?.origin.kind === "worktree") {
    return confirmWorktreeState(path, cwd, signal);
  }
  if (code && ["EACCES", "EPERM", "ELOOP", "ENOTDIR"].includes(code)) {
    return { status: "unknown", reason: `Source could not be checked (${code})` };
  }
  if (policyFailure(error)) {
    return {
      status: "unknown",
      reason: error instanceof Error ? error.message : "Path policy denied source",
    };
  }
  throw error;
}

function sourceKey(reference: SourceReference): string {
  return JSON.stringify([reference.path, reference.origin]);
}

function revisionKey(path: string, revision: SourceRevision): string {
  return JSON.stringify([path, revision]);
}

function selectedIndex(
  index: number | undefined,
  count: number,
  label: string,
): number | undefined {
  if (index === undefined) return undefined;
  if (!Number.isSafeInteger(index) || index < 1 || index > count) {
    throw new CursorError(
      `matchIndex must select a retained ${label} from 1 through ${String(count)}`,
      "E_CURSOR_OFFSET_INVALID",
    );
  }
  return index;
}

function addUniqueTarget(
  targets: ValidationTarget[],
  seen: Set<string>,
  target: ValidationTarget,
): void {
  if (seen.has(target.key)) return;
  seen.add(target.key);
  targets.push(target);
}

function analysisTargets(
  items: readonly AnalysisItem[],
  matchIndex: number | undefined,
): { targets: ValidationTarget[]; missing: EvidenceSourceStatus[] } {
  const selected = selectedIndex(matchIndex, items.length, "analysis item");
  const selectedItems = selected === undefined ? items : [items[selected - 1]!];
  const targets: ValidationTarget[] = [];
  const missing: EvidenceSourceStatus[] = [];
  const seen = new Set<string>();
  for (const item of selectedItems) {
    const reference = item.source;
    if (!reference) {
      const key = JSON.stringify(["missing", item.path]);
      if (!seen.has(key)) {
        seen.add(key);
        missing.push({
          path: item.path,
          role: "source",
          status: "unknown",
          reason: "Saved analysis item has no source reference",
        });
      }
      continue;
    }
    addUniqueTarget(targets, seen, {
      key: sourceKey(reference),
      path: reference.path,
      expected: reference,
    });
  }
  return { targets, missing };
}

function snapshotTargets(
  snapshot: SearchSnapshot,
  matchIndex: number | undefined,
): { targets: ValidationTarget[]; missing: EvidenceSourceStatus[] } {
  const selected = selectedIndex(matchIndex, snapshot.matches.length, "search match");
  const selectedPaths =
    selected === undefined
      ? [...snapshot.sourceRevisions.keys()]
      : [snapshot.matches[selected - 1]!.absolutePath];
  const targets: ValidationTarget[] = [];
  const missing: EvidenceSourceStatus[] = [];
  const seen = new Set<string>();
  for (const path of selectedPaths) {
    const revision = snapshot.sourceRevisions.get(path);
    if (!revision) {
      const key = JSON.stringify(["missing", path]);
      if (!seen.has(key)) {
        seen.add(key);
        missing.push({
          path,
          role: "source",
          status: "unknown",
          reason: "Saved search has no source revision",
        });
      }
      continue;
    }
    addUniqueTarget(targets, seen, {
      key: revisionKey(path, revision),
      path,
      revision,
    });
  }
  return { targets, missing };
}

async function validateSnapshotTarget(
  target: ValidationTarget,
  cwd: string,
  policy: SearchPathPolicy,
  signal?: AbortSignal,
): Promise<EvidenceSourceStatus> {
  if (!target.revision) throw new Error("Snapshot validation target omitted its revision");
  try {
    const absolute = resolve(cwd, target.path);
    const canonical = await policy.resolveExistingPath(absolute);
    if (!canonical) {
      const result = await confirmWorktreeState(target.path, cwd, signal);
      return { path: target.path, role: "source", ...result };
    }
    const before = await stat(absolute);
    const beforeCanonical = canonical;
    const after = await stat(absolute);
    const afterCanonical = await realpath(absolute);
    if (!before.isFile() || !after.isFile()) {
      return {
        path: target.path,
        role: "source",
        status: "stale",
        reason: "Source is no longer a regular file",
      };
    }
    if (
      beforeCanonical !== afterCanonical ||
      !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(after))
    ) {
      return {
        path: target.path,
        role: "source",
        status: "stale",
        reason: "Source changed while checking its revision",
      };
    }
    const current = sourceRevisionFromStats(after);
    const unchanged = sameSourceRevision(target.revision, current);
    return {
      path: target.path,
      role: "source",
      status: unchanged ? "current" : "stale",
      ...(unchanged ? {} : { reason: "Source revision changed" }),
    };
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    const code = systemErrorCode(error);
    if (code === "ENOENT") {
      const classified = await confirmWorktreeState(target.path, cwd, signal);
      return { path: target.path, role: "source", ...classified };
    }
    const classified = await failure(error, undefined, target.path, cwd, signal);
    return {
      path: target.path,
      role: "source",
      status: classified.status,
      reason: classified.reason,
    };
  }
}

async function validateAnalysisTarget(
  target: ValidationTarget,
  access: SourceAccess,
  cwd: string,
  signal?: AbortSignal,
): Promise<ValidationStatus> {
  if (!target.expected) throw new Error("Analysis validation target omitted its source reference");
  try {
    const current = await access.refresh(target.path, target.expected);
    return {
      path: target.path,
      role: "source",
      status: "current",
      ...(target.expected ? { expected: target.expected } : {}),
      current: current.reference,
    };
  } catch (error) {
    if (isAbort(error, signal)) throw error;
    const classified = await failure(error, target.expected, target.path, cwd, signal);
    return {
      path: target.path,
      role: "source",
      status: classified.status,
      ...(target.expected ? { expected: target.expected } : {}),
      reason: classified.reason,
      ...(classified.budgetReached ? { budgetReached: true } : {}),
    };
  }
}

function comparisonTarget(
  sources: readonly EvidenceSourceStatus[],
  hasUnscopedUnknown: boolean,
): EvidenceComparisonTarget {
  const hasGit = sources.some((source) => source.expected?.origin.kind === "git");
  const hasWorktree = sources.some((source) => source.expected?.origin.kind === "worktree");
  if ((hasGit && hasWorktree) || (hasGit && hasUnscopedUnknown)) return "mixed";
  if (hasGit) return "recorded-git";
  return "current-worktree";
}

function evidenceScope(
  cwd: string,
  scope: SearchScopeDetails | undefined,
  request: SearchRequest | undefined,
): EvidenceSourceScope {
  const path = scope?.path ?? request?.expandedFromPath ?? request?.path ?? ".";
  const include = scope?.glob ?? request?.glob;
  const exclude = scope?.exclude ?? request?.exclude;
  const hidden = scope?.hidden ?? request?.hidden;
  return {
    root: resolve(cwd, path),
    ...(include && include.length > 0 ? { include: [...include] } : {}),
    ...(exclude && exclude.length > 0 ? { exclude: [...exclude] } : {}),
    ...(hidden === undefined ? {} : { hidden }),
  };
}

/* oxlint-disable no-await-in-loop -- one validation owner shares a bounded source budget. */
export async function validateSavedEvidence(
  options: SavedEvidenceValidationOptions,
): Promise<SavedEvidenceValidationResult> {
  let scope: EvidenceSourceScope = { root: resolve(options.cwd) };
  const reasons: string[] = [];
  let storedPartial = false;
  let targets: ValidationTarget[];
  let sources: EvidenceSourceStatus[];
  const missing: EvidenceSourceStatus[] = [];
  const isAnalysis = options.cursor.includes(".analysis.");

  if (isAnalysis) {
    const { stored } = options.analyses.resolve(options.cursor);
    scope = evidenceScope(options.cwd, stored.result.scope, undefined);
    storedPartial = stored.result.partial;
    reasons.push(...stored.result.reasons);
    const selected = analysisTargets(stored.result.items, options.matchIndex);
    targets = selected.targets;
    missing.push(...selected.missing);
    const access = new SourceAccess(options.cwd, options.queue, options.signal, {
      maxFiles: options.maxFiles ?? MAX_STRUCTURE_FILES,
    });
    sources = [...missing];
    let budgetExhausted = false;
    let admittedTargets = 0;
    for (const target of targets) {
      if (options.signal?.aborted) throw abortError();
      if (budgetExhausted || admittedTargets >= access.maxFiles) {
        sources.push({
          path: target.path,
          role: "source",
          status: "unknown",
          ...(target.expected ? { expected: target.expected } : {}),
          reason: "Saved evidence validation source budget is exhausted",
        });
        continue;
      }
      admittedTargets += 1;
      const status = await validateAnalysisTarget(target, access, options.cwd, options.signal);
      const { budgetReached, ...sourceStatus } = status;
      sources.push(sourceStatus);
      if (budgetReached) budgetExhausted = true;
    }
  } else {
    const { snapshot } = options.snapshots.resolve(options.cursor);
    scope = evidenceScope(options.cwd, undefined, snapshot.request);
    storedPartial = !snapshot.snapshotComplete;
    reasons.push(...(snapshot.retention?.reasons ?? []));
    const selected = snapshotTargets(snapshot, options.matchIndex);
    targets = selected.targets;
    missing.push(...selected.missing);
    const policy = new SearchPathPolicy(options.cwd);
    sources = [...missing];
    let checked = 0;
    const maxFiles = options.maxFiles ?? MAX_STRUCTURE_FILES;
    for (const target of targets) {
      if (options.signal?.aborted) throw abortError();
      if (checked >= maxFiles) {
        sources.push({
          path: target.path,
          role: "source",
          status: "unknown",
          reason: "Saved evidence validation source budget is exhausted",
        });
        continue;
      }
      checked += 1;
      sources.push(await validateSnapshotTarget(target, options.cwd, policy, options.signal));
    }
  }

  if (sources.length === 0) reasons.push("No retained source evidence could be validated");
  const uniqueReasons = [...new Set(reasons)];
  const coverage: EvidenceCoverageStatus =
    storedPartial || sources.length === 0 || sources.some((source) => source.status === "unknown")
      ? "partial"
      : "complete";
  const recheck = evidenceRecheck(sources, uniqueReasons, coverage);
  return {
    scope,
    sources,
    coverage,
    storedPartial,
    reasons: uniqueReasons,
    comparisonTarget: comparisonTarget(sources, missing.length > 0),
    recheck,
  };
}
/* oxlint-enable no-await-in-loop */
