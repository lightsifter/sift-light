import { createHash } from "node:crypto";
import { EvidenceService, isEvidenceRequest } from "./evidence-service.js";
import { ConceptSourceChangedError } from "./concept-source-generation.js";
import type { GitChangeRequest } from "./git-source.js";
import type { SyntaxRoleName } from "./syntax.js";
import { resolve } from "node:path";
import { CursorError, SignalGrepError } from "./errors.js";
import { DISCOVERY_MODE_REQUIRED_ERROR } from "./discovery-errors.js";
import { validateRequestContract } from "./request-contract.js";
import { formatMatchPage, MatchPageSoftLimitError, type MatchPageOptions } from "./format.js";
import { formatSummary } from "./summary.js";
import { summarySourcePreviews } from "./summary-previews.js";
import {
  normalizeRequest,
  type RawSearchInput,
  validateRawSearchInput,
  validateSearchPath,
} from "./request.js";
import { redactSignalGrepResult } from "./redaction.js";
import type { RipgrepRunner } from "./rg.js";
import type { CodeStructureProvider } from "./structure.js";
import { ConceptWorkerExitError, type ConceptSearchRunner } from "./concept-search.js";
import { SearchPathPolicy } from "./path-policy.js";
import { SnapshotStore } from "./snapshot-store.js";
import {
  OPERATION_INITIAL_WAIT_MS,
  OperationLifecycle,
  type OperationProgress,
} from "./operation-lifecycle.js";
import {
  completeOperationResult,
  operationOutcome,
  operationStateResult,
} from "./operation-output.js";
import { modificationTimeBoundsText } from "./source.js";
import { resolveConceptTimeoutMs } from "./concept-model.js";
import {
  LanguageCapabilityCatalog,
  type LanguageCapabilityInventory,
} from "./language-capabilities.js";
import {
  DEFAULT_SUMMARY_FILE_LIMIT,
  MAX_INSPECT_TARGETS,
  MAX_LINE_CHARACTERS,
  MAX_SELECTED_PATHS,
  type ContextBudget,
  type InspectTarget,
  type SearchMode,
  type SearchSnapshot,
  type SearchScopeDetails,
  type SignalGrepDetails,
  type SignalGrepResult,
} from "./types.js";

export interface SignalGrepInput extends RawSearchInput {
  query?: string;
  mode?: SearchMode;
  cursor?: string;
  paths?: string[];
  matchIndex?: number;
  matchIndices?: number[];
  targets?: InspectTarget[];
  line?: number;
  sourceCursor?: string;
  allOf?: string[];
  anyOf?: string[];
  within?: "file" | "function";
  roles?: SyntaxRoleName[];
  changes?: GitChangeRequest;
  symbol?: string;
  maxFilesToParse?: number;
  conceptLimit?: number;
  operationId?: string;
}

export interface SignalGrepServiceOptions {
  runRipgrep: RipgrepRunner;
  snapshots?: SnapshotStore;
  summaryFileLimit?: number;
  structure?: CodeStructureProvider;
  conceptSearch?: ConceptSearchRunner;
}

export interface SignalGrepSearchOptions {
  contextBudget?: ContextBudget;
  onProgress?: (progress: OperationProgress) => void;
}

function filterList(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? [...value] : [value];
}

function capabilitiesResult(inventory: LanguageCapabilityInventory): SignalGrepResult {
  const languageText = inventory.languages.length
    ? inventory.languages
        .map((entry) => {
          const providers = [
            ...new Set(
              inventory.capabilityDefinitions
                .filter((capability) =>
                  entry.capabilities.some((reference) => reference.id === capability.id),
                )
                .map((capability) => capability.provider),
            ),
          ].join(" + ");
          const load = entry.capabilities.length ? "lazy" : "none";
          const names = entry.capabilities.map((reference) => reference.name).join(", ");
          return `${entry.language} (${String(entry.files)} file${entry.files === 1 ? "" : "s"}): ${names || "no language analysis capability is currently registered"}; providers=${providers || "none"}; availability=${entry.availability}; readiness=${entry.readiness}; load=${load}`;
        })
        .join("\n")
    : "No recognized language source files were found in the requested scope.";
  const partial = inventory.partial ? "partial" : "complete";
  const reason = inventory.reasons.length ? `\nReasons: ${inventory.reasons.join("; ")}` : "";
  const text = `Project language capability inventory (${partial}; names-only; providers load lazily).\nLanguage-specific modes:\n${languageText}\nLanguage-neutral modes: ${inventory.neutral.map((capability) => `${capability.name} [${capability.availability}; ${capability.load}]`).join(", ")}.${reason}`;
  return {
    text,
    details: {
      version: 1,
      mode: "capabilities",
      status: inventory.partial ? "partial" : "complete",
      totalMatches: 0,
      storedMatches: 0,
      totalFiles: inventory.languages.reduce((sum, entry) => sum + entry.files, 0),
      returnedMatches: 0,
      snapshotComplete: !inventory.partial,
      capabilities: inventory,
    },
  };
}
interface PathSelection {
  labels: string[];
  absolutePaths: Set<string>;
  key: string;
}

