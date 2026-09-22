import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const SIFT_LIGHT_CONFIG_FILE = "sift-light.json";
export const SIFT_LIGHT_CONFIG_ENV = "SIFT_LIGHT_CONFIG";

export type SiftLightLocale = "en" | "zh-CN";
export type SearchEnforcementMode = "hard" | "prefer" | "off";

export const SIFT_LIGHT_ENFORCEMENT_ENV = "SIFT_LIGHT_ENFORCE_SEARCH";

export interface SiftLightConfig {
  locale: SiftLightLocale;
  enforceSearch?: SearchEnforcementMode;
  semanticJudge?: SemanticJudgeConfig;
}

export type SemanticJudgeProvider = "jev";

export const SEMANTIC_JUDGE_API_KEY_ENVS = ["TYPESAFE_API_KEY", "SIFT_LIGHT_JEV_API_KEY"] as const;

export interface SemanticJudgeConfig {
  enabled: boolean;
  provider: SemanticJudgeProvider;
  endpoint: string;
  apiKeyEnv: string;
  model: string;
  timeoutMs: number;
  maxCandidates: number;
  maxRetries: number;
}

export const DEFAULT_SEMANTIC_JUDGE_CONFIG: Readonly<SemanticJudgeConfig> = {
  enabled: false,
  provider: "jev",
  endpoint: "https://api.typesafe.ai/v1/systemone",
  apiKeyEnv: SEMANTIC_JUDGE_API_KEY_ENVS[0],
  model: "jev-latest",
  timeoutMs: 120_000,
  maxCandidates: 20,
  maxRetries: 2,
};

export const DEFAULT_SIFT_LIGHT_CONFIG: Readonly<SiftLightConfig> = {
  locale: "en",
  enforceSearch: "hard",
  semanticJudge: DEFAULT_SEMANTIC_JUDGE_CONFIG,
};

interface RawSiftLightConfig {
  locale?: unknown;
  enforceSearch?: unknown;
  semanticJudge?: unknown;
}

export interface ReadSiftLightConfigOptions {
  missing?: "defaults" | "error";
}

export function resolveSiftLightConfigPath(
  agentDirectory: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configured = environment[SIFT_LIGHT_CONFIG_ENV]?.trim();
  return configured || join(agentDirectory, SIFT_LIGHT_CONFIG_FILE);
}

interface RawSemanticJudgeConfig {
  enabled?: unknown;
  provider?: unknown;
  endpoint?: unknown;
  apiKeyEnv?: unknown;
  model?: unknown;
  timeoutMs?: unknown;
  maxCandidates?: unknown;
  maxRetries?: unknown;
}

function hasErrorCode(error: unknown, codes: string[]): boolean {
  return error instanceof Error && "code" in error && codes.includes(String(error.code));
}

function isMissingFile(error: unknown): boolean {
  return hasErrorCode(error, ["ENOENT"]);
}

function isRawSiftLightConfig(value: unknown): value is RawSiftLightConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRawSemanticJudgeConfig(value: unknown): value is RawSemanticJudgeConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  const candidate = value ?? fallback;
  if (
    typeof candidate !== "number" ||
    !Number.isSafeInteger(candidate) ||
    candidate < minimum ||
    candidate > maximum
  ) {
    throw new Error(
      `Invalid sift-light ${field}: expected an integer from ${String(minimum)} through ${String(maximum)}`,
    );
  }
  return candidate;
}

