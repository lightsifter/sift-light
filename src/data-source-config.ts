import { isRecordValue } from "./record-value.js";
import { isAbsolute } from "node:path";

/** Trusted host configuration. Tool arguments can select an id, never an endpoint or credential. */
export interface DataSourceConfig {
  id: string;
  provider: "http-v1" | "byspace";
  baseUrl: string;
  scope: string;
  tokenEnv?: string;
  tokenFile?: string;
  timeoutMs: number;
}

export function objectValue(value: unknown): Record<string, unknown> {
  if (!isRecordValue(value)) throw new Error("Data source protocol expects an object");
  return value;
}

export function boundedText(value: unknown, field: string, maximum = 4096): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximum ||
    /[\0\r\n]/u.test(value)
  )
    throw new Error(`Data source ${field} must be nonempty bounded single-line text`);
  return value;
}

export function parseDataSources(value: unknown): DataSourceConfig[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32)
    throw new Error("dataSources must contain at most 32 configurations");
  const ids = new Set<string>();
  return value.map((candidate) => {
    const raw = objectValue(candidate);
    const allowed = new Set([
      "id",
      "provider",
      "baseUrl",
      "scope",
      "tokenEnv",
      "tokenFile",
      "timeoutMs",
    ]);
    if (Object.keys(raw).some((key) => !allowed.has(key)))
      throw new Error("Unsupported dataSources configuration field");
    const id = boundedText(raw.id, "id", 64);
    if (!/^[a-zA-Z0-9_-]+$/u.test(id) || ids.has(id))
      throw new Error("Data source ids must be unique portable identifiers");
    ids.add(id);
    if (raw.provider !== "http-v1" && raw.provider !== "byspace")
      throw new Error("Unsupported data source provider");
    const baseUrl = boundedText(raw.baseUrl, "baseUrl", 2048);
    const url = new URL(baseUrl);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !(
        url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      )
    )
      throw new Error(
        "Data sources require HTTPS or loopback HTTP, without URL credentials, query or fragment",
      );
    if (raw.tokenEnv !== undefined && raw.tokenFile !== undefined)
      throw new Error("Choose tokenEnv or tokenFile, not both");
    const tokenEnv =
      raw.tokenEnv === undefined ? undefined : boundedText(raw.tokenEnv, "tokenEnv", 128);
    if (tokenEnv && !/^[A-Z][A-Z0-9_]*$/u.test(tokenEnv))
      throw new Error("tokenEnv must name an environment variable");
    const tokenFile =
      raw.tokenFile === undefined ? undefined : boundedText(raw.tokenFile, "tokenFile");
    if (tokenFile && !isAbsolute(tokenFile))
      throw new Error("tokenFile must be an absolute credential file reference");
    const timeoutMs = raw.timeoutMs ?? 10000;
    if (
      typeof timeoutMs !== "number" ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 100 ||
      timeoutMs > 60000
    )
      throw new Error("Data source timeoutMs must be between 100 and 60000");
    return {
      id,
      provider: raw.provider,
      baseUrl: url.href.replace(/\/$/u, ""),
      scope: boundedText(raw.scope, "scope", 256),
      timeoutMs,
      ...(tokenEnv ? { tokenEnv } : {}),
      ...(tokenFile ? { tokenFile } : {}),
    };
  });
}
