import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  readSignalGrepConfigFile,
  resolveSignalGrepConfigPath,
  SIGNAL_GREP_CONFIG_ENV,
  type SignalGrepConfig,
} from "./config-reader.js";

export {
  DEFAULT_SIGNAL_GREP_CONFIG,
  DEFAULT_SEMANTIC_JUDGE_CONFIG,
  normalizeSearchEnforcement,
  resolveSignalGrepConfigPath,
  SIGNAL_GREP_CONFIG_ENV,
  type ReadSignalGrepConfigOptions,
  type SignalGrepConfig,
  type SignalGrepLocale,
  type SearchEnforcementMode,
  type SemanticJudgeConfig,
  type SemanticJudgeProvider,
} from "./config-reader.js";

export function signalGrepConfigPath(
  agentDir = getAgentDir(),
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return resolveSignalGrepConfigPath(agentDir, environment);
}

export async function readSignalGrepConfig(
  agentDir = getAgentDir(),
  environment: NodeJS.ProcessEnv = process.env,
): Promise<SignalGrepConfig> {
  return readSignalGrepConfigFile(signalGrepConfigPath(agentDir, environment), {
    missing: environment[SIGNAL_GREP_CONFIG_ENV]?.trim() ? "error" : "defaults",
  });
}
