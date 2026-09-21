import type { SemanticJudgeConfig } from "./config-reader.js";
import {
  SEMANTIC_JUDGE_CLASSIFICATIONS,
  SEMANTIC_JUDGE_NON_PROOF_CLAIM,
  type AnalysisItem,
  type AnalysisResultSet,
  type SemanticJudgeClassification,
  type SemanticJudgeDetails,
  type SemanticJudgeJudgment,
} from "./analysis-types.js";
import { SignalGrepError } from "./errors.js";

const MAX_CANDIDATE_CHARS = 4_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_ERROR_CHARS = 512;

const CLASSIFICATION_PRIORITY: Readonly<Record<SemanticJudgeClassification, number>> = {
  "implementation-candidate": 0,
  "caller-candidate": 1,
  "mention-only": 2,
  documentation: 3,
  "test-only": 4,
  uncertain: 5,
  irrelevant: 6,
};

export interface SemanticJudgeCandidate {
  id: string;
  excerpt: string;
}

export interface SemanticJudgeResult {
  model: string;
  judgments: SemanticJudgeJudgment[];
  inputTokens?: number;
  outputTokens?: number;
  elapsedMs: number;
}

export type SemanticJudgeRunner = (
  query: string,
  candidates: readonly SemanticJudgeCandidate[],
  signal?: AbortSignal,
) => Promise<SemanticJudgeResult>;

export type SemanticJudgeFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface SemanticJudgeIntegration {
  config: SemanticJudgeConfig;
  runner?: SemanticJudgeRunner;
}

export class SemanticJudgeConfigurationError extends SignalGrepError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SemanticJudgeConfigurationError";
  }
}

class SemanticJudgeRequestError extends SignalGrepError {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean, options?: ErrorOptions) {
    super(message, options);
    this.name = "SemanticJudgeRequestError";
    this.retryable = retryable;
  }
}

interface RawRecord {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_CHARS);
}

function isClassification(value: unknown): value is SemanticJudgeClassification {
  return (
    typeof value === "string" &&
    SEMANTIC_JUDGE_CLASSIFICATIONS.some((classification) => classification === value)
  );
}

function probability(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new SemanticJudgeRequestError(`Semantic judge response has an invalid ${field}`, false);
  }
  return value;
}

function choiceProbability(answer: RawRecord, choice: SemanticJudgeClassification): number {
  const probabilities = answer.probabilities;
  if (!isRecord(probabilities)) return probability(answer.confidence, "confidence");
  return probability(probabilities[choice], `probabilities.${choice}`);
}

function parseJudgment(value: unknown, candidateIndex: number): SemanticJudgeJudgment {
  if (!isRecord(value) || value.type !== "choice" || !isClassification(value.choice)) {
    throw new SemanticJudgeRequestError(
      `Semantic judge response is missing choice answer ${String(candidateIndex + 1)}`,
      false,
    );
  }
  const confidence =
    value.confidence === undefined ? undefined : probability(value.confidence, "confidence");
  return {
    candidateIndex,
    classification: value.choice,
    probability: choiceProbability(value, value.choice),
    ...(confidence === undefined ? {} : { confidence }),
  };
}