function cursorPathSelection(input: SignalGrepInput, cwd: string): PathSelection | undefined {
  if (input.path !== undefined && input.paths !== undefined) {
    throw new SignalGrepError("Use either path or paths with a cursor, not both");
  }
  const rawPaths = input.paths ?? (input.path === undefined ? [] : [input.path]);
  if (input.paths !== undefined && rawPaths.length === 0) {
    throw new SignalGrepError("paths must contain at least one retained file");
  }
  if (rawPaths.length === 0) return undefined;
  if (rawPaths.length > MAX_SELECTED_PATHS) {
    throw new SignalGrepError(
      `paths cannot contain more than ${String(MAX_SELECTED_PATHS)} entries`,
    );
  }

  const labels: string[] = [];
  const absolutePaths = new Set<string>();
  const policy = new SearchPathPolicy(cwd);
  for (const rawPath of rawPaths) {
    const label = rawPath.replace(/^@/, "");
    validateSearchPath(label, input.paths !== undefined ? "paths" : "path");
    if (label.length === 0) throw new SignalGrepError("Cursor paths cannot be empty");
    const absolutePath = resolve(cwd, label);
    policy.assertPath(absolutePath);
    if (absolutePaths.has(absolutePath)) continue;
    absolutePaths.add(absolutePath);
    labels.push(label);
  }
  const key = createHash("sha256")
    .update([...absolutePaths].toSorted((left, right) => left.localeCompare(right)).join("\0"))
    .digest("hex")
    .slice(0, 16);
  return { labels, absolutePaths, key };
}

function baseDetails(snapshot: SearchSnapshot, mode: SearchMode): SignalGrepDetails {
  const sourceUnverifiedFileCount = new Set(
    snapshot.matches
      .filter((match) => !snapshot.sourceRevisions.has(match.absolutePath))
      .map((match) => match.absolutePath),
  ).size;
  return {
    version: 1,
    mode,
    status: snapshot.snapshotComplete ? "complete" : "partial",
    totalMatches: snapshot.totalMatches,
    storedMatches: snapshot.matches.length,
    totalFiles: snapshot.fileCounts.size,
    returnedMatches: 0,
    snapshotComplete: snapshot.snapshotComplete,
    ...(snapshot.retention ? { retention: snapshot.retention } : {}),
    scope: searchScope(snapshot.request),
    ...(snapshot.request.redact ? { redactionRequested: true } : {}),
    ...(snapshot.truncatedLines > 0 ? { lineContentTruncated: snapshot.truncatedLines } : {}),
    ...(sourceUnverifiedFileCount > 0 ? { sourceUnverifiedFileCount } : {}),
  };
}

function searchScope(request: SearchSnapshot["request"]): SearchScopeDetails {
  const path = request.path ?? ".";
  const requestedPath = request.expandedFromPath ?? path;
  return {
    path,
    requestedPath,
    glob: [...request.glob],
    exclude: [...request.exclude],
    hidden: request.hidden,
    expandedToProjectRoot: request.expandedFromPath !== undefined,
    assertion: path === "." ? "project-wide" : "requested-scope",
    ...(request.modifiedAfterMs !== undefined ? { modifiedAfterMs: request.modifiedAfterMs } : {}),
    ...(request.modifiedBeforeMs !== undefined
      ? { modifiedBeforeMs: request.modifiedBeforeMs }
      : {}),
  };
}

