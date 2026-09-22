import type { SiftLightLocale } from "./config.js";
import type { SiftLightInput, SiftLightSearchOptions, SiftLightService } from "./service.js";
import { type SessionSummarySnapshot, SessionSummary } from "./session-summary.js";
import type { ContextBudget, SiftLightResult } from "./types.js";

export class SiftLightRuntime {
  readonly #service: SiftLightService;
  readonly #summary = new SessionSummary();

  constructor(service: SiftLightService) {
    this.#service = service;
  }

  async search(
    input: SiftLightInput,
    cwd: string,
    signal?: AbortSignal,
    contextBudget?: ContextBudget,
  ): Promise<SiftLightResult> {
    const searchOptions: SiftLightSearchOptions = {};
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

  formatSessionStatus(locale: SiftLightLocale): string | undefined {
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
