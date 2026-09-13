/**
 * Children executing JavaScript must run the runtime, not a compiled host's
 * bundled entrypoint. Bun's documented CLI mode preserves the host runtime
 * without requiring a second executable on PATH. Never mutate the host env.
 */
export function scriptRuntimeEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  if (process.versions.bun) env.BUN_BE_BUN = "1";
  return env;
}
