import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  readSiftLightConfigFile,
  resolveSiftLightConfigPath,
  SIFT_LIGHT_CONFIG_ENV,
  type SiftLightConfig,
} from "./config-reader.js";

export {
  DEFAULT_SIFT_LIGHT_CONFIG,
  DEFAULT_SEMANTIC_JUDGE_CONFIG,
  normalizeSearchEnforcement,
  resolveSiftLightConfigPath,
  SIFT_LIGHT_CONFIG_ENV,
  type ReadSiftLightConfigOptions,
  type SiftLightConfig,
  type SiftLightLocale,
  type SearchEnforcementMode,
  type SemanticJudgeConfig,
  type SemanticJudgeProvider,
} from "./config-reader.js";

export function siftLightConfigPath(
  agentDir = getAgentDir(),
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return resolveSiftLightConfigPath(agentDir, environment);
}

export async function readSiftLightConfig(
  agentDir = getAgentDir(),
  environment: NodeJS.ProcessEnv = process.env,
): Promise<SiftLightConfig> {
  return readSiftLightConfigFile(siftLightConfigPath(agentDir, environment), {
    missing: environment[SIFT_LIGHT_CONFIG_ENV]?.trim() ? "error" : "defaults",
  });
}
