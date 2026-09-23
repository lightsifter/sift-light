#!/usr/bin/env node
import {
  DEFAULT_MCP_HOST,
  DEFAULT_MCP_MAX_SESSIONS,
  DEFAULT_MCP_PORT,
  DEFAULT_MCP_SESSION_IDLE_TIMEOUT_MS,
  SIFT_LIGHT_MCP_PATH,
  createDefaultSiftLightMcpService,
  startSiftLightMcpServer,
} from "./mcp.js";
import { createMcpSearchFeatures, mcpSemanticJudgeConfigSource } from "./mcp-semantic-judge.js";
import type { SemanticJudgeIntegration } from "./semantic-judge.js";
import { parseSiftLightMcpTransport, SIFT_LIGHT_MCP_USAGE } from "./mcp-cli.js";
import { parseSiftLightMcpOutputMode, type SiftLightMcpOutputMode } from "./mcp-output.js";
import { startSiftLightMcpStdioServer } from "./mcp-stdio.js";

function environmentInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < minimum || port > maximum) {
    throw new Error(
      `${name} must be an integer from ${String(minimum)} through ${String(maximum)}`,
    );
  }
  return port;
}

function allowedOrigins(): string[] {
  return (process.env.SIFT_LIGHT_MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function logSemanticJudgeStatus(integration: SemanticJudgeIntegration): void {
  const status = integration.config.enabled ? "enabled" : "disabled";
  process.stderr.write(
    `sift-light MCP semantic judge: ${status}; source=${mcpSemanticJudgeConfigSource()}\n`,
  );
}

async function runHttpServer(
  outputMode: SiftLightMcpOutputMode,
  semanticJudge: SemanticJudgeIntegration | undefined,
  vectorSearchEnabled: boolean,
): Promise<void> {
  const running = await startSiftLightMcpServer({
    cwd: process.env.SIFT_LIGHT_MCP_CWD ?? process.cwd(),
    host: process.env.SIFT_LIGHT_MCP_HOST ?? DEFAULT_MCP_HOST,
    port: environmentInteger("SIFT_LIGHT_MCP_PORT", DEFAULT_MCP_PORT, 0, 65_535),
    createService: () => createDefaultSiftLightMcpService(semanticJudge, vectorSearchEnabled),
    maxSessions: environmentInteger(
      "SIFT_LIGHT_MCP_MAX_SESSIONS",
      DEFAULT_MCP_MAX_SESSIONS,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    sessionIdleTimeoutMs: environmentInteger(
      "SIFT_LIGHT_MCP_SESSION_IDLE_MS",
      DEFAULT_MCP_SESSION_IDLE_TIMEOUT_MS,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    allowedOrigins: allowedOrigins(),
    outputMode,
  });

  const address = running.httpServer.address();
  if (!address || !(address instanceof Object)) {
    throw new Error("MCP TCP listener is unavailable");
  }
  const displayHost = address.family === "IPv6" ? `[${address.address}]` : address.address;
  process.stderr.write(
    `sift-light MCP listening on http://${displayHost}:${String(address.port)}${SIFT_LIGHT_MCP_PATH}\n`,
  );
  process.stderr.write(`sift-light MCP working directory: ${running.cwd}\n`);

  let shuttingDown = false;
  const closeAfterSignal = async (): Promise<void> => {
    try {
      await running.close();
    } catch (error) {
      process.stderr.write(`sift-light MCP shutdown failed: ${String(error)}\n`);
      process.exitCode = 1;
    }
  };
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    void closeAfterSignal();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function runStdioServer(
  outputMode: SiftLightMcpOutputMode,
  semanticJudge: SemanticJudgeIntegration | undefined,
  vectorSearchEnabled: boolean,
): Promise<void> {
  const running = await startSiftLightMcpStdioServer({
    cwd: process.env.SIFT_LIGHT_MCP_CWD ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    outputMode,
    createService: () => createDefaultSiftLightMcpService(semanticJudge, vectorSearchEnabled),
  });
  process.stderr.write("sift-light MCP serving one local client over stdio\n");
  process.stderr.write(`sift-light MCP working directory: ${running.cwd}\n`);

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    void running.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    await running.closed;
  } finally {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  }
}

async function main(): Promise<void> {
  const transport = parseSiftLightMcpTransport(process.argv.slice(2));
  if (transport === "help") {
    process.stdout.write(SIFT_LIGHT_MCP_USAGE);
    return;
  }
  const outputMode = parseSiftLightMcpOutputMode(process.env.SIFT_LIGHT_MCP_OUTPUT_MODE);
  const { semanticJudge, vectorSearchEnabled } = await createMcpSearchFeatures();
  logSemanticJudgeStatus(semanticJudge);
  process.stderr.write(
    `sift-light MCP vector search: ${vectorSearchEnabled ? "enabled" : "disabled"}\n`,
  );
  if (transport === "stdio") {
    await runStdioServer(outputMode, semanticJudge, vectorSearchEnabled);
    return;
  }
  await runHttpServer(outputMode, semanticJudge, vectorSearchEnabled);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`sift-light MCP failed: ${String(error)}\n`);
  process.exitCode = 1;
}
