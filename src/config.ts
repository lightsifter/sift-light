import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  readSiftlightConfigFile,
  resolveSiftlightConfigPath,
  SIFTLIGHT_CONFIG_ENV,
  type SiftlightConfig,
} from "./config-reader.js";

export {
  DEFAULT_SIFTLIGHT_CONFIG,
  DEFAULT_SEMANTIC_JUDGE_CONFIG,
  normalizeSearchEnforcement,
  resolveSiftlightConfigPath,
  SIFTLIGHT_CONFIG_ENV,
  type ReadSiftlightConfigOptions,
  type SiftlightConfig,
  type SiftlightLocale,
  type SearchEnforcementMode,
  type SemanticJudgeConfig,
  type SemanticJudgeProvider,
} from "./config-reader.js";

export function siftlightConfigPath(
  agentDir = getAgentDir(),
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return resolveSiftlightConfigPath(agentDir, environment);
}

export async function readSiftlightConfig(
  agentDir = getAgentDir(),
  environment: NodeJS.ProcessEnv = process.env,
): Promise<SiftlightConfig> {
  return readSiftlightConfigFile(siftlightConfigPath(agentDir, environment), {
    missing: environment[SIFTLIGHT_CONFIG_ENV]?.trim() ? "error" : "defaults",
  });
}