function emptyResultText(scope: SearchScopeDetails): string {
  const filters =
    scope.glob.length ||
    scope.exclude.length ||
    !scope.hidden ||
    scope.modifiedAfterMs !== undefined ||
    scope.modifiedBeforeMs !== undefined
      ? " Include/exclude and hidden-file filters were applied."
      : "";
  const expansion = scope.expandedToProjectRoot
    ? ` after the requested path ${JSON.stringify(scope.requestedPath)} also returned no matches`
    : "";
  const range = scope.assertion === "project-wide" ? "project root" : "requested path";
  return `No matches found anywhere in ${range} ${JSON.stringify(scope.path)}${expansion}.${filters}${modificationTimeBoundsText(scope.modifiedAfterMs, scope.modifiedBeforeMs)}`;
}

function scopeExpansionNote(scope: SearchScopeDetails | undefined, totalMatches: number): string {
  if (!scope?.expandedToProjectRoot) return "";
  const outcome =
    totalMatches > 0
      ? "returned project-wide matches"
      : "the project root was also searched and had no matches";
  return `\n\n[Scope expanded: requested path ${JSON.stringify(scope.requestedPath)} had no matches; ${outcome} from ${JSON.stringify(scope.path)}.]`;
}

function completenessNote(snapshot: SearchSnapshot): string {
  if (snapshot.snapshotComplete) return "complete snapshot";
  const reasons = snapshot.retention?.reasons.join("; ");
  return `PARTIAL snapshot: retained ${snapshot.matches.length} of ${snapshot.totalMatches} matches; ${reasons ? `${reasons}; ` : ""}narrow the search to retrieve all matches`;
}

function lineExcerptNote(snapshot: SearchSnapshot): string {
  return snapshot.truncatedLines > 0
    ? `\n\n[Line excerpts truncated: ${String(snapshot.truncatedLines)} matching lines in this snapshot; maximum ${String(MAX_LINE_CHARACTERS)} source characters per line. Complete snapshot describes retained matches, not complete source text.]`
    : "";
}

function sourceVerificationNote(details: SignalGrepDetails): string {
  return details.sourceUnverifiedFileCount
    ? `\n\n[Source revision unverified for ${String(details.sourceUnverifiedFileCount)} retained file(s); context and snapshot-scoped inspection require verified source.]`
    : "";
}
function selectContextBudget(
  input: SignalGrepInput,
  mode: SearchMode,
  candidate: ContextBudget | undefined,
): ContextBudget | undefined {
  if (mode !== "auto" || input.limit !== undefined || input.cursor) return undefined;
  return candidate;
}

function matchPageOptions(budget: ContextBudget | undefined): MatchPageOptions {
  if (!budget) return {};
  return { resultTokenBudget: budget.resultTokenBudget };
}

function attachContextBudget(
  result: SignalGrepResult,
  budget: ContextBudget | undefined,
  totalMatches: number,
): SignalGrepResult {
  if (!budget || totalMatches === 0) return result;
  let text = result.text;
  if (budget.tier !== "full") {
    text = `${result.text}\n\n[Budget: ${budget.tier}; context remainder ${budget.contextRemainderPercent}%; auto detail target ${budget.resultTokenBudget} estimated tokens.]`;
  }
  return {
    ...result,
    text,
    details: {
      ...result.details,
      budgetTier: budget.tier,
      contextRemainderPercent: budget.contextRemainderPercent,
      resultTokenBudget: budget.resultTokenBudget,
    },
  };
}

