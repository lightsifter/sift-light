#!/usr/bin/env node
import {
  DEFAULT_MCP_HOST,
  DEFAULT_MCP_MAX_SESSIONS,
  DEFAULT_MCP_PORT,
  DEFAULT_MCP_SESSION_IDLE_TIMEOUT_MS,
  BAOER_SIGNAL_GREP_MCP_PATH,
  createDefaultSignalGrepMcpService,
  startSignalGrepMcpServer,
} from "./mcp.js";
import { DEFAULT_SEMANTIC_JUDGE_CONFIG, readSignalGrepConfigFile } from "./config-reader.js";
import { createSemanticJudgeIntegration, type SemanticJudgeIntegration } from "./semantic-judge.js";
import { parseSignalGrepMcpTransport, BAOER_SIGNAL_GREP_MCP_USAGE } from "./mcp-cli.js";
import { parseSignalGrepMcpOutputMode, type SignalGrepMcpOutputMode } from "./mcp-output.js";
import { startSignalGrepMcpStdioServer } from "./mcp-stdio.js";

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
  return (process.env.BAOER_SIGNAL_GREP_MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function configuredSemanticJudge(): Promise<SemanticJudgeIntegration | undefined> {
  const configPath = process.env.BAOER_SIGNAL_GREP_CONFIG;
  if (!configPath) return undefined;
  const config = await readSignalGrepConfigFile(configPath);
  return createSemanticJudgeIntegration(config.semanticJudge ?? DEFAULT_SEMANTIC_JUDGE_CONFIG);
}

async function runHttpServer(
  outputMode: SignalGrepMcpOutputMode,
  semanticJudge: SemanticJudgeIntegration | undefined,
): Promise<void> {
  const running = await startSignalGrepMcpServer({
    cwd: process.env.BAOER_SIGNAL_GREP_MCP_CWD ?? process.cwd(),
    host: process.env.BAOER_SIGNAL_GREP_MCP_HOST ?? DEFAULT_MCP_HOST,
    port: environmentInteger("BAOER_SIGNAL_GREP_MCP_PORT", DEFAULT_MCP_PORT, 0, 65_535),
    createService: () => createDefaultSignalGrepMcpService(semanticJudge),
    maxSessions: environmentInteger(
      "BAOER_SIGNAL_GREP_MCP_MAX_SESSIONS",
      DEFAULT_MCP_MAX_SESSIONS,
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    sessionIdleTimeoutMs: environmentInteger(
      "BAOER_SIGNAL_GREP_MCP_SESSION_IDLE_MS",
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
    `baoer_signal_grep MCP listening on http://${displayHost}:${String(address.port)}${BAOER_SIGNAL_GREP_MCP_PATH}\n`,
  );
  process.stderr.write(`baoer_signal_grep MCP working directory: ${running.cwd}\n`);

  let shuttingDown = false;
  const closeAfterSignal = async (): Promise<void> => {
    try {
      await running.close();
    } catch (error) {
      process.stderr.write(`baoer_signal_grep MCP shutdown failed: ${String(error)}\n`);
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
  outputMode: SignalGrepMcpOutputMode,
  semanticJudge: SemanticJudgeIntegration | undefined,
): Promise<void> {
  const running = await startSignalGrepMcpStdioServer({
    cwd: process.env.BAOER_SIGNAL_GREP_MCP_CWD ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    outputMode,
    createService: () => createDefaultSignalGrepMcpService(semanticJudge),
  });
  process.stderr.write("baoer_signal_grep MCP serving one local client over stdio\n");
  process.stderr.write(`baoer_signal_grep MCP working directory: ${running.cwd}\n`);

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
  const transport = parseSignalGrepMcpTransport(process.argv.slice(2));
  if (transport === "help") {
    process.stdout.write(BAOER_SIGNAL_GREP_MCP_USAGE);
    return;
  }
  const outputMode = parseSignalGrepMcpOutputMode(process.env.BAOER_SIGNAL_GREP_MCP_OUTPUT_MODE);
  const semanticJudge = await configuredSemanticJudge();
  if (transport === "stdio") {
    await runStdioServer(outputMode, semanticJudge);
    return;
  }
  await runHttpServer(outputMode, semanticJudge);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`baoer_signal_grep MCP failed: ${String(error)}\n`);
  process.exitCode = 1;
}
