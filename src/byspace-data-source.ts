import { boundedText, objectValue, type DataSourceConfig } from "./data-source-config.js";
import { DataSourceError, sourcePost } from "./data-source-http.js";
import {
  contentText,
  type DataSourceAdapter,
  type ExternalPage,
  type ExternalRecord,
} from "./data-source-protocol.js";

function record(value: unknown): ExternalRecord {
  try {
    const raw = objectValue(value);
    if (raw.unavailable === true || (raw.status !== undefined && raw.status !== "active"))
      throw new DataSourceError("stale");
    const revision = boundedText(raw.revision, "revision", 256);
    if (!/^[1-9][0-9]*$/u.test(revision)) throw new DataSourceError("protocol");
    return {
      id: boundedText(raw.item_id, "item_id", 256),
      revision,
      title: boundedText(raw.subject || raw.kind || "Memory", "subject", 1024),
      content: contentText(raw.content ?? ""),
      ...(raw.fact_key ? { readKey: boundedText(raw.fact_key, "fact_key", 1024) } : {}),
    };
  } catch (error) {
    if (error instanceof DataSourceError) throw error;
    throw new DataSourceError("protocol");
  }
}

function items(value: Record<string, unknown>, limit: number): unknown[] {
  if (value.status !== "ok" || !Array.isArray(value.items) || value.items.length > limit)
    throw new DataSourceError("protocol");
  return value.items;
}

/** Uses only byspace's authorized read API. Never queries its database or writes memories. */
export class ByspaceDataSource implements DataSourceAdapter {
  private readonly config: DataSourceConfig;
  constructor(config: DataSourceConfig) {
    this.config = config;
  }
  async search(
    query: string,
    limit: number,
    pageToken: string | undefined,
    signal: AbortSignal,
  ): Promise<ExternalPage> {
    if (pageToken) throw new DataSourceError("protocol"); // recall has no pagination contract
    const value = await sourcePost(
      this.config,
      "/v1/memory/recall",
      { conversation_id: this.config.scope, query, limit },
      signal,
    );
    const candidates = items(value, limit);
    const available = candidates.filter((candidate) => objectValue(candidate).unavailable !== true);
    // Recall is top-K, never an exhaustive inventory. Keep that distinction even when the backend reports complete execution.
    return { records: available.map(record), completeness: "partial" };
  }
  async read(
    id: string,
    revision: string,
    readKey: string | undefined,
    signal: AbortSignal,
  ): Promise<ExternalRecord> {
    if (!readKey) throw new DataSourceError("configuration");
    let pageToken: string | undefined;
    const seen = new Set<string>();
    // Fact-key filtering is the current host-authorized content read boundary; provenance contains no body.
    for (let page = 0; page < 10; page++) {
      // oxlint-disable-next-line no-await-in-loop -- Each page requires the opaque token returned by its predecessor.
      const value = await sourcePost(
        this.config,
        "/v1/memory/query",
        {
          conversation_id: this.config.scope,
          known: "current",
          mode: "recall",
          fact_key: readKey,
          limit: 100,
          ...(pageToken ? { page_token: pageToken } : {}),
        },
        signal,
      );
      for (const candidate of items(value, 100)) {
        const raw = objectValue(candidate);
        if (raw.item_id !== id) continue;
        const current = record(raw);
        if (
          current.revision !== revision ||
          current.readKey !== readKey ||
          raw.derived_valid === false
        )
          throw new DataSourceError("stale");
        return current;
      }
      if (!value.next_page_token) throw new DataSourceError("stale");
      pageToken = boundedText(value.next_page_token, "page token", 2048);
      if (seen.has(pageToken)) throw new DataSourceError("protocol");
      seen.add(pageToken);
    }
    throw new DataSourceError("unavailable");
  }
}
