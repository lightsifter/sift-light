#!/usr/bin/env node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_PATH = join(dirname(fileURLToPath(import.meta.url)), "mcp-server.mjs");
const TIMEOUT_MS = 10_000;

async function withTimeout(operation, message) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = await mkdtemp(join(tmpdir(), "sift-light-package-smoke-"));
const client = new Client({ name: "sift-light-package-smoke", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [SERVER_PATH, "--stdio"],
  cwd: root,
  env: { ...process.env, SIFT_LIGHT_MCP_OUTPUT_MODE: "structured" },
  stderr: "pipe",
});
let diagnostics = "";
transport.stderr?.on("data", (chunk) => {
  diagnostics += String(chunk);
});

try {
  await writeFile(
    join(root, "package-smoke-fixture.ts"),
    "export const packageSmokeNeedle = true;\n",
    "utf8",
  );
  await withTimeout(client.connect(transport), "published MCP server did not initialize in time");
  const tools = await withTimeout(
    client.listTools(),
    "published MCP server did not list tools in time",
  );
  assert(
    tools.tools.length === 1 && tools.tools[0]?.name === "sift-light",
    "published package exposed an unexpected MCP tool set",
  );
  const result = await withTimeout(
    client.callTool(
      { name: "sift-light", arguments: { pattern: "packageSmokeNeedle", literal: true } },
      CallToolResultSchema,
    ),
    "published MCP search did not complete in time",
  );
  const first = Array.isArray(result.content) ? result.content[0] : undefined;
  assert(!result.isError, `published MCP search failed: ${diagnostics.trim()}`);
  assert(
    first?.type === "text" && first.text.includes("package-smoke-fixture.ts"),
    "published MCP search lost fixture evidence",
  );
} finally {
  await withTimeout(client.close(), "published MCP client did not close in time").catch(
    () => undefined,
  );
  await rm(root, { recursive: true, force: true });
}

process.stdout.write("sift-light published package smoke passed\n");
