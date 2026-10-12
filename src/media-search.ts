import { OperationLifecycle, type OperationWaitResult } from "./operation-lifecycle.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { z } from "zod";
import type { NativeTextConfig } from "./native-text-config.js";
import { ResidentWorkerClient } from "./resident-worker-client.js";
import { OwnedTaskQueue } from "./owned-task-queue.js";
import { listWorkspaceFiles } from "./workspace-files.js";
import { SearchPathPolicy } from "./path-policy.js";
import { runOwnedProcess } from "./owned-process.js";
import { abortError, SiftLightError } from "./errors.js";

export const mediaRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.enum(["await", "cancel"]), operationId: z.string().uuid() }).strict(),
  z
    .object({
      mode: z.literal("search"),
      path: z.string().min(1).max(4096),
      query: z.string().min(1).max(256).optional(),
      image: z.string().min(1).max(4096).optional(),
      kind: z.enum(["all", "image", "scan"]).default("all"),
      glob: z.array(z.string().max(4096)).max(64).optional(),
      exclude: z.array(z.string().max(4096)).max(64).optional(),
      hidden: z.boolean().default(true),
      ignorePolicy: z.enum(["respect", "include"]).default("respect"),
    })
    .strict()
    .refine(
      (r) => (r.query === undefined) !== (r.image === undefined),
      "Supply exactly one query or image",
    ),
  z
    .object({
      mode: z.enum(["inspect", "validate"]),
      cursor: z.string().uuid(),
      matchIndex: z.number().int().min(1).max(10),
    })
    .strict(),
]);
export type MediaRequest = z.infer<typeof mediaRequestSchema>;
const responseSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  indexedFiles: z.number().int().nonnegative(),
  modelLoads: z.literal(1),
  modelReused: z.boolean(),
  processId: z.number().int().positive(),
  hits: z
    .array(
      z.object({
        path: z.string(),
        score: z.number().finite(),
        kind: z.enum(["image", "scan"]),
        page: z
          .number()
          .int()
          .positive()
          .nullish()
          .transform((value) => value ?? null),
        chunkCount: z.number().int().positive(),
        width: z.number().int().nonnegative(),
        height: z.number().int().nonnegative(),
      }),
    )
    .max(10),
});
type Hit = z.infer<typeof responseSchema>["hits"][number];
interface Source {
  path: string;
  canonical: string;
  hash: string;
  staged: string;
  bytes: number;
}
interface SavedHit {
  hit: Hit;
  source: Source;
}
interface Snapshot {
  cwd: string;
  createdAt: number;
  hits: SavedHit[];
}
export interface MediaResult {
  text: string;
  details: Record<string, unknown>;
  image?: { data: string; mimeType: "image/png" };
}
const extensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".tiff",
  ".tif",
  ".heic",
  ".heif",
  ".webp",
  ".pdf",
]);
const maxFileBytes = 20 * 1024 * 1024;
const maxCorpusBytes = 256 * 1024 * 1024;
function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
async function sourceBytes(
  cwd: string,
  path: string,
  signal?: AbortSignal,
): Promise<{ canonical: string; bytes: Buffer }> {
  const policy = new SearchPathPolicy(cwd);
  const canonical = await policy.resolveExistingPath(path);
  if (!canonical) throw new SiftLightError(`Media source unavailable: ${path}`);
  const before = await stat(canonical);
  if (!before.isFile() || before.size > maxFileBytes)
    throw new SiftLightError(
      `Media source must be a regular file at most ${String(maxFileBytes)} bytes: ${path}`,
    );
  const bytes = await readFile(canonical, { signal });
  const after = await stat(canonical);
  if (
    bytes.length > maxFileBytes ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    before.ctimeMs !== after.ctimeMs ||
    (await policy.resolveExistingPath(path)) !== canonical
  )
    throw new SiftLightError(`Media source changed during read: ${path}`);
  return { canonical, bytes };
}
/** Visual evidence owns its index and shares the local admission policy with text search. */
export class MediaSearch {
  readonly #config: NativeTextConfig;
  readonly #operations = new OperationLifecycle<MediaResult, "media">({ deadlineMs: 300_000 });
  readonly #queue = new OwnedTaskQueue();
  #lifecycle = new AbortController();
  readonly #snapshots = new Map<string, Snapshot>();
  readonly #known = new Map<string, Source>();
  #directory: Promise<string> | undefined;
  #worker: ResidentWorkerClient<z.infer<typeof responseSchema>> | undefined;
  #closed = false;
  constructor(config: NativeTextConfig) {
    this.#config = config;
  }
  async search(value: unknown, cwd: string, signal?: AbortSignal): Promise<MediaResult> {
    const request = mediaRequestSchema.parse(value);
    if (this.#closed) throw new SiftLightError("Media search is closed");
    const combined = signal
      ? AbortSignal.any([signal, this.#lifecycle.signal])
      : this.#lifecycle.signal;
    if (request.mode === "await" || request.mode === "cancel") {
      const operation = this.#operations.get(request.operationId);
      if (operation.metadata.cwd !== resolve(cwd))
        throw new SiftLightError("Media operation belongs to another workspace");
      if (request.mode === "cancel") {
        await this.#operations.cancelAndWait(request.operationId);
      }
      return this.#operationResult(
        await this.#operations.wait(request.operationId, 5000, combined),
      );
    }
    if (request.mode === "search") {
      const operation = this.#operations.start(
        (operationSignal) =>
          this.#queue.run(
            () =>
              this.#search(
                request,
                cwd,
                AbortSignal.any([operationSignal, this.#lifecycle.signal]),
              ),
            operationSignal,
          ),
        { mode: "media", cwd: resolve(cwd), redact: false },
      );
      return this.#operationResult(await this.#operations.wait(operation.id, 5000, combined));
    }
    if (request.mode === "inspect" || request.mode === "validate")
      return this.#queue.run(() => this.#inspect(request, cwd, combined), combined);
    throw new SiftLightError("Unsupported visual request");
  }
  #operationResult(result: OperationWaitResult<MediaResult, "media">): MediaResult {
    if (result.state === "complete") return result.result;
    if (result.state === "failed") throw result.error;
    const details = {
      status: result.state,
      operationId: result.operation.id,
      ...(result.state === "running"
        ? { nextRequest: { mode: "await", operationId: result.operation.id } }
        : {}),
    };
    return { text: JSON.stringify(details), details };
  }
  async #root(): Promise<string> {
    this.#directory ??= mkdtemp(join(tmpdir(), "sift-media-")).then((path) => realpath(path));
    return this.#directory;
  }
  async #search(
    r: Extract<MediaRequest, { mode: "search" }>,
    cwd: string,
    signal: AbortSignal,
  ): Promise<MediaResult> {
    const root = await this.#root();
    const corpus = join(root, "corpus");
    await mkdir(corpus, { recursive: true, mode: 0o700 });
    const options = {
      path: r.path,
      ...(r.glob ? { glob: r.glob } : {}),
      ...(r.exclude ? { exclude: r.exclude } : {}),
      hidden: r.hidden,
      ignore: r.ignorePolicy === "respect",
    };
    const inventory = await listWorkspaceFiles(cwd, signal, options);
    const admitted = new Map<string, Source>();
    const reasons = [...inventory.reasons];
    let total = 0;
    for (const path of inventory.paths) {
      if (!extensions.has(extname(path).toLowerCase())) continue;
      if (signal.aborted) throw abortError();
      if (admitted.size >= 512) {
        reasons.push("Media file admission reached 512 files");
        break;
      }
      // oxlint-disable-next-line no-await-in-loop -- admit files under one aggregate byte budget.
      const source = await sourceBytes(cwd, path, signal);
      if (total + source.bytes.length > maxCorpusBytes) {
        reasons.push("Media corpus exceeded 256 MiB");
        break;
      }
      total += source.bytes.length;
      const staged = join(corpus, hash(Buffer.from(dirname(resolve(cwd, path)))), basename(path));
      const entry = {
        path,
        canonical: source.canonical,
        staged,
        hash: hash(source.bytes),
        bytes: source.bytes.length,
      };
      if (this.#known.get(staged)?.hash !== entry.hash) {
        // oxlint-disable-next-line no-await-in-loop -- preserve timestamps for unchanged admitted files.
        await mkdir(dirname(staged), { recursive: true, mode: 0o700 });
        // oxlint-disable-next-line no-await-in-loop -- stage only verified local bytes.
        await writeFile(staged, source.bytes, { mode: 0o600 });
      }
      admitted.set(staged, entry);
    }
    for (const entry of this.#known.values())
      if (!admitted.has(entry.staged)) {
        await rm(entry.staged, { force: true });
      }
    this.#known.clear();
    for (const [path, entry] of admitted) this.#known.set(path, entry);
    let imageSource: { canonical: string; bytes: Buffer } | undefined;
    let queryImage: string | undefined;
    if (r.image) {
      if (
        !extensions.has(extname(r.image).toLowerCase()) ||
        extname(r.image).toLowerCase() === ".pdf"
      )
        throw new SiftLightError("image must be a supported local image file");
      imageSource = await sourceBytes(cwd, r.image, signal);
      queryImage = join(root, "query" + extname(r.image).toLowerCase());
      await writeFile(queryImage, imageSource.bytes, { mode: 0o600 });
    }
    let response: z.infer<typeof responseSchema> | undefined;
    if (admitted.size) {
      this.#worker ??= new ResidentWorkerClient(
        this.#config,
        root,
        corpus,
        join(root, "index.sqlite"),
        { parse: (value) => responseSchema.parse(value), maxResponseBytes: 128 * 1024 },
      );
      response = await this.#worker.search(
        {
          ...(queryImage ? { image: queryImage } : { query: r.query }),
          kind: r.kind,
          expectedFiles: admitted.size,
        },
        signal,
      );
      if (response.indexedFiles !== admitted.size)
        throw new SiftLightError("Media index inventory mismatch");
    }
    const saved: SavedHit[] = [];
    const seen = new Set<string>();
    for (const hit of response?.hits ?? []) {
      const source = admitted.get(resolve(hit.path));
      if (
        !source ||
        (hit.kind === "scan") !== (extname(source.path).toLowerCase() === ".pdf") ||
        seen.has(hit.path) ||
        (hit.kind === "scan") !== (hit.page !== null) ||
        (hit.page !== null && hit.page > hit.chunkCount)
      )
        throw new SiftLightError("Media result source or page is inconsistent");
      seen.add(hit.path);
      saved.push({ hit, source });
    }
    for (const source of admitted.values()) {
      // oxlint-disable-next-line no-await-in-loop -- verify the complete admitted source generation.
      const current = await sourceBytes(cwd, source.path, signal);
      if (current.canonical !== source.canonical || hash(current.bytes) !== source.hash)
        throw new SiftLightError(`Media source changed: ${source.path}`);
    }
    const after = await listWorkspaceFiles(cwd, signal, options);
    if (JSON.stringify(after) !== JSON.stringify(inventory))
      throw new SiftLightError("Media file inventory changed during search");
    if (imageSource && r.image) {
      const afterImage = await sourceBytes(cwd, r.image, signal);
      if (
        afterImage.canonical !== imageSource.canonical ||
        !afterImage.bytes.equals(imageSource.bytes)
      )
        throw new SiftLightError("Query image changed during search");
    }
    if (signal.aborted) throw abortError();
    const cursor = randomUUID();
    for (const [id, snapshot] of this.#snapshots)
      if (Date.now() - snapshot.createdAt > 600_000) this.#snapshots.delete(id);
    if (this.#snapshots.size >= 32) {
      const oldest = this.#snapshots.keys().next().value;
      if (oldest) this.#snapshots.delete(oldest);
    }
    this.#snapshots.set(cursor, { cwd: resolve(cwd), createdAt: Date.now(), hits: saved });
    const items = saved.map(({ hit, source }, index) => ({
      index: index + 1,
      path: source.path,
      kind: hit.kind,
      page: hit.page,
      score: hit.score,
      pages: hit.kind === "scan" ? hit.chunkCount : undefined,
      width: hit.width,
      height: hit.height,
      sourceHash: source.hash,
      inspect: { mode: "inspect", cursor, matchIndex: index + 1 },
      validate: { mode: "validate", cursor, matchIndex: index + 1 },
    }));
    const status = reasons.length ? "partial" : "complete";
    const details = {
      status,
      cursor,
      indexedFiles: admitted.size,
      admittedBytes: total,
      reasons,
      coverage: r.ignorePolicy === "respect" ? "policy-filtered" : "included",
      modelLoads: response ? (response.modelReused ? 0 : 1) : 0,
      modelReused: response?.modelReused ?? false,
      processId: response?.processId,
      items,
    };
    return {
      text: `Visual search (${status}): ${String(items.length)} candidates. Similarity is a candidate, inspect original evidence before conclusions.\n${JSON.stringify(details)}`,
      details,
    };
  }
  async #inspect(
    r: Extract<MediaRequest, { mode: "inspect" | "validate" }>,
    cwd: string,
    signal: AbortSignal,
  ): Promise<MediaResult> {
    const snapshot = this.#snapshots.get(r.cursor);
    if (!snapshot || Date.now() - snapshot.createdAt > 600_000 || snapshot.cwd !== resolve(cwd))
      throw new SiftLightError("Media cursor expired or belongs to another workspace");
    const item = snapshot.hits[r.matchIndex - 1];
    if (!item) throw new SiftLightError("Media matchIndex is not retained");
    const current = await sourceBytes(cwd, item.source.path, signal);
    const fresh =
      current.canonical === item.source.canonical && hash(current.bytes) === item.source.hash;
    const details = {
      path: item.source.path,
      page: item.hit.page,
      sourceHash: item.source.hash,
      freshness: fresh ? "current" : "stale",
    };
    if (r.mode === "validate") return { text: JSON.stringify(details), details };
    if (!fresh) throw new SiftLightError("Media source changed; search again before inspection");
    const folder = await mkdtemp(join(await this.#root(), "inspect-"));
    try {
      const input = join(folder, "source" + extname(item.source.path));
      const output = join(folder, "preview.png");
      await writeFile(input, current.bytes, { mode: 0o600 });
      const result = await runOwnedProcess(
        {
          executable: this.#config.executable,
          args: ["--render", input, String(item.hit.page ?? 0), output],
          cwd: folder,
          signal,
        },
        async (stdout) => {
          for await (const chunk of stdout)
            if (chunk.length) throw new SiftLightError("Unexpected media renderer output");
        },
      );
      if (result.code !== 0) throw new SiftLightError(`Media preview failed: ${result.stderr}`);
      const preview = await readFile(output);
      if (preview.length > 4 * 1024 * 1024) throw new SiftLightError("Media preview exceeds 4 MiB");
      return {
        text: JSON.stringify(details),
        details,
        image: { data: preview.toString("base64"), mimeType: "image/png" },
      };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }
  clear(): void {
    this.#lifecycle.abort();
    this.#lifecycle = new AbortController();
    this.#operations.reset();
    this.#snapshots.clear();
  }
  async close(): Promise<void> {
    this.#closed = true;
    this.#lifecycle.abort();
    await this.#operations.shutdown();
    await this.#queue.run(async () => {
      try {
        await this.#worker?.close();
      } finally {
        this.#snapshots.clear();
        if (this.#directory) await rm(await this.#directory, { recursive: true, force: true });
      }
    });
  }
}
