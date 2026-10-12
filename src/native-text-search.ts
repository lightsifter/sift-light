import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { NativeTextConfig } from "./native-text-config.js";
import type { ConceptSearchRunner } from "./concept-search.js";
import {
  verifyConceptSourceGeneration,
  conceptSourceSummary,
} from "./concept-source-generation.js";
import { SourceDocument, type SourceReference } from "./source-document.js";
import { rangeEvidence } from "./analysis-evidence.js";
import type { AnalysisItem } from "./analysis-types.js";
import { OwnedTaskQueue } from "./owned-task-queue.js";
import { NativeTextWorkerClient } from "./native-text-worker-client.js";
import { abortError, SiftLightError } from "./errors.js";

function withLane(items: readonly AnalysisItem[], lane: string): AnalysisItem[] {
  return items.map((item, index) => ({
    ...item,
    label: `${lane} #${String(index + 1)}: ${item.label}`,
    details: { ...item.details, retrievalLane: lane, laneRank: index + 1 },
  }));
}

export function interleaveRetrievalLanes(
  current: readonly AnalysisItem[],
  native: readonly AnalysisItem[],
): AnalysisItem[] {
  const result: AnalysisItem[] = [];
  for (let i = 0; i < Math.max(current.length, native.length); i++) {
    if (current[i]) result.push(current[i]!);
    if (native[i]) result.push(native[i]!);
  }
  return result;
}

/** One service-owned staging index. Only admitted source bytes enter the native process. */
export function createNativeTextSearch(
  config: NativeTextConfig,
  search: ConceptSearchRunner,
): { search: ConceptSearchRunner; close: () => Promise<void> } {
  const queue = new OwnedTaskQueue();
  let directory: Promise<string> | undefined;
  const known = new Map<string, { source: SourceReference; staged: string; hash: string }>();
  let closed = false;
  let worker: NativeTextWorkerClient | undefined;
  const run: ConceptSearchRunner = (input, access, progress, options) =>
    queue.run(async () => {
      if (closed) throw new SiftLightError("Native text search is closed");
      directory ??= mkdtemp(join(tmpdir(), "sift-native-text-")).then((path) => realpath(path));
      const root = await directory;
      const corpus = join(root, "corpus");
      await mkdir(corpus, { recursive: true });
      const admitted = new Map<string, { source: SourceReference; staged: string; hash: string }>();
      const execution = await search(input, access, progress, {
        ...options,
        verifySourceGeneration: false,
        onSourceBatch: async (documents) => {
          await options?.onSourceBatch?.(documents);
          for (const document of documents) {
            if (access.signal?.aborted) throw abortError();
            const path = document.path;
            const relative = isAbsolute(path)
              ? join(createHash("sha256").update(dirname(path)).digest("hex"), basename(path))
              : path;
            const staged = resolve(corpus, relative);
            if (!staged.startsWith(corpus + "/"))
              throw new SiftLightError("Native staging path escaped its corpus");
            const hash = createHash("sha256").update(document.bytes).digest("hex");
            const previous = known.get(path);
            if (!previous || previous.hash !== hash) {
              // oxlint-disable-next-line no-await-in-loop -- stage admitted documents under the shared source budget.
              await mkdir(dirname(staged), { recursive: true });
              // oxlint-disable-next-line no-await-in-loop -- preserve unchanged file timestamps for incremental indexing.
              await writeFile(staged, document.bytes, { mode: 0o600 });
            }
            const entry = { source: document.reference, staged, hash };
            admitted.set(path, entry);
            known.set(path, entry);
          }
        },
      });
      for (const [path, entry] of known) {
        if (!admitted.has(path)) {
          // oxlint-disable-next-line no-await-in-loop -- remove only service-owned stale staged files before indexing.
          await rm(entry.staged, { force: true });
        }
      }
      known.clear();
      for (const [path, entry] of admitted) known.set(path, entry);
      let nativeItems: AnalysisItem[] = [];
      if (admitted.size) {
        progress?.({
          phase: "native-text-search",
          detail: `${String(admitted.size)} admitted files`,
        });
        worker ??= new NativeTextWorkerClient(config, root, corpus, join(root, "index.sqlite"));
        const response = await worker.search(input.query!, admitted.size, access.signal);
        execution.analysis.stats = {
          ...execution.analysis.stats,
          nativeModelLoads: response.modelReused ? 0 : response.modelLoads,
          nativeModelReused: response.modelReused,
          nativeProcessId: response.processId,
        };
        if (response.indexedFiles !== admitted.size)
          throw new SiftLightError("Native text index did not admit the complete source inventory");
        const byStaged = new Map([...admitted.values()].map((entry) => [entry.staged, entry]));
        const seen = new Set<string>();
        for (const hit of response.hits) {
          if (hit.locator !== `Line ${String(hit.line)}`)
            throw new SiftLightError("Native text returned an inconsistent source locator");
          const entry = byStaged.get(resolve(hit.path));
          if (!entry || seen.has(entry.staged))
            throw new SiftLightError("Native text returned an unknown or duplicate source");
          seen.add(entry.staged);
          // oxlint-disable-next-line no-await-in-loop -- materialize at most ten verified candidate excerpts.
          const content = await readFile(entry.staged);
          if (createHash("sha256").update(content).digest("hex") !== entry.hash)
            throw new SiftLightError("Native staged source changed");
          const document = new SourceDocument(entry.source, content);
          const range = document.lineRange(hit.line);
          nativeItems.push({
            path: document.path,
            line: hit.line,
            source: document.reference,
            range,
            label: `Text retrieval candidate (score ${hit.score.toFixed(4)})`,
            ...rangeEvidence(document, range),
            details: {
              source: "concept",
              kind: "concept-candidate",
              certainty: "candidate",
              score: hit.score,
              nativeLocator: hit.locator,
              nativeChunkIndex: hit.chunkIndex,
              sourceVerified: true,
            },
          });
        }
      }
      if (options?.verifySourceGeneration !== false)
        await verifyConceptSourceGeneration(execution.sourceGeneration, access);
      const current = withLane(execution.analysis.items, "current");
      nativeItems = withLane(nativeItems, "native");
      execution.analysis = {
        ...execution.analysis,
        items: interleaveRetrievalLanes(current, nativeItems),
        lanes: { current, native: nativeItems },
        sourceGeneration: conceptSourceSummary(execution.sourceGeneration),
        reasons: [
          ...execution.analysis.reasons,
          "Independent current and native text rankings are retained. Follow retrievalLanes requests to read each complete lane.",
        ],
        counts: {
          ...execution.analysis.counts,
          nativeFilesIndexed: admitted.size,
          nativeCandidatesRetained: nativeItems.length,
        },
      };
      return execution;
    }, access.signal);
  return {
    search: run,
    close: async () => {
      closed = true;
      await queue.run(async () => {
        try {
          await worker?.close();
        } finally {
          if (directory) await rm(await directory, { recursive: true, force: true });
        }
      });
    },
  };
}
