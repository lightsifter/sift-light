import { open } from "node:fs/promises";
import type { DataSourceConfig } from "./data-source-config.js";
import { objectValue } from "./data-source-config.js";

export type DataSourceFailureCode =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "stale"
  | "unavailable"
  | "timeout"
  | "cancelled"
  | "protocol"
  | "configuration";
export class DataSourceError extends Error {
  readonly code: DataSourceFailureCode;
  constructor(code: DataSourceFailureCode) {
    super(`Data source request failed: ${code}`);
    this.code = code;
  }
}
const MAX_RESPONSE_BYTES = 1024 * 1024;

async function credential(config: DataSourceConfig): Promise<string | undefined> {
  let value: string | undefined;
  if (config.tokenEnv) value = process.env[config.tokenEnv];
  if (config.tokenFile) {
    try {
      const handle = await open(config.tokenFile, "r");
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > 16384) throw new DataSourceError("configuration");
        value = (await handle.readFile("utf8")).trim();
      } finally {
        await handle.close();
      }
    } catch {
      throw new DataSourceError("configuration");
    }
  }
  if (
    (config.tokenEnv || config.tokenFile) &&
    (!value || value.length > 16384 || /[\r\n\0]/u.test(value))
  )
    throw new DataSourceError("configuration");
  return value;
}

/** No redirects or automatic retries: authentication never follows a remote Location. */
export async function sourcePost(
  config: DataSourceConfig,
  path: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  try {
    signal.throwIfAborted();
    const token = await credential(config);
    signal.throwIfAborted();
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const status = response.status;
      throw new DataSourceError(
        status === 401
          ? "unauthorized"
          : status === 403
            ? "forbidden"
            : status === 404
              ? "not-found"
              : status === 409 || status === 410
                ? "stale"
                : "unavailable",
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw new DataSourceError("protocol");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        // oxlint-disable-next-line no-await-in-loop -- A stream read depends on the preceding read.
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          // oxlint-disable-next-line no-await-in-loop -- Cancel the owned stream before reporting its exceeded budget.
          await reader.cancel();
          throw new DataSourceError("protocol");
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    try {
      return objectValue(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch {
      throw new DataSourceError("protocol");
    }
  } catch (error) {
    if (error instanceof DataSourceError) throw error;
    if (signal.aborted)
      throw new DataSourceError(
        signal.reason instanceof DOMException && signal.reason.name === "TimeoutError"
          ? "timeout"
          : "cancelled",
      );
    throw new DataSourceError("unavailable");
  }
}
