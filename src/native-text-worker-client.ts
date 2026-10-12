import { z } from "zod";
import type { NativeTextConfig } from "./native-text-config.js";
import { ResidentWorkerClient } from "./resident-worker-client.js";

const responseSchema = z.object({
  version: z.literal(2),
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
        line: z.number().int().positive(),
        chunkIndex: z.number().int().nonnegative(),
        locator: z.string(),
      }),
    )
    .max(10),
});

export type NativeTextResponse = z.infer<typeof responseSchema>;

export class NativeTextWorkerClient {
  readonly #worker: ResidentWorkerClient<NativeTextResponse>;
  constructor(
    config: NativeTextConfig,
    root: string,
    corpus: string,
    index: string,
    idleMs = 60_000,
  ) {
    this.#worker = new ResidentWorkerClient(
      config,
      root,
      corpus,
      index,
      { parse: (value) => responseSchema.parse(value), maxResponseBytes: 128 * 1024 },
      idleMs,
    );
  }
  search(query: string, expectedFiles: number, signal?: AbortSignal): Promise<NativeTextResponse> {
    return this.#worker.search({ query, expectedFiles }, signal);
  }
  close(): Promise<void> {
    return this.#worker.close();
  }
}
