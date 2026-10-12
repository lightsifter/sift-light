import { parseDataSources, type DataSourceConfig } from "./data-source-config.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseNativeTextConfig, type NativeTextConfig } from "./native-text-config.js";
import type { MediaConfig } from "./media-config.js";

export type { MediaConfig } from "./media-config.js";

export const SIFT_LIGHT_CONFIG_FILE = "sift-light.json";
export const SIFT_LIGHT_CONFIG_ENV = "SIFT_LIGHT_CONFIG";

export type SiftLightLocale = "en" | "zh-CN";
export type SearchEnforcementMode = "hard" | "prefer" | "off";

export const SIFT_LIGHT_ENFORCEMENT_ENV = "SIFT_LIGHT_ENFORCE_SEARCH";

export interface SiftLightConfig {
  nativeText?: NativeTextConfig;
  nativeMedia?: NativeTextConfig;
  media?: MediaConfig;
  dataSources?: DataSourceConfig[];
  locale: SiftLightLocale;
  enforceSearch?: SearchEnforcementMode;
  vectorSearchEnabled?: boolean;
  semanticJudge?: SemanticJudgeConfig;
}

export type SemanticJudgeProvider = "jev" | "http-json";

export const SEMANTIC_JUDGE_API_KEY_ENVS = ["TYPESAFE_API_KEY", "SIFT_LIGHT_JEV_API_KEY"] as const;

export interface SemanticJudgeConfig {
  enabled: boolean;
  provider: SemanticJudgeProvider;
  endpoint: string;
  apiKeyEnv?: string;
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
  vectorSearchEnabled: false,
  semanticJudge: DEFAULT_SEMANTIC_JUDGE_CONFIG,
};

interface RawSiftLightConfig {
  nativeText?: unknown;
  nativeMedia?: unknown;
  media?: unknown;
  dataSources?: unknown;
  locale?: unknown;
  enforceSearch?: unknown;
  vectorSearchEnabled?: unknown;
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

interface RawMediaConfig {
  provider?: unknown;
  endpoint?: unknown;
  apiKeyEnv?: unknown;
  model?: unknown;
  timeoutMs?: unknown;
  maxRetries?: unknown;
  maxRequestBytes?: unknown;
  renderer?: unknown;
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

function isRawMediaConfig(value: unknown): value is RawMediaConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEndpoint(value: unknown, path: string, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) {
    throw new Error(`Invalid sift-light config at ${path}: ${field} must be a nonempty URL`);
  }
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(value);
  } catch (error) {
    throw new Error(`Invalid sift-light config at ${path}: ${field} must be a URL`, {
      cause: error,
    });
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const secureEndpoint =
    parsedEndpoint.protocol === "https:" ||
    (parsedEndpoint.protocol === "http:" && loopbackHosts.has(parsedEndpoint.hostname));
  if (!secureEndpoint || parsedEndpoint.username || parsedEndpoint.password) {
    throw new Error(
      `Invalid sift-light config at ${path}: ${field} must use HTTPS, except that HTTP is allowed for localhost loopback development; URL credentials are not allowed`,
    );
  }
  return value;
}

function parseApiKeyEnv(value: unknown, path: string, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/u.test(value)) {
    throw new Error(
      `Invalid sift-light config at ${path}: ${field} must be an uppercase environment variable name`,
    );
  }
  return value;
}

