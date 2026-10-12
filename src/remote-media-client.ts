import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { z } from "zod";
import type { HttpMediaConfig } from "./media-config.js";
import { SiftLightError } from "./errors.js";

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_FILE_ID_LENGTH = 128;

class RemoteMediaRequestError extends SiftLightError {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean, options?: ErrorOptions) {
    super(message, options);
    this.name = "RemoteMediaRequestError";
    this.retryable = retryable;
  }
}

export interface RemoteMediaFile {
  id: string;
  path: string;
}

export interface RemoteMediaSearchRequest {
  query?: string;
  imagePath?: string;
  kind: "all" | "image" | "scan";
  expectedFiles: number;
  files: readonly RemoteMediaFile[];
  signal?: AbortSignal;
}

export interface RemoteMediaSearchResponse {
  version: 1;
  id: string;
  indexedFiles: number;
  modelLoads: number;
  modelReused: boolean;
  processId: number;
  hits: Array<{
    path: string;
    score: number;
    kind: "image" | "scan";
    page: number | null;
    chunkCount: number;
    width: number;
    height: number;
  }>;
}

export type RemoteMediaFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const remoteResponseSchema = z
  .object({
    version: z.literal(1),
    indexedFiles: z.number().int().nonnegative(),
    hits: z
      .array(
        z
          .object({
            fileId: z.string().min(1).max(MAX_FILE_ID_LENGTH),
            score: z.number().finite(),
            kind: z.enum(["image", "scan"]),
            page: z.number().int().positive().nullable().optional(),
            chunkCount: z.number().int().positive(),
            width: z.number().int().nonnegative(),
            height: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();

function mimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    case ".heic":
      return "image/heic";
    case ".heif":
      return "image/heif";
    case ".webp":
      return "image/webp";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

async function boundedResponseText(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES)
    throw new SiftLightError("Remote media response exceeded the 4 MiB limit");
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES)
      throw new SiftLightError("Remote media response exceeded the 4 MiB limit");
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- response chunks must be consumed in order.
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        // oxlint-disable-next-line no-await-in-loop -- cancel the owned stream before reporting the bounded failure.
        await reader.cancel();
        throw new SiftLightError("Remote media response exceeded the 4 MiB limit");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(all);
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 529 || status >= 500;
}

function retryDelay(attempt: number): number {
  return Math.min(20_000, 400 * 2 ** attempt);
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted)
    throw signal.reason instanceof Error ? signal.reason : new Error("Operation aborted");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("Operation aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function base64(bytes: Buffer): string {
  return bytes.toString("base64");
}

function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

export class RemoteMediaClient {
  readonly #config: HttpMediaConfig;
  readonly #key: string | undefined;
  readonly #fetcher: RemoteMediaFetcher;

  constructor(
    config: HttpMediaConfig,
    environment: NodeJS.ProcessEnv = process.env,
    fetcher: RemoteMediaFetcher = fetch,
  ) {
    this.#config = config;
    this.#key = config.apiKeyEnv ? environment[config.apiKeyEnv]?.trim() : undefined;
    if (config.apiKeyEnv && !this.#key) {
      throw new SiftLightError(
        `Media provider is configured with ${config.apiKeyEnv}, but that environment variable is missing or empty`,
      );
    }
    this.#fetcher = fetcher;
  }

  async search(request: RemoteMediaSearchRequest): Promise<RemoteMediaSearchResponse> {
    const id = randomUUID();
    const paths = new Map<string, string>();
    const files: Array<{ id: string; mimeType: string; data: string }> = [];
    const fileSizes: number[] = [];
    for (const file of request.files) {
      if (
        file.id.length === 0 ||
        file.id.length > MAX_FILE_ID_LENGTH ||
        /[\r\n\0]/u.test(file.id) ||
        paths.has(file.id)
      )
        throw new SiftLightError("Remote media file ids must be unique bounded text");
      paths.set(file.id, file.path);
      // oxlint-disable-next-line no-await-in-loop -- preflight file sizes before allocating request payloads.
      const metadata = await stat(file.path);
      if (!metadata.isFile()) throw new SiftLightError("Remote media files must be regular files");
      fileSizes.push(metadata.size);
    }
    let imageSize: number | undefined;
    if (request.imagePath !== undefined) {
      const metadata = await stat(request.imagePath);
      if (!metadata.isFile())
        throw new SiftLightError("Remote media query image must be a regular file");
      imageSize = metadata.size;
    }
    const requestSkeleton = JSON.stringify({
      version: 1,
      model: this.#config.model,
      ...(request.query === undefined ? {} : { query: request.query }),
      ...(request.imagePath === undefined
        ? {}
        : { image: { mimeType: mimeType(request.imagePath), data: "" } }),
      kind: request.kind,
      expectedFiles: request.expectedFiles,
      files: [],
    });
    let estimatedBytes = new TextEncoder().encode(requestSkeleton).byteLength;
    if (imageSize !== undefined) estimatedBytes += base64Length(imageSize);
    for (let index = 0; index < request.files.length; index += 1) {
      const file = request.files[index];
      const fileSkeleton = JSON.stringify({
        id: file?.id,
        mimeType: file ? mimeType(file.path) : "application/octet-stream",
        data: "",
      });
      estimatedBytes += new TextEncoder().encode(fileSkeleton).byteLength;
      estimatedBytes += base64Length(fileSizes[index] ?? 0);
    }
    if (request.files.length > 1) estimatedBytes += request.files.length - 1;
    // The estimate reserves the exact JSON metadata and Base64 payload sizes so a
    // rejected request never needs to materialize a corpus larger than the limit.
    if (estimatedBytes > this.#config.maxRequestBytes)
      throw new SiftLightError(
        `Remote media request exceeded the configured ${String(this.#config.maxRequestBytes)} byte limit`,
      );
    for (const file of request.files) {
      files.push({
        id: file.id,
        mimeType: mimeType(file.path),
        // oxlint-disable-next-line no-await-in-loop -- read and bound one admitted file at a time.
        data: base64(await readFile(file.path, { signal: request.signal })),
      });
    }
    const image =
      request.imagePath === undefined
        ? undefined
        : {
            mimeType: mimeType(request.imagePath),
            data: base64(await readFile(request.imagePath, { signal: request.signal })),
          };
    const body = JSON.stringify({
      version: 1,
      model: this.#config.model,
      ...(request.query === undefined ? {} : { query: request.query }),
      ...(image === undefined ? {} : { image }),
      kind: request.kind,
      expectedFiles: request.expectedFiles,
      files,
    });
    if (new TextEncoder().encode(body).byteLength > this.#config.maxRequestBytes)
      throw new SiftLightError(
        `Remote media request exceeded the configured ${String(this.#config.maxRequestBytes)} byte limit`,
      );
    for (let attempt = 0; attempt <= this.#config.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const onParentAbort = (): void => controller.abort(request.signal?.reason);
      request.signal?.addEventListener("abort", onParentAbort, { once: true });
      const timeout = setTimeout(
        () => controller.abort(new Error("Remote media request timed out")),
        this.#config.timeoutMs,
      );
      try {
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (this.#key) headers.authorization = `Bearer ${this.#key}`;
        // oxlint-disable-next-line no-await-in-loop -- retry attempts share one bounded provider budget.
        const response = await this.#fetcher(this.#config.endpoint, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new RemoteMediaRequestError(
            `Remote media provider returned HTTP ${String(response.status)}`,
            retryableStatus(response.status),
          );
        }
        let parsed: z.infer<typeof remoteResponseSchema>;
        try {
          // oxlint-disable-next-line no-await-in-loop -- consume the bounded response before deciding whether to retry.
          const raw: unknown = JSON.parse(await boundedResponseText(response));
          parsed = remoteResponseSchema.parse(raw);
        } catch (error) {
          throw new SiftLightError("Remote media provider returned an invalid response", {
            cause: error,
          });
        }
        if (parsed.indexedFiles !== request.expectedFiles)
          throw new SiftLightError("Remote media provider indexed an unexpected file count");
        return {
          version: 1,
          id,
          indexedFiles: parsed.indexedFiles,
          modelLoads: 0,
          modelReused: true,
          processId: process.pid,
          hits: parsed.hits.map((hit) => {
            const path = paths.get(hit.fileId);
            if (!path)
              throw new SiftLightError("Remote media provider returned an unknown file id");
            return {
              path,
              score: hit.score,
              kind: hit.kind,
              page: hit.page ?? null,
              chunkCount: hit.chunkCount,
              width: hit.width,
              height: hit.height,
            };
          }),
        };
      } catch (error) {
        if (request.signal?.aborted) throw error;
        const retryable =
          error instanceof RemoteMediaRequestError
            ? error.retryable
            : !(error instanceof SiftLightError);
        if (!retryable || attempt >= this.#config.maxRetries) throw error;
        // oxlint-disable-next-line no-await-in-loop -- retries intentionally serialize attempts.
        await waitForRetry(retryDelay(attempt), request.signal);
      } finally {
        clearTimeout(timeout);
        request.signal?.removeEventListener("abort", onParentAbort);
      }
    }
    throw new SiftLightError("Remote media request failed");
  }

  async close(): Promise<void> {}
}

export function mediaMimeType(path: string): string | undefined {
  const type = mimeType(path);
  return type === "application/octet-stream" ? undefined : type;
}