function requestBody(
  query: string,
  candidates: readonly SemanticJudgeCandidate[],
  model: string,
): RawRecord {
  const questions: RawRecord = {};
  for (const candidate of candidates) {
    questions[candidate.id] = {
      type: "choice",
      instructions:
        "Classify the candidate by what it actually does for the requested behavior. Judge the code excerpt, not just matching words.",
      criteria: {
        "implementation-candidate":
          "The excerpt appears to implement the requested behavior or its core decision/side effect.",
        "caller-candidate":
          "The excerpt invokes or wires an implementation but does not implement the behavior itself.",
        "mention-only":
          "The excerpt mentions the topic without implementing or invoking the behavior.",
        documentation:
          "The excerpt is documentation or explanatory prose rather than executable behavior.",
        "test-only": "The excerpt is test or fixture code that describes or checks the behavior.",
        irrelevant: "The excerpt is not meaningfully related to the requested behavior.",
        uncertain: "The excerpt is too incomplete or ambiguous to classify confidently.",
      },
    };
  }
  return {
    state: {
      query,
      candidates: candidates.map(({ id, excerpt }) => ({
        id,
        excerpt,
      })),
    },
    model,
    questions,
  };
}
async function responseText(response: Response): Promise<string> {
  if (!response.body) {
    const contentLength = response.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
      throw new SemanticJudgeRequestError(
        "Semantic judge response exceeded the 4 MiB limit",
        false,
      );
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new SemanticJudgeRequestError(
        "Semantic judge response exceeded the 4 MiB limit",
        false,
      );
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- streaming response chunks must be read in order.
      const result = await reader.read();
      if (result.done) break;
      const chunk = result.value;
      bytes += chunk.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        // oxlint-disable-next-line no-await-in-loop -- cancel the owned stream before reporting the bounded-response failure.
        await reader.cancel();
        throw new SemanticJudgeRequestError(
          "Semantic judge response exceeded the 4 MiB limit",
          false,
        );
      }
      chunks.push(chunk);
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

function retryDelay(attempt: number): number {
  return Math.min(20_000, 400 * 2 ** attempt);
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted)
    throw signal.reason instanceof Error ? signal.reason : new Error("Operation aborted");
  await new Promise<void>((resolve, reject) => {
    const finish = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("Operation aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createJevRunner(
  config: SemanticJudgeConfig,
  key: string,
  fetcher: SemanticJudgeFetcher,
): SemanticJudgeRunner {
  return async (query, candidates, parentSignal) => {
    const startedAt = performance.now();
    const body = JSON.stringify(requestBody(query, candidates, config.model));
    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const onParentAbort = (): void => controller.abort(parentSignal?.reason);
      parentSignal?.addEventListener("abort", onParentAbort, { once: true });
      const timeout = setTimeout(
        () => controller.abort(new Error("Semantic judge request timed out")),
        config.timeoutMs,
      );
      try {
        // oxlint-disable-next-line no-await-in-loop -- retries intentionally serialize attempts under one request budget.
        const response = await fetcher(config.endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${key}`,
          },
          body,
          signal: controller.signal,
        });
        if (!response.ok) {
          const retryable =
            response.status === 408 ||
            response.status === 429 ||
            response.status === 529 ||
            response.status >= 500;
          throw new SemanticJudgeRequestError(
            `Semantic judge returned HTTP ${String(response.status)}`,
            retryable,
          );
        }
        // oxlint-disable-next-line no-await-in-loop -- parse the current bounded response before deciding whether to retry.
        const raw: unknown = JSON.parse(await responseText(response));
        if (!isRecord(raw) || !isRecord(raw.answers)) {
          throw new SemanticJudgeRequestError(
            "Semantic judge response did not contain answers",
            false,
          );
        }
        const answers = raw.answers;
        const judgments = candidates.map((candidate, index) =>
          parseJudgment(answers[candidate.id], index),
        );
        const model = raw.model ?? config.model;
        if (
          typeof model !== "string" ||
          model.length === 0 ||
          model.length > 128 ||
          /[\r\n\0]/u.test(model)
        ) {
          throw new SemanticJudgeRequestError(
            "Semantic judge response model must be bounded single-line text",
            false,
          );
        }
        const usage = isRecord(raw.usage) ? raw.usage : undefined;
        const inputTokens =
          typeof usage?.input_tokens === "number" &&
          Number.isSafeInteger(usage.input_tokens) &&
          usage.input_tokens >= 0
            ? usage.input_tokens
            : undefined;
        const outputTokens =
          typeof usage?.output_tokens === "number" &&
          Number.isSafeInteger(usage.output_tokens) &&
          usage.output_tokens >= 0
            ? usage.output_tokens
            : undefined;
        return {
          model,
          judgments,
          ...(inputTokens === undefined ? {} : { inputTokens }),
          ...(outputTokens === undefined ? {} : { outputTokens }),
          elapsedMs: Math.round(performance.now() - startedAt),
        };
      } catch (error) {
        if (parentSignal?.aborted) throw error;
        const retryable = error instanceof SemanticJudgeRequestError ? error.retryable : true;
        if (!retryable || attempt >= config.maxRetries) throw error;
        // oxlint-disable-next-line no-await-in-loop -- provider retries share one bounded request budget.
        await waitForRetry(retryDelay(attempt), parentSignal);
      } finally {
        clearTimeout(timeout);
        parentSignal?.removeEventListener("abort", onParentAbort);
      }
    }
    throw new SemanticJudgeRequestError("Semantic judge request failed", false);
  };
}

export function createDisabledSemanticJudgeIntegration(
  config: SemanticJudgeConfig,
): SemanticJudgeIntegration {
  return { config: { ...config, enabled: false } };
}

export function createSemanticJudgeIntegration(
  config: SemanticJudgeConfig,
  environment: NodeJS.ProcessEnv = process.env,
  fetcher: SemanticJudgeFetcher = fetch,
): SemanticJudgeIntegration {
  if (!config.enabled) return createDisabledSemanticJudgeIntegration(config);
  const key = environment[config.apiKeyEnv]?.trim();
  if (!key) {
    throw new SemanticJudgeConfigurationError(
      `Semantic judge is enabled, but environment variable ${config.apiKeyEnv} is missing or empty`,
    );
  }
  if (config.provider !== "jev") {
    throw new SemanticJudgeConfigurationError(
      `Unsupported semantic judge provider: ${String(config.provider)}`,
    );
  }
  return { config, runner: createJevRunner(config, key, fetcher) };
}
function baseDetails(config: SemanticJudgeConfig): SemanticJudgeDetails {
  return {
    enabled: config.enabled,
    provider: config.provider,
    status: config.enabled ? "partial" : "disabled",
    maxCandidates: config.maxCandidates,
    candidatesConsidered: 0,
    judgedCandidates: 0,
    classificationCounts: {},
  };
}

export async function applySemanticJudge(
  result: AnalysisResultSet,
  query: string,
  integration: SemanticJudgeIntegration | undefined,
  signal?: AbortSignal,
): Promise<AnalysisResultSet> {
  const config = integration?.config;
  if (!config || !config.enabled || !integration.runner) {
    return { ...result, ...(config ? { semanticJudge: baseDetails(config) } : {}) };
  }
  const candidates = result.items.slice(0, config.maxCandidates).map((item, index) => ({
    id: `candidate-${String(index + 1)}`,
    excerpt: (item.excerpt ?? "").slice(0, MAX_CANDIDATE_CHARS),
  }));
  const initial = baseDetails(config);
  initial.candidatesConsidered = candidates.length;
  if (candidates.length === 0) {
    return { ...result, semanticJudge: { ...initial, status: "complete", model: config.model } };
  }
  let judged: SemanticJudgeResult;
  try {
    judged = await integration.runner(query, candidates, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    const reason = `Semantic judge unavailable; local semantic candidates retained without behavior classification: ${boundedError(error)}`;
    return {
      ...result,
      partial: true,
      reasons: [...result.reasons, reason],
      semanticJudge: {
        ...initial,
        status: "failed",
        reason,
        model: config.model,
      },
    };
  }
  const judgments = new Map(judged.judgments.map((item) => [item.candidateIndex, item]));
  const counts: Record<string, number> = {};
  for (const judgment of judged.judgments)
    counts[judgment.classification] = (counts[judgment.classification] ?? 0) + 1;
  const order = result.items.map((_item, index) => index);
  order.sort((left, right) => {
    const leftJudgment = judgments.get(left);
    const rightJudgment = judgments.get(right);
    if (!leftJudgment || !rightJudgment) return left - right;
    const priority =
      CLASSIFICATION_PRIORITY[leftJudgment.classification] -
      CLASSIFICATION_PRIORITY[rightJudgment.classification];
    return priority || rightJudgment.probability - leftJudgment.probability || left - right;
  });
  const reordered = order
    .map((index) => {
      const item = result.items[index];
      const judgment = judgments.get(index);
      if (!item || !judgment) return item;
      return Object.assign({}, item, {
        details: Object.assign({}, item.details, {
          semanticJudge: {
            classification: judgment.classification,
            probability: judgment.probability,
            ...(judgment.confidence === undefined ? {} : { confidence: judgment.confidence }),
            model: judged.model,
            claim: SEMANTIC_JUDGE_NON_PROOF_CLAIM,
          },
        }),
      });
    })
    .filter((item): item is AnalysisItem => item !== undefined);
  return {
    ...result,
    items: reordered,
    semanticJudge: {
      ...initial,
      status: "complete",
      model: judged.model,
      judgedCandidates: judged.judgments.length,
      classificationCounts: counts,
      ...(judged.inputTokens === undefined ? {} : { inputTokens: judged.inputTokens }),
      ...(judged.outputTokens === undefined ? {} : { outputTokens: judged.outputTokens }),
      elapsedMs: judged.elapsedMs,
    },
  };
}