function parseBoundedModel(value: unknown, path: string, field: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    /[\r\n\0]/u.test(value)
  ) {
    throw new Error(
      `Invalid sift-light config at ${path}: ${field} must be bounded single-line text`,
    );
  }
  return value;
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
  if (provider !== "jev" && provider !== "http-json") {
    throw new Error(
      `Invalid sift-light config at ${path}: semanticJudge.provider must be "jev" or "http-json"`,
    );
  }
  const endpoint = parseEndpoint(
    value.endpoint ?? (provider === "jev" ? DEFAULT_SEMANTIC_JUDGE_CONFIG.endpoint : undefined),
    path,
    "semanticJudge.endpoint",
  );
  const apiKeyEnv =
    parseApiKeyEnv(value.apiKeyEnv, path, "semanticJudge.apiKeyEnv") ??
    (provider === "jev" ? DEFAULT_SEMANTIC_JUDGE_CONFIG.apiKeyEnv : undefined);
  const model = parseBoundedModel(
    value.model ?? (provider === "jev" ? DEFAULT_SEMANTIC_JUDGE_CONFIG.model : undefined),
    path,
    "semanticJudge.model",
  );
  return {
    enabled,
    provider,
    endpoint,
    ...(apiKeyEnv === undefined ? {} : { apiKeyEnv }),
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

function parseMedia(value: unknown, path: string): MediaConfig | undefined {
  if (value === undefined) return undefined;
  if (!isRawMediaConfig(value)) {
    throw new Error(`Invalid sift-light config at ${path}: media must be an object`);
  }
  const unknown = Object.keys(value).filter(
    (key) =>
      ![
        "provider",
        "endpoint",
        "apiKeyEnv",
        "model",
        "timeoutMs",
        "maxRetries",
        "maxRequestBytes",
        "renderer",
      ].includes(key),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Invalid sift-light config at ${path}: unsupported media fields; accepted fields are provider, endpoint, apiKeyEnv, model, timeoutMs, maxRetries, maxRequestBytes and renderer`,
    );
  }
  const provider = value.provider ?? "http-json";
  if (provider !== "http-json") {
    throw new Error(`Invalid sift-light config at ${path}: media.provider must be "http-json"`);
  }
  const endpoint = parseEndpoint(value.endpoint, path, "media.endpoint");
  const apiKeyEnv = parseApiKeyEnv(value.apiKeyEnv, path, "media.apiKeyEnv");
  const model = parseBoundedModel(value.model, path, "media.model");
  const renderer = parseNativeTextConfig(value.renderer, "media.renderer");
  return {
    provider,
    endpoint,
    ...(apiKeyEnv === undefined ? {} : { apiKeyEnv }),
    model,
    timeoutMs: boundedInteger(
      value.timeoutMs,
      120_000,
      1_000,
      1_200_000,
      `config at ${path}: media.timeoutMs`,
    ),
    maxRetries: boundedInteger(value.maxRetries, 2, 0, 5, `config at ${path}: media.maxRetries`),
    maxRequestBytes: boundedInteger(
      value.maxRequestBytes,
      32 * 1024 * 1024,
      1 * 1024 * 1024,
      64 * 1024 * 1024,
      `config at ${path}: media.maxRequestBytes`,
    ),
    ...(renderer === undefined ? {} : { renderer }),
  };
}

function parseConfig(value: unknown, path: string): SiftLightConfig {
  if (!isRawSiftLightConfig(value)) {
    throw new Error(`Invalid sift-light config at ${path}: expected a JSON object`);
  }
  const unknown = Object.keys(value).filter(
    (key) =>
      ![
        "locale",
        "enforceSearch",
        "vectorSearchEnabled",
        "semanticJudge",
        "dataSources",
        "nativeText",
        "nativeMedia",
        "media",
      ].includes(key),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Invalid sift-light config at ${path}: unsupported configuration fields; only locale, enforceSearch, vectorSearchEnabled, semanticJudge, dataSources, nativeText, nativeMedia and media are accepted`,
    );
  }
  const { locale, enforceSearch, vectorSearchEnabled } = value;
  if (locale !== undefined && locale !== "en" && locale !== "zh-CN") {
    throw new Error(`Invalid sift-light config at ${path}: locale must be "en" or "zh-CN"`);
  }
  if (vectorSearchEnabled !== undefined && typeof vectorSearchEnabled !== "boolean") {
    throw new Error(`Invalid sift-light config at ${path}: vectorSearchEnabled must be a boolean`);
  }
  const enforcement = normalizeSearchEnforcement(enforceSearch, `config at ${path}`);
  const nativeText = parseNativeTextConfig(value.nativeText);
  const nativeMedia = parseNativeTextConfig(value.nativeMedia, "nativeMedia");
  const media = parseMedia(value.media, `${path}: media`);
  if (nativeMedia && media)
    throw new Error(`Invalid sift-light config at ${path}: choose nativeMedia or media, not both`);
  if (nativeText && vectorSearchEnabled !== true)
    throw new Error("nativeText requires vectorSearchEnabled:true");
  return {
    ...(nativeText ? { nativeText } : {}),
    ...(nativeMedia ? { nativeMedia } : {}),
    ...(media ? { media } : {}),
    locale: locale ?? DEFAULT_SIFT_LIGHT_CONFIG.locale,
    enforceSearch: enforcement,
    vectorSearchEnabled:
      vectorSearchEnabled ?? DEFAULT_SIFT_LIGHT_CONFIG.vectorSearchEnabled ?? false,
    semanticJudge: parseSemanticJudge(value.semanticJudge, path),
    ...(value.dataSources === undefined
      ? {}
      : { dataSources: parseDataSources(value.dataSources) }),
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