async function waitForSourceRefresh(signal: AbortSignal, delayMs: number): Promise<void> {
  if (signal.aborted)
    throw signal.reason instanceof Error ? signal.reason : new Error("Operation aborted");
  await new Promise<void>((resolveDelay, rejectDelay) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolveDelay();
    }, delayMs);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      rejectDelay(signal.reason instanceof Error ? signal.reason : new Error("Operation aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class SignalGrepService {
  readonly #runRipgrep: RipgrepRunner;
  readonly #snapshots: SnapshotStore;
  readonly #summaryFileLimit: number;
  readonly #capabilities = new LanguageCapabilityCatalog();
  readonly #evidence: EvidenceService;
  #lifecycle = new AbortController();
  readonly #active = new Set<Promise<SignalGrepResult>>();
  #operations: OperationLifecycle<SignalGrepResult>;
  readonly #reusableSummarySnapshots = new WeakSet<SearchSnapshot>();

  constructor(options: SignalGrepServiceOptions) {
    this.#runRipgrep = options.runRipgrep;
    this.#snapshots = options.snapshots ?? new SnapshotStore();
    this.#summaryFileLimit = options.summaryFileLimit ?? DEFAULT_SUMMARY_FILE_LIMIT;
    this.#operations = new OperationLifecycle({ deadlineMs: resolveConceptTimeoutMs() });
    this.#evidence = new EvidenceService(
      this.#runRipgrep,
      this.#snapshots,
      options.structure,
      options.conceptSearch,
    );
  }

  async search(
    input: SignalGrepInput,
    cwd: string,
    signal?: AbortSignal,
    options: SignalGrepSearchOptions = {},
  ): Promise<SignalGrepResult> {
    validateRawSearchInput(input);
    validateRequestContract(input);
    let request: Promise<SignalGrepResult>;
    if (input.mode === "await" || input.mode === "cancel") {
      request = this.#operationCommand(input, cwd, signal);
    } else {
      if (input.operationId !== undefined)
        throw new SignalGrepError("operationId is only valid with mode=await or mode=cancel");
      for (const path of input.paths ?? []) validateSearchPath(path, "paths");
      for (const target of input.targets ?? []) {
        if (target && typeof target.path === "string")
          validateSearchPath(target.path, "targets.path");
      }
      const combined = signal
        ? AbortSignal.any([signal, this.#lifecycle.signal])
        : this.#lifecycle.signal;
      request = this.#isLongRunningQuery(input)
        ? this.#searchOperation(input, cwd, signal, options)
        : this.#search(input, cwd, combined, options);
    }
    this.#active.add(request);
    try {
      const result = await request;
      return input.redact || result.details.redactionRequested
        ? redactSignalGrepResult(result)
        : result;
    } finally {
      this.#active.delete(request);
    }
  }

  #isLongRunningQuery(input: SignalGrepInput): input is SignalGrepInput & {
    mode: "concept" | "hybrid";
  } {
    return (
      (input.mode === "concept" || input.mode === "hybrid") &&
      input.operationId === undefined &&
      input.cursor === undefined
    );
  }

  async #searchOperation(
    input: SignalGrepInput & { mode: "concept" | "hybrid" },
    cwd: string,
    signal: AbortSignal | undefined,
    options: SignalGrepSearchOptions,
  ): Promise<SignalGrepResult> {
    const started = this.#operations.start(
      async (operationSignal, operationId) => {
        const combined = AbortSignal.any([operationSignal, this.#lifecycle.signal]);
        const deadlineAt = this.#operations.get(operationId).deadlineAt;
        this.#operations.updateProgress(operationId, { phase: "queued" });
        let refreshAttempt = 0;
        let workerRestarted = false;
        while (true) {
          try {
            this.#operations.updateProgress(operationId, { phase: "running" });
            // oxlint-disable-next-line no-await-in-loop -- retries share one operation deadline and signal.
            return await this.#search(input, cwd, combined, {
              ...options,
              onProgress: (progress) => this.#operations.updateProgress(operationId, progress),
            });
          } catch (error) {
            if (error instanceof ConceptWorkerExitError) {
              if (workerRestarted || combined.aborted) throw error;
              const remaining = deadlineAt - Date.now();
              if (remaining <= 0) throw error;
              workerRestarted = true;
              this.#operations.updateProgress(operationId, {
                phase: "refreshing",
                detail:
                  "worker restart 1 after unexpected worker termination; completed cache entries are reusable",
              });
              // oxlint-disable-next-line no-await-in-loop -- bounded retry backoff preserves one deadline.
              await waitForSourceRefresh(combined, Math.min(100, remaining));
              continue;
            }
            if (!(error instanceof ConceptSourceChangedError)) throw error;
            if (combined.aborted) throw error;
            const remaining = deadlineAt - Date.now();
            if (remaining <= 0)
              throw new SignalGrepError("Source did not stabilize before the operation deadline", {
                cause: error,
              });
            this.#operations.updateProgress(operationId, {
              phase: "refreshing",
              detail: `generation retry ${String(++refreshAttempt)}: ${error.message}`,
            });
            // oxlint-disable-next-line no-await-in-loop -- bounded retry backoff preserves one deadline.
            await waitForSourceRefresh(combined, Math.min(100, remaining));
          }
        }
      },
      { mode: input.mode, redact: input.redact ?? false, cwd },
    );
    const outcome = await this.#operations.wait(started.id, OPERATION_INITIAL_WAIT_MS, signal);
    return operationOutcome(outcome, input.mode);
  }

  async #operationCommand(
    input: SignalGrepInput,
    cwd: string,
    signal: AbortSignal | undefined,
  ): Promise<SignalGrepResult> {
    if (!input.operationId || typeof input.operationId !== "string")
      throw new SignalGrepError("mode=await and mode=cancel require operationId");
    const existing = this.#operations.get(input.operationId);
    const mode = existing.metadata.mode;
    if (resolve(cwd) !== resolve(existing.metadata.cwd))
      throw new SignalGrepError("Operation belongs to a different working directory");
    const forbidden = Object.keys(input).filter((key) => key !== "mode" && key !== "operationId");
    if (forbidden.length > 0)
      throw new SignalGrepError(
        `${input.mode} accepts only operationId; remove ${forbidden.join(", ")} and copy the returned nextRequest exactly`,
      );
    if (input.mode === "cancel") {
      const cancelled = await this.#operations.cancelAndWait(input.operationId);
      if (cancelled.state === "complete" && cancelled.result !== undefined)
        return completeOperationResult(cancelled.result, cancelled);
      return operationStateResult(cancelled, mode);
    }
    const outcome = await this.#operations.wait(
      input.operationId,
      OPERATION_INITIAL_WAIT_MS,
      signal,
    );
    return operationOutcome(outcome, mode);
  }

  async #search(
    input: SignalGrepInput,
    cwd: string,
    signal?: AbortSignal,
    options: SignalGrepSearchOptions = {},
  ): Promise<SignalGrepResult> {
    if (
      input.cursor !== undefined &&
      (typeof input.cursor !== "string" || input.cursor.trim().length === 0)
    ) {
      throw new CursorError("Invalid cursor. Copy a nonempty cursor from a previous result.");
    }
    const mode = input.mode ?? "auto";
    if (mode === "capabilities") {
      const inventory = await this.#capabilities.inspect({
        cwd,
        ...(input.path !== undefined ? { path: input.path } : {}),
        glob: filterList(input.glob),
        exclude: filterList(input.exclude),
        ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
        ...(signal ? { signal } : {}),
      });
      return capabilitiesResult(inventory);
    }
    const contextBudget = selectContextBudget(input, mode, options.contextBudget);
    if (isEvidenceRequest(input)) return this.#evidence.search(input, cwd, signal, options);
    if (input.query !== undefined) throw new SignalGrepError(DISCOVERY_MODE_REQUIRED_ERROR);
    if (input.maxFilesToParse !== undefined) {
      throw new SignalGrepError("maxFilesToParse is only valid for structural analysis requests");
    }
    if (input.cursor) return this.#continue(input, cwd, signal);
    if (input.paths !== undefined) {
      throw new SignalGrepError("paths can only select retained files from a cursor");
    }
    if (input.matchIndex !== undefined) {
      throw new SignalGrepError("matchIndex requires mode=inspect with a cursor");
    }
    if (input.matchIndices !== undefined || input.targets !== undefined) {
      throw new SignalGrepError("matchIndices and targets require mode=inspect");
    }
    if (input.line !== undefined) throw new SignalGrepError("line requires mode=inspect");

    const request = normalizeRequest(input);
    let scan = await this.#runRipgrep(request, cwd, signal);
    if (scan.totalMatches === 0 && request.path !== undefined && request.scope !== "strict") {
      const { path: requestedPath, ...projectRequest } = request;
      scan = await this.#runRipgrep(
        { ...projectRequest, expandedFromPath: requestedPath },
        cwd,
        signal,
      );
    }
    const snapshot = this.#snapshots.create(scan);
    try {
      let result: SignalGrepResult;

      if (snapshot.totalMatches === 0) {
        const details = baseDetails(snapshot, mode);
        result = {
          text: emptyResultText(details.scope ?? searchScope(snapshot.request)),
          details,
        };
      } else if (snapshot.matches.length === 0) {
        result = await this.#summary(snapshot, mode, cwd, signal);
      } else if (mode === "summary") {
        result = await this.#summary(snapshot, mode, cwd, signal);
      } else if (mode === "matches") {
        result = await this.#page(snapshot, 0, mode, signal);
      } else {
        try {
          const page = await formatMatchPage(snapshot, 0, signal, matchPageOptions(contextBudget));
          result =
            input.limit !== undefined ||
            (snapshot.snapshotComplete && page.nextOffset === snapshot.matches.length)
              ? this.#pageResult(snapshot, 0, mode, page)
              : await this.#summary(snapshot, mode, cwd, signal, 0, contextBudget);
        } catch (error) {
          // Auto can summarize evidence that does not fit its soft detail target.
          // Explicit limits, hard byte bounds, and runtime failures still fail clearly.
          if (input.limit !== undefined || !(error instanceof MatchPageSoftLimitError)) throw error;
          result = await this.#summary(snapshot, mode, cwd, signal, 0, contextBudget);
        }
      }

      result = {
        ...result,
        text: `${scopeExpansionNote(result.details.scope, result.details.totalMatches).trim()}${result.details.scope?.expandedToProjectRoot ? "\n\n" : ""}${result.text}`,
      };
      const budgetedResult = attachContextBudget(result, contextBudget, snapshot.totalMatches);
      return this.#finalize(snapshot, budgetedResult);
    } catch (error) {
      this.#snapshots.delete(snapshot);
      throw error;
    }
  }

  clear(): void {
    this.#lifecycle.abort();
    this.#lifecycle = new AbortController();
    this.#operations.reset();
    this.#snapshots.clear();
    this.#evidence.clear();
  }

  async shutdown(): Promise<void> {
    this.#lifecycle.abort();
    this.#operations.clear();
    const pending = [...this.#active];
    await Promise.allSettled(pending);
    await this.#operations.shutdown();
    this.#snapshots.clear();
    this.#evidence.clear();
    await this.#evidence.shutdown();
  }

  get snapshotCount(): number {
    return this.#snapshots.size;
  }

  get storedMatches(): number {
    return this.#snapshots.storedMatches;
  }

  async #continue(
    input: SignalGrepInput,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<SignalGrepResult> {
    const cursor = input.cursor;
    if (!cursor) throw new CursorError("A cursor is required to continue a search");
    const { snapshot, offset, kind, selectionKey } = this.#snapshots.resolve(cursor);
    const mode = input.mode ?? "auto";
    if (mode === "summary") {
      if (input.path !== undefined || input.paths !== undefined) {
        throw new SignalGrepError("path and paths are not valid while paging a file summary");
      }
      if (kind !== "summary") {
        throw new CursorError(
          "A summary cursor is required to continue a file summary.",
          "E_CURSOR_WRONG_KIND",
        );
      }
      if (offset >= snapshot.fileCounts.size) {
        throw new CursorError("Cursor is already at the end of the file summary.");
      }
      return this.#summary(snapshot, mode, cwd, signal, offset);
    }

    const selection = cursorPathSelection(input, cwd);
    const requestedSelectionKey = selection?.key ?? "all";
    if (kind === "matches" && selectionKey !== requestedSelectionKey) {
      throw new CursorError(
        "A match cursor must continue with the same path selection.",
        "E_CURSOR_OPTIONS_CONFLICT",
      );
    }
    const pageOffset = kind === "summary" ? 0 : offset;
    const result = await this.#page(snapshot, pageOffset, "matches", signal, selection);
    return this.#finalize(snapshot, result, kind === "summary" || selection !== undefined);
  }

  #finalize(
    snapshot: SearchSnapshot,
    result: SignalGrepResult,
    retainSnapshot = false,
  ): SignalGrepResult {
    if (
      !result.details.cursor &&
      !result.details.inspectRequest &&
      !retainSnapshot &&
      !this.#reusableSummarySnapshots.has(snapshot)
    ) {
      this.#snapshots.delete(snapshot);
    }
    return result;
  }

  async #summary(
    snapshot: SearchSnapshot,
    mode: SearchMode,
    cwd: string,
    signal: AbortSignal | undefined,
    offset = 0,
    budget?: ContextBudget,
  ): Promise<SignalGrepResult> {
    this.#reusableSummarySnapshots.add(snapshot);
    const summary = formatSummary(
      snapshot,
      this.#summaryFileLimit,
      offset,
      budget?.resultTokenBudget,
    );
    const details = baseDetails(snapshot, mode);
    const cursor =
      snapshot.fileCounts.size > 0
        ? this.#snapshots.cursor(snapshot, summary.nextOffset, "summary")
        : undefined;
    const fileRange =
      summary.shown > 0
        ? `Files ${String(summary.offset + 1)}-${String(summary.nextOffset)} of ${String(snapshot.fileCounts.size)}, ordered by match count.`
        : "No retained file summaries are available.";
    const omitted =
      summary.omitted > 0 ? `\n… ${String(summary.omitted)} lower-ranked files remain.` : "";
    const preview = await summarySourcePreviews(
      snapshot,
      summary.shownPaths,
      summary.previewByteBudget,
      cwd,
      signal,
    );
    const sampleText = preview.text || summary.previews;
    const indices = preview.text ? preview.indices : summary.sampleIndices;
    const samples = sampleText
      ? `\n\nSamples: bounded source windows; not relevance-ranked or exhaustive.\n${sampleText}`
      : "";
    const sampleOmissions = `\n[Preview limits: at most 5 source files, 2 non-overlapping windows/file, 7 lines/window. File rows and navigation take priority; shown ${preview.text ? preview.windows : summary.previewsShown} previews.]${preview.reasons.length ? `\n[${preview.reasons.map((reason) => reason.slice(0, 200)).join("; ")}]` : ""}`;
    const redaction = snapshot.request.redact ? { redact: true } : {};
    const nextRequest =
      cursor && summary.hasNext ? { cursor, mode: "summary" as const, ...redaction } : undefined;
    const inspectRequest =
      cursor && indices.length
        ? {
            mode: "inspect" as const,
            cursor,
            matchIndices: indices.slice(0, MAX_INSPECT_TARGETS),
            ...redaction,
          }
        : undefined;
    const matchesRequest =
      cursor && snapshot.matches.length > 0 && summary.shownPaths.length
        ? { cursor, paths: summary.shownPaths.slice(0, 1), ...redaction }
        : undefined;
    const followUp = cursor
      ? `\n\nSnapshot cursor="${cursor}".${inspectRequest ? `\nInspect samples: ${JSON.stringify(inspectRequest)}` : ""}${matchesRequest ? `\nRetrieve matching lines: ${JSON.stringify(matchesRequest)}` : ""}${nextRequest ? `\nNext request: ${JSON.stringify(nextRequest)}` : ""}`
      : "";
    const text = `${snapshot.totalMatches} matches across ${snapshot.fileCounts.size} files (${completenessNote(snapshot)}).\n${fileRange}\n\n${summary.body}${omitted}${samples}${sampleOmissions}${lineExcerptNote(snapshot)}${modificationTimeBoundsText(details.scope?.modifiedAfterMs, details.scope?.modifiedBeforeMs)}${followUp}${sourceVerificationNote(details)}`;

    return {
      text,
      details: {
        ...details,
        ...(cursor ? { cursor } : {}),
        ...(nextRequest ? { nextRequest } : {}),
        summaryOffset: summary.offset,
        summaryFilesShown: summary.shown,
        summaryFilesOmitted: summary.omitted,
        summaryPreviewsShown: preview.text ? preview.windows : summary.previewsShown,
        summaryPreviewsOmitted: Math.max(
          0,
          summary.shown -
            (preview.text
              ? new Set(indices.map((index) => snapshot.matches[index - 1]?.displayPath)).size
              : summary.previewsShown),
        ),
      },
    };
  }

  async #page(
    snapshot: SearchSnapshot,
    offset: number,
    mode: SearchMode,
    signal?: AbortSignal,
    selection?: PathSelection,
  ): Promise<SignalGrepResult> {
    if (offset === snapshot.matches.length) {
      throw new CursorError("Cursor is already at the end of the retained snapshot.");
    }

    const pageOptions = selection
      ? {
          metadataReserveBytes:
            1536 + Buffer.byteLength(JSON.stringify({ paths: selection.labels })),
          include: (match: SearchSnapshot["matches"][number]) =>
            selection.absolutePaths.has(match.absolutePath),
        }
      : {};
    const page = await formatMatchPage(snapshot, offset, signal, pageOptions);
    if (page.returnedMatches === 0 && selection) {
      throw new CursorError("No retained matches exist for the selected paths.");
    }
    const missingPaths: string[] = [];
    if (selection) {
      const matchedAbsolutePaths = new Set<string>();
      for (const match of snapshot.matches) {
        if (selection.absolutePaths.has(match.absolutePath)) {
          matchedAbsolutePaths.add(match.absolutePath);
        }
      }
      const selectedAbsolutePaths = [...selection.absolutePaths];
      for (const [index, label] of selection.labels.entries()) {
        const absolutePath = selectedAbsolutePaths[index];
        if (absolutePath !== undefined && !matchedAbsolutePaths.has(absolutePath)) {
          missingPaths.push(label);
        }
      }
    }
    return this.#pageResult(
      snapshot,
      offset,
      mode,
      page,
      selection?.labels,
      missingPaths,
      selection?.key ?? "all",
    );
  }

  #pageResult(
    snapshot: SearchSnapshot,
    offset: number,
    mode: SearchMode,
    page: Awaited<ReturnType<typeof formatMatchPage>>,
    selectedPaths?: string[],
    selectionMissingPaths: string[] = [],
    selectionKey = "all",
  ): SignalGrepResult {
    if (page.returnedMatches === 0) {
      throw new SignalGrepError("The output budget could not fit a single match");
    }

    const cursor = page.hasNext
      ? this.#snapshots.cursor(snapshot, page.nextOffset, "matches", selectionKey)
      : undefined;
    const firstMatch = page.firstMatchIndex ?? offset;
    const lastMatch = page.lastMatchIndex ?? firstMatch;
    const range = `${firstMatch + 1}-${lastMatch + 1}`;
    const selection = selectedPaths ? `; selected ${String(selectedPaths.length)} path(s)` : "";
    const next = cursor
      ? `\n\nContinue with cursor="${cursor}".\nNext request: ${JSON.stringify({ cursor, ...(selectedPaths ? { paths: selectedPaths } : {}), ...(snapshot.request.redact ? { redact: true } : {}) })}`
      : "";
    const missingSelectionNote =
      selectionMissingPaths.length > 0
        ? `\n\n[${String(selectionMissingPaths.length)} selected path(s) had no retained matches.]`
        : "";
    const rangeNote = page.hasMatchRanges
      ? `\n\n[Match columns are 1-based UTF-16 positions${page.hasByteRanges ? "; b ranges use raw UTF-8 bytes" : ""}.]`
      : "";
    const contextNotes: string[] = [];
    if (page.contextChangedFiles.length > 0) {
      contextNotes.push(
        `Context omitted for ${String(page.contextChangedFiles.length)} changed file(s); refresh the search before relying on surrounding lines.`,
      );
    }
    if (page.contextOmittedFiles.length > 0) {
      contextNotes.push(
        `Context unavailable for ${String(page.contextOmittedFiles.length)} file(s); retained matching lines are still shown.`,
      );
    }
    const contextNote = contextNotes.length > 0 ? `\n\n[${contextNotes.join(" ")}]` : "";
    const details = baseDetails(snapshot, mode);

    const inspectRequest: SignalGrepInput | undefined =
      snapshot.truncatedLines > 0
        ? {
            mode: "inspect",
            cursor: this.#snapshots.cursor(snapshot, 0, "matches"),
            matchIndex: firstMatch + 1,
            ...(snapshot.request.redact ? { redact: true } : {}),
          }
        : undefined;
    const inspectNote = inspectRequest
      ? `\nInspect source (choose a visible matchIndex): ${JSON.stringify(inspectRequest)}`
      : "";

    return {
      text: `${page.body}${rangeNote}${contextNote}${missingSelectionNote}\n\n[Matches ${range} of ${snapshot.totalMatches}${selection}; ${completenessNote(snapshot)}.]${lineExcerptNote(snapshot)}${inspectNote}${modificationTimeBoundsText(details.scope?.modifiedAfterMs, details.scope?.modifiedBeforeMs)}${next}${sourceVerificationNote(details)}`,
      details: {
        ...details,
        ...(inspectRequest ? { inspectRequest } : {}),
        returnedMatches: page.returnedMatches,
        ...(page.occurrenceRangesOmitted > 0
          ? { occurrenceRangesOmitted: page.occurrenceRangesOmitted }
          : {}),
        ...(page.occurrenceMatchesTruncated > 0
          ? { occurrenceMatchesTruncated: page.occurrenceMatchesTruncated }
          : {}),
        ...(cursor ? { cursor } : {}),
        ...(cursor
          ? {
              nextRequest: {
                cursor,
                ...(selectedPaths ? { paths: selectedPaths } : {}),
                ...(snapshot.request.redact ? { redact: true } : {}),
              },
            }
          : {}),
        ...(selectedPaths ? { selectedPaths } : {}),
        ...(selectionMissingPaths.length > 0 ? { selectionMissingPaths } : {}),
        ...(page.contextOmittedFiles.length > 0
          ? { contextOmittedFiles: page.contextOmittedFiles }
          : {}),
        ...(page.contextChangedFiles.length > 0
          ? { contextChangedFiles: page.contextChangedFiles }
          : {}),
      },
    };
  }
}
