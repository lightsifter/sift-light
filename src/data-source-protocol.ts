import { boundedText, objectValue, type DataSourceConfig } from "./data-source-config.js";
import { DataSourceError, sourcePost } from "./data-source-http.js";

export interface ExternalRecord {
  id: string;
  revision: string;
  title: string;
  content: string;
  readKey?: string;
}
export interface ExternalPage {
  records: ExternalRecord[];
  completeness: "complete" | "partial";
  nextPageToken?: string;
}
export interface DataSourceAdapter {
  search(
    query: string,
    limit: number,
    pageToken: string | undefined,
    signal: AbortSignal,
  ): Promise<ExternalPage>;
  read(
    id: string,
    revision: string,
    readKey: string | undefined,
    signal: AbortSignal,
  ): Promise<ExternalRecord>;
}

export function contentText(value: unknown): string {
  if (typeof value !== "string" || Buffer.byteLength(value) > 65536)
    throw new DataSourceError("protocol");
  return value;
}
export function parseExternalRecord(value: unknown): ExternalRecord {
  try {
    const raw = objectValue(value);
    return {
      id: boundedText(raw.id, "record id", 256),
      revision: boundedText(raw.revision, "revision", 256),
      title: boundedText(raw.title, "title", 1024),
      content: contentText(raw.content),
      ...(raw.readKey === undefined ? {} : { readKey: boundedText(raw.readKey, "readKey", 1024) }),
    };
  } catch {
    throw new DataSourceError("protocol");
  }
}

/** Version 1 is a read-only JSON protocol; all operations remain scoped and reauthorize remotely. */
export class HttpDataSource implements DataSourceAdapter {
  private readonly config: DataSourceConfig;
  constructor(config: DataSourceConfig) {
    this.config = config;
  }
  async #request(
    path: string,
    payload: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const value = await sourcePost(
      this.config,
      path,
      { version: 1, scope: this.config.scope, ...payload },
      signal,
    );
    if (value.version !== 1) throw new DataSourceError("protocol");
    return value;
  }
  async search(
    query: string,
    limit: number,
    pageToken: string | undefined,
    signal: AbortSignal,
  ): Promise<ExternalPage> {
    const value = await this.#request(
      "/search",
      { query, limit, ...(pageToken ? { pageToken } : {}) },
      signal,
    );
    if (
      !Array.isArray(value.records) ||
      value.records.length > limit ||
      (value.completeness !== "complete" && value.completeness !== "partial")
    )
      throw new DataSourceError("protocol");
    const nextPageToken =
      value.nextPageToken === undefined
        ? undefined
        : boundedText(value.nextPageToken, "pageToken", 2048);
    return {
      records: value.records.map(parseExternalRecord),
      completeness: value.completeness,
      ...(nextPageToken ? { nextPageToken } : {}),
    };
  }
  async read(
    id: string,
    revision: string,
    readKey: string | undefined,
    signal: AbortSignal,
  ): Promise<ExternalRecord> {
    const value = await this.#request(
      "/read",
      { id, revision, ...(readKey ? { readKey } : {}) },
      signal,
    );
    const record = parseExternalRecord(value.record);
    if (record.id !== id || record.revision !== revision) throw new DataSourceError("stale");
    return record;
  }
}