function parseSemanticJudge(value: unknown, path: string): SemanticJudgeConfig {
  if (value === undefined) return { ...DEFAULT_SEMANTIC_JUDGE_CONFIG };
  if (!isRawSemanticJudgeConfig(value)) {
    throw new Error(`Invalid sift-light config at ${path}: semanticJudge must be an object`);
  }
  const unknown = Object.keys(value).filter(
    (key) =>
      ![
        "enabled",
        "provider",
        "endpoint",
        "apiKeyEnv",
        "model",
        "timeoutMs",
        "maxCandidates",
        "maxRetries",
      ].includes(key),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Invalid sift-light config at ${path}: unsupported semanticJudge fields; accepted fields are enabled, provider, endpoint, apiKeyEnv, model, timeoutMs, maxCandidates and maxRetries`,
    );
  }
  const enabled = value.enabled ?? DEFAULT_SEMANTIC_JUDGE_CONFIG.enabled;
  if (typeof enabled !== "boolean") {
    throw new Error(
      `Invalid sift-light config at ${path}: semanticJudge.enabled must be a boolean`,
    );
  }
  const provider = value.provider ?? DEFAULT_SEMANTIC_JUDGE_CONFIG.provider;
  if (provider !== "jev") {
    throw new Error(`Invalid sift-light config at ${path}: semanticJudge.provider must be "jev"`);
  }
  const endpoint = value.endpoint ?? DEFAULT_SEMANTIC_JUDGE_CONFIG.endpoint;
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 2_048) {
    throw new Error(
      `Invalid sift-light config at ${path}: semanticJudge.endpoint must be a nonempty URL`,
    );
  }
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch (error) {
    throw new Error(`Invalid sift-light config at ${path}: semanticJudge.endpoint must be a URL`, {
      cause: error,
    });
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const secureEndpoint =
    parsedEndpoint.protocol === "https:" ||
    (parsedEndpoint.protocol === "http:" && loopbackHosts.has(parsedEndpoint.hostname));
  if (!secureEndpoint || parsedEndpoint.username || parsedEndpoint.password) {
    throw new Error(
      `Invalid sift-light config at ${path}: semanticJudge.endpoint must use HTTPS, except that HTTP is allowed for localhost loopback development; URL credentials are not allowed`,
    );
  }
  const apiKeyEnv = value.apiKeyEnv ?? DEFAULT_SEMANTIC_JUDGE_CONFIG.apiKeyEnv;
  if (typeof apiKeyEnv !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/u.test(apiKeyEnv)) {
    throw new Error(
      `Invalid sift-light config at ${path}: semanticJudge.apiKeyEnv must be an uppercase environment variable name`,
    );
  }
  const model = value.model ?? DEFAULT_SEMANTIC_JUDGE_CONFIG.model;
  if (
    typeof model !== "string" ||
    model.length === 0 ||
    model.length > 128 ||
    /[\r\n\0]/u.test(model)
  ) {
    throw new Error(
      `Invalid sift-light config at ${path}: semanticJudge.model must be bounded single-line text`,
    );
  }
  return {
    enabled,
    provider,
    endpoint,
    apiKeyEnv,
    model,
    timeoutMs: boundedInteger(
      value.timeoutMs,
      DEFAULT_SEMANTIC_JUDGE_CONFIG.timeoutMs,
      1_000,
      1_200_000,
      `config at ${path}: semanticJudge.timeoutMs`,
    ),
    maxCandidates: boundedInteger(
      value.maxCandidates,
      DEFAULT_SEMANTIC_JUDGE_CONFIG.maxCandidates,
      1,
      20,
      `config at ${path}: semanticJudge.maxCandidates`,
    ),
    maxRetries: boundedInteger(
      value.maxRetries,
      DEFAULT_SEMANTIC_JUDGE_CONFIG.maxRetries,
      0,
      5,
      `config at ${path}: semanticJudge.maxRetries`,
    ),
  };
}

function parseConfig(value: unknown, path: string): SiftLightConfig {
  if (!isRawSiftLightConfig(value)) {
    throw new Error(`Invalid sift-light config at ${path}: expected a JSON object`);
  }
  const unknown = Object.keys(value).filter(
    (key) => !["locale", "enforceSearch", "semanticJudge"].includes(key),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Invalid sift-light config at ${path}: unsupported configuration fields; only locale, enforceSearch and semanticJudge are accepted`,
    );
  }
  const { locale, enforceSearch } = value;
  if (locale !== undefined && locale !== "en" && locale !== "zh-CN") {
    throw new Error(`Invalid sift-light config at ${path}: locale must be "en" or "zh-CN"`);
  }
  const enforcement = normalizeSearchEnforcement(enforceSearch, `config at ${path}`);
  return {
    locale: locale ?? DEFAULT_SIFT_LIGHT_CONFIG.locale,
    enforceSearch: enforcement,
    semanticJudge: parseSemanticJudge(value.semanticJudge, path),
  };
}

export function normalizeSearchEnforcement(value: unknown, source: string): SearchEnforcementMode {
  if (value === undefined || value === "hard") return "hard";
  if (value === "prefer") return "prefer";
  if (value === "off") return "off";
  throw new Error(`Invalid sift-light ${source}: enforceSearch must be "hard", "prefer", or "off"`);
}

/** Native hooks inherit this setting from their host process; absent means fail-safe hard mode. */
export function readNativeSearchEnforcement(
  environment: NodeJS.ProcessEnv = process.env,
): SearchEnforcementMode {
  const value = environment[SIFT_LIGHT_ENFORCEMENT_ENV];
  return normalizeSearchEnforcement(value, `environment variable ${SIFT_LIGHT_ENFORCEMENT_ENV}`);
}

/** Read and validate one host-selected config path. */
export async function readSiftLightConfigFile(
  path: string,
  options: ReadSiftLightConfigOptions = {},
): Promise<SiftLightConfig> {
  try {
    const content = await readFile(path, "utf8");
    return parseConfig(JSON.parse(content), path);
  } catch (error) {
    if (isMissingFile(error)) {
      if (options.missing === "error") {
        throw new Error(
          `sift-light config was not found at ${path}; create it or unset ${SIFT_LIGHT_CONFIG_ENV}`,
          { cause: error },
        );
      }
      return { ...DEFAULT_SIFT_LIGHT_CONFIG };
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid sift-light config at ${path}: ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }
}
