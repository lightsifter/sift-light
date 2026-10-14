import {
  DEFAULT_ANSWER_SUPPORT_CONFIG,
  type AnswerSupportConfig,
  type SiftLightConfig,
} from "./config-reader.js";
import { SiftLightError } from "./errors.js";

const MAX_EVIDENCE_CHARS = 4_000;
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_REASON_CHARS = 512;

export const ANSWER_SUPPORT_STATUSES = [
  "supported",
  "contradicted",
  "insufficient",
  "unknown",
] as const;
export type AnswerSupportStatus = (typeof ANSWER_SUPPORT_STATUSES)[number];

export interface AnswerSupportEvidence {
  id: string;
  excerpt: string;
  /** The exact retained range when the excerpt also carries surrounding context. */
  selectedExcerpt?: string;
  contextBefore?: string;
  contextAfter?: string;
}

/** Reject incomplete evidence instead of silently removing possible qualifiers. */
export function assertAnswerSupportEvidenceBudget(
  evidence: readonly AnswerSupportEvidence[],
): void {
  for (const item of evidence) {
    const characters =
      item.excerpt.length +
      (item.selectedExcerpt?.length ?? 0) +
      (item.contextBefore?.length ?? 0) +
      (item.contextAfter?.length ?? 0);
    if (characters > MAX_EVIDENCE_CHARS)
      throw new SiftLightError(
        "Answer support evidence exceeds the 4000-character per-item budget; select a smaller range or reduce supportContextLines",
      );
  }
}

export interface AnswerSupportJudgment {
  status: AnswerSupportStatus;
  probability?: number;
  reason?: string;
  evidenceIds?: string[];
}

export interface AnswerSupportResult extends AnswerSupportJudgment {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  elapsedMs: number;
}

export type AnswerSupportRunner = (
  question: string,
  claim: string,
  evidence: readonly AnswerSupportEvidence[],
  signal?: AbortSignal,
) => Promise<AnswerSupportResult>;

export type AnswerSupportFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface AnswerSupportIntegration {
  config: AnswerSupportConfig;
  runner?: AnswerSupportRunner;
}

export class AnswerSupportConfigurationError extends SiftLightError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AnswerSupportConfigurationError";
  }
}

class AnswerSupportRequestError extends SiftLightError {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean, options?: ErrorOptions) {
    super(message, options);
    this.name = "AnswerSupportRequestError";
    this.retryable = retryable;
  }
}

interface RawRecord {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedReason(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.replace(/[\r\n\0]/gu, " ").slice(0, MAX_REASON_CHARS);
}

function parseStatus(value: unknown): AnswerSupportStatus {
  const status =
    typeof value === "string"
      ? ANSWER_SUPPORT_STATUSES.find((candidate) => candidate === value)
      : undefined;
  if (status === undefined)
    throw new AnswerSupportRequestError(
      "Answer support response has an invalid status; expected supported, contradicted, insufficient or unknown",
      false,
    );
  return status;
}

function parseProbability(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)
    throw new AnswerSupportRequestError(
      "Answer support response has an invalid probability",
      false,
    );
  return value;
}

function parseEvidenceIds(value: unknown, ids: ReadonlySet<string>): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !ids.has(id)))
    throw new AnswerSupportRequestError(
      "Answer support response contains an unknown evidence id",
      false,
    );
  return [...new Set(value)];
}

function parseJudgment(
  raw: RawRecord,
  evidence: readonly AnswerSupportEvidence[],
): AnswerSupportJudgment {
  const value = isRecord(raw.judgment)
    ? raw.judgment
    : isRecord(raw.answers) && isRecord(raw.answers.answer)
      ? raw.answers.answer
      : raw;
  const ids = new Set(evidence.map((item) => item.id));
  const probabilityValue = parseProbability(value.probability ?? value.confidence);
  const reason = boundedReason(value.reason ?? value.rationale);
  const evidenceIds = parseEvidenceIds(value.evidenceIds ?? value.supportingEvidence, ids);
  return {
    status: parseStatus(value.status ?? value.choice),
    ...(probabilityValue === undefined ? {} : { probability: probabilityValue }),
    ...(reason === undefined ? {} : { reason }),
    ...(evidenceIds === undefined ? {} : { evidenceIds }),
  };
}

function responseModel(raw: RawRecord, config: AnswerSupportConfig): string {
  const model = raw.model ?? config.model;
  if (
    typeof model !== "string" ||
    model.length === 0 ||
    model.length > 128 ||
    /[\r\n\0]/u.test(model)
  )
    throw new AnswerSupportRequestError("Answer support response model is invalid", false);
  return model;
}

function responseUsage(raw: RawRecord): { inputTokens?: number; outputTokens?: number } {
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
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
  };
}

