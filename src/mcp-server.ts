#!/usr/bin/env node
import {
  DEFAULT_MCP_HOST,
  DEFAULT_MCP_MAX_SESSIONS,
  DEFAULT_MCP_PORT,
  DEFAULT_MCP_SESSION_IDLE_TIMEOUT_MS,
  SIFTLIGHT_MCP_PATH,
  createDefaultSiftlightMcpService,
  startSiftlightMcpServer,
} from "./mcp.js";
import {
  createMcpSemanticJudgeIntegration,
  mcpSemanticJudgeConfigSource,
} from "./mcp-semantic-judge.js";
import type { SemanticJudgeIntegration } from "./semantic-judge.js";
import { parseSiftlightMcpTransport, SIFTLIGHT_MCP_USAGE } from "./mcp-cli.js";
import { parseSiftlightMcpOutputMode, type SiftlightMcpOutputMode } from "./mcp-output.js";
import { startSiftlightMcpStdioServer } from "./mcp-stdio.js";

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
  return (process.env.SIFTLIGHT_MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function configuredSemanticJudge(): Promise<SemanticJudgeIntegration> {
  return createMcpSemanticJudgeIntegration();
}

function logSemanticJudgeStatus(integration: SemanticJudgeIntegration): void {
  const status = integration.config.enabled ? "enabled" : "disabled";
  process.stderr.write(
    `siftlight MCP semantic judge: ${status}; source=${mcpSemanticJudgeConfigSource()}\n`,
  );
}

async function runHttpServer(
  outputMode: SiftlightMcpOutputMode,
  semanticJudge: SemanticJudgeIntegration | undefined,
): Promise<void> {
  const running = await startSiftlightMcpServer({
    cwd: process.env.SIFTLIGHT_MCP_CWD ?? process.cwd(),
    host: process.env.SIFTLIGHT_MCP_HOST ?? DEFAULT_MCP_HOST,
    port: environmentInteger("SIFTLIGHT_MCP_PORT", DEFAULT_MCP_PORT, 0, 65_535),
    createService: () => createDefaultSiftlightMcpService(semanticJudge),
    maxSessions: environmentInteger(
      "SIFTLIGHT_MCP_MAX_SESSIONS",
      DEFAULT_MCP_MAX_SESSIONS,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    sessionIdleTimeoutMs: environmentInteger(
      "SIFTLIGHT_MCP_SESSION_IDLE_MS",
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
    `siftlight MCP listening on http://${displayHost}:${String(address.port)}${SIFTLIGHT_MCP_PATH}\n`,
  );
  process.stderr.write(`siftlight MCP working directory: ${running.cwd}\n`);

  let shuttingDown = false;
  const closeAfterSignal = async (): Promise<void> => {
    try {
      await running.close();
    } catch (error) {
      process.stderr.write(`siftlight MCP shutdown failed: ${String(error)}\n`);
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
  outputMode: SiftlightMcpOutputMode,
  semanticJudge: SemanticJudgeIntegration | undefined,
): Promise<void> {
  const running = await startSiftlightMcpStdioServer({
    cwd: process.env.SIFTLIGHT_MCP_CWD ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    outputMode,
    createService: () => createDefaultSiftlightMcpService(semanticJudge),
  });
  process.stderr.write("siftlight MCP serving one local client over stdio\n");
  process.stderr.write(`siftlight MCP working directory: ${running.cwd}\n`);

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
  const transport = parseSiftlightMcpTransport(process.argv.slice(2));
  if (transport === "help") {
    process.stdout.write(SIFTLIGHT_MCP_USAGE);
    return;
  }
  const outputMode = parseSiftlightMcpOutputMode(process.env.SIFTLIGHT_MCP_OUTPUT_MODE);
  const semanticJudge = await configuredSemanticJudge();
  logSemanticJudgeStatus(semanticJudge);
  if (transport === "stdio") {
    await runStdioServer(outputMode, semanticJudge);
    return;
  }
  await runHttpServer(outputMode, semanticJudge);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`siftlight MCP failed: ${String(error)}\n`);
  process.exitCode = 1;
}
