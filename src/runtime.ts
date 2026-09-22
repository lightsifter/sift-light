import type { SiftlightLocale } from "./config.js";
import type { SiftlightInput, SiftlightSearchOptions, SiftlightService } from "./service.js";
import { type SessionSummarySnapshot, SessionSummary } from "./session-summary.js";
import type { ContextBudget, SiftlightResult } from "./types.js";

export class SiftlightRuntime {
  readonly #service: SiftlightService;
  readonly #summary = new SessionSummary();

  constructor(service: SiftlightService) {
    this.#service = service;
  }

  async search(
    input: SiftlightInput,
    cwd: string,
    signal?: AbortSignal,
    contextBudget?: ContextBudget,
  ): Promise<SiftlightResult> {
    const searchOptions: SiftlightSearchOptions = {};
    if (contextBudget) searchOptions.contextBudget = contextBudget;
    const result = await this.#service.search(input, cwd, signal, searchOptions);
    this.#summary.record(input, result);
    return result;
  }
  recordFailure(): void {
    this.#summary.recordFailure();
  }

  get sessionSummary(): SessionSummarySnapshot {
    return this.#summary.snapshot;
  }

  formatSessionStatus(locale: SiftlightLocale): string | undefined {
    return this.#summary.format(locale);
  }

  clear(): void {
    this.#service.clear();
  }

  async shutdown(): Promise<void> {
    await this.#service.shutdown();
  }

  get snapshotCount(): number {
    return this.#service.snapshotCount;
  }

  get storedMatches(): number {
    return this.#service.storedMatches;
  }
}