function requestBody(
  config: AnswerSupportConfig,
  question: string,
  claim: string,
  evidence: readonly AnswerSupportEvidence[],
): RawRecord {
  assertAnswerSupportEvidenceBudget(evidence);
  const boundedEvidence = evidence.map((item) => ({
    id: item.id,
    excerpt: item.excerpt,
    ...(item.selectedExcerpt === undefined ? {} : { selectedExcerpt: item.selectedExcerpt }),
    ...(item.contextBefore === undefined ? {} : { contextBefore: item.contextBefore }),
    ...(item.contextAfter === undefined ? {} : { contextAfter: item.contextAfter }),
  }));
  if (config.provider === "jev") {
    return {
      state: { question, claim, evidence: boundedEvidence },
      model: config.model,
      questions: {
        answer: {
          type: "choice",
          instructions:
            "Assess only whether the claim is supported by the supplied evidence for the supplied question. The selectedExcerpt is the exact retained range; contextBefore and contextAfter are adjacent source lines supplied to catch qualifiers. Do not treat source identity or lexical overlap as support.",
          criteria: {
            supported: "The evidence directly supports the complete claim.",
            contradicted: "The evidence directly conflicts with the claim.",
            insufficient: "The evidence is relevant but does not establish the complete claim.",
            unknown: "The evidence is unavailable, ambiguous or cannot be assessed.",
          },
        },
      },
    };
  }
  return { version: 1, model: config.model, question, claim, evidence: boundedEvidence };
}

async function responseText(response: Response): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES)
      throw new AnswerSupportRequestError(
        "Answer support response exceeded the 4 MiB limit",
        false,
      );
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- response chunks must be read in order
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        void reader.cancel();
        throw new AnswerSupportRequestError(
          "Answer support response exceeded the 4 MiB limit",
          false,
        );
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

function retryDelay(attempt: number): number {
  return Math.min(20_000, 400 * 2 ** attempt);
}

async function fetchResponse(
  config: AnswerSupportConfig,
  key: string | undefined,
  fetcher: AnswerSupportFetcher,
  body: string,
  parentSignal?: AbortSignal,
): Promise<RawRecord> {
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES)
    throw new AnswerSupportRequestError("Answer support request exceeded the 64 KiB limit", false);
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const onAbort = (): void => controller.abort(parentSignal?.reason);
    parentSignal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(
      () => controller.abort(new Error("Answer support request timed out")),
      config.timeoutMs,
    );
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (key) headers.authorization = `Bearer ${key}`;
      // oxlint-disable-next-line no-await-in-loop -- retries are deliberately sequential
      const response = await fetcher(config.endpoint, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const retryable =
          response.status === 408 || response.status === 429 || response.status >= 500;
        throw new AnswerSupportRequestError(
          `Answer support provider returned HTTP ${String(response.status)}`,
          retryable,
        );
      }
      // oxlint-disable-next-line no-await-in-loop -- the response belongs to the current attempt
      const raw: unknown = JSON.parse(await responseText(response));
      if (!isRecord(raw))
        throw new AnswerSupportRequestError("Answer support response must be an object", false);
      return raw;
    } catch (error) {
      if (parentSignal?.aborted) throw error;
      const retryable = error instanceof AnswerSupportRequestError ? error.retryable : true;
      if (!retryable || attempt >= config.maxRetries) throw error;
      // oxlint-disable-next-line no-await-in-loop -- retry backoff must precede the next attempt
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
    } finally {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", onAbort);
    }
  }
  throw new AnswerSupportRequestError("Answer support request failed", false);
}

export function createDisabledAnswerSupportIntegration(
  config: AnswerSupportConfig,
): AnswerSupportIntegration {
  return { config: { ...config, enabled: false } };
}

export function createAnswerSupportIntegration(
  config: AnswerSupportConfig,
  environment: NodeJS.ProcessEnv = process.env,
  fetcher: AnswerSupportFetcher = fetch,
): AnswerSupportIntegration {
  if (!config.enabled) return createDisabledAnswerSupportIntegration(config);
  const key = config.apiKeyEnv ? environment[config.apiKeyEnv]?.trim() : undefined;
  if (config.apiKeyEnv && !key)
    throw new AnswerSupportConfigurationError(
      `Answer support is enabled, but environment variable ${config.apiKeyEnv} is missing or empty`,
    );
  return {
    config,
    runner: async (question, claim, evidence, signal) => {
      const startedAt = performance.now();
      const raw = await fetchResponse(
        config,
        key,
        fetcher,
        JSON.stringify(requestBody(config, question, claim, evidence)),
        signal,
      );
      const usage = responseUsage(raw);
      return {
        ...parseJudgment(raw, evidence),
        model: responseModel(raw, config),
        ...usage,
        elapsedMs: Math.round(performance.now() - startedAt),
      };
    },
  };
}

export function createConfiguredAnswerSupportIntegration(
  config: SiftLightConfig,
  environment: NodeJS.ProcessEnv = process.env,
): AnswerSupportIntegration {
  const support = config.answerSupport ?? DEFAULT_ANSWER_SUPPORT_CONFIG;
  return createAnswerSupportIntegration(support, environment);
}
