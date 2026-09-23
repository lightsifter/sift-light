import {
  DEFAULT_SIFT_LIGHT_CONFIG,
  DEFAULT_SEMANTIC_JUDGE_CONFIG,
  readSiftLightConfigFile,
  SIFT_LIGHT_CONFIG_ENV,
} from "./config-reader.js";
import {
  createDisabledSemanticJudgeIntegration,
  createConfiguredSemanticJudgeIntegration,
  type SemanticJudgeIntegration,
} from "./semantic-judge.js";

function configuredPath(environment: NodeJS.ProcessEnv): string | undefined {
  const value = environment[SIFT_LIGHT_CONFIG_ENV]?.trim();
  return value || undefined;
}

/**
 * Resolve the MCP-only opt-in without borrowing a host-specific Pi/OMP path.
 * The MCP process must receive the same config path explicitly in its own host
 * environment; an absent path remains an observable, local-only disabled state.
 */
export async function createMcpSearchFeatures(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<{ semanticJudge: SemanticJudgeIntegration; vectorSearchEnabled: boolean }> {
  const path = configuredPath(environment);
  if (!path)
    return {
      semanticJudge: createDisabledSemanticJudgeIntegration(DEFAULT_SEMANTIC_JUDGE_CONFIG),
      vectorSearchEnabled: DEFAULT_SIFT_LIGHT_CONFIG.vectorSearchEnabled === true,
    };

  const config = await readSiftLightConfigFile(path, { missing: "error" });
  return {
    semanticJudge: createConfiguredSemanticJudgeIntegration(config, environment),
    vectorSearchEnabled: config.vectorSearchEnabled === true,
  };
}

export async function createMcpSemanticJudgeIntegration(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<SemanticJudgeIntegration> {
  return (await createMcpSearchFeatures(environment)).semanticJudge;
}

export function mcpSemanticJudgeConfigSource(
  environment: NodeJS.ProcessEnv = process.env,
): "explicit-config" | "not-configured" {
  return configuredPath(environment) ? "explicit-config" : "not-configured";
}
