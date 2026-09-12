import { semanticUri } from "./semantic-sources.js";
import { OwnedTaskQueue } from "./owned-task-queue.js";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import {
  openOwnedJsonRpc,
  rpcRecord,
  type JsonRpcChannel,
  type OwnedJsonRpcSession,
} from "./owned-json-rpc.js";
import type { SourceDocument } from "./source-document.js";

const compilerQueue = new OwnedTaskQueue();

export const TYPESCRIPT_QUERY_TIMEOUT_MS = 20_000;

const preferences = {
  disableAutomaticTypeAcquisition: true,
  tsserver: { automaticTypeAcquisition: { enabled: false } },
  implicitProjectConfig: { checkJs: true, allowJs: true, typeAcquisition: { enabled: false } },
  preferences: { includePackageJsonAutoImports: "off" },
};

function serverRequest(method: string, params: unknown): unknown {
  if (method === "workspace/configuration") {
    if (!rpcRecord(params) || !Array.isArray(params.items))
      throw new SignalGrepError("Invalid language-service configuration request");
    return params.items.map(() => preferences);
  }
  if (
    method === "client/registerCapability" ||
    method === "client/unregisterCapability" ||
    method === "window/workDoneProgress/create"
  )
    return null;
  if (method === "workspace/applyEdit")
    return { applied: false, failureReason: "Search is read-only" };
  throw new SignalGrepError(`Unsupported language-service client request: ${method}`);
}

function executablePath(): string {
  const packageName = `@typescript/typescript-${process.platform}-${process.arch}`;
  try {
    const metadata = createRequire(import.meta.url).resolve(`${packageName}/package.json`);
    return join(dirname(metadata), "lib", process.platform === "win32" ? "tsc.exe" : "tsc");
  } catch (error) {
    throw new SignalGrepError(
      `TypeScript semantic provider is unavailable for ${process.platform}/${process.arch}; reinstall with optional dependencies enabled`,
      { cause: error },
    );
  }
}

export interface TypeScriptSession {
  readonly channel: JsonRpcChannel;
  readonly capabilities: Record<string, unknown>;
  readonly completion: OwnedJsonRpcSession["completion"];
  close(): Promise<void>;
}

function languageId(path: string): string {
  if (/\.tsx$/i.test(path)) return "typescriptreact";
  if (/\.jsx$/i.test(path)) return "javascriptreact";
  return /\.[cm]?ts$/i.test(path) ? "typescript" : "javascript";
}

async function initializeTypeScriptSession(
  cwd: string,
  sourceCwd: string,
  documents: readonly SourceDocument[],
  channel: JsonRpcChannel,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  if (signal.aborted) throw abortError();
  const initialized = await channel.request("initialize", {
    processId: process.pid,
    rootUri: await semanticUri(cwd, "."),
    capabilities: {
      workspace: {
        configuration: true,
        didChangeWatchedFiles: { dynamicRegistration: true },
      },
      textDocument: {
        definition: { linkSupport: true },
        implementation: { linkSupport: true },
        callHierarchy: {},
      },
      general: { positionEncodings: ["utf-16"] },
    },
    initializationOptions: { runExternalCode: false, disablePushDiagnostics: true },
  });
  if (!rpcRecord(initialized) || !rpcRecord(initialized.capabilities))
    throw new SignalGrepError("Language service omitted its capabilities");
  await channel.notify("initialized", {});
  await channel.notify("workspace/didChangeConfiguration", {
    settings: { "js/ts": preferences, typescript: preferences, javascript: preferences },
  });
  for (const document of documents) {
    if (signal.aborted) throw abortError();
    // oxlint-disable-next-line no-await-in-loop -- canonical URIs prevent duplicate compiler identities for workspace symlinks.
    const uri = await semanticUri(sourceCwd, document.path);
    // oxlint-disable-next-line no-await-in-loop -- ordered didOpen notifications install the verified source snapshot.
    await channel.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: languageId(document.path),
        version: 1,
        text: document.text,
      },
    });
  }
  return initialized.capabilities;
}

export async function withTypeScript<T>(
  cwd: string,
  documents: readonly SourceDocument[],
  operation: (channel: JsonRpcChannel, capabilities: Record<string, unknown>) => Promise<T>,
  parent?: AbortSignal,
  sourceCwd = cwd,
): Promise<T> {
  const session = await openTypeScriptSession(cwd, documents, parent, sourceCwd);
  try {
    return await operation(session.channel, session.capabilities);
  } finally {
    await session.close();
  }
}

/**
 * Open one initialized TypeScript language service for a relationship analysis
 * view. The caller can issue many navigation requests without rebuilding the
 * project or reopening every source on each hop.
 */
export async function openTypeScriptSession(
  cwd: string,
  documents: readonly SourceDocument[],
  parent?: AbortSignal,
  sourceCwd = cwd,
): Promise<TypeScriptSession> {
  const release = await compilerQueue.acquire(parent);
  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    release();
  };
  const deadline = new AbortController();
  const signal = parent ? AbortSignal.any([parent, deadline.signal]) : deadline.signal;
  let deadlineTriggered = false;
  const timer = setTimeout(() => {
    deadlineTriggered = true;
    deadline.abort();
  }, TYPESCRIPT_QUERY_TIMEOUT_MS);
  let handedOff = false;
  try {
    const executable = executablePath();
    const session = await openOwnedJsonRpc(
      {
        executable,
        args: ["--lsp", "--stdio"],
        cwd,
        signal,
        env: { ...process.env, PATH: dirname(executable), GOMEMLIMIT: "256MiB" },
      },
      serverRequest,
    );
    let capabilities: Record<string, unknown>;
    try {
      capabilities = await initializeTypeScriptSession(
        cwd,
        sourceCwd,
        documents,
        session.channel,
        signal,
      );
    } catch (error) {
      deadline.abort();
      clearTimeout(timer);
      session.channel.close();
      await session.completion.catch(() => undefined);
      releaseOnce();
      throw error;
    }
    let closePromise: Promise<void> | undefined;
    void session.completion
      .finally(() => {
        clearTimeout(timer);
        releaseOnce();
      })
      .catch(() => undefined);
    handedOff = true;
    return {
      channel: session.channel,
      capabilities,
      completion: session.completion,
      close() {
        if (!closePromise) closePromise = closeSession();
        return closePromise;
      },
    };

    async function closeSession(): Promise<void> {
      let shutdownAcknowledged = false;
      try {
        await session.channel.request("shutdown", undefined);
        shutdownAcknowledged = true;
        session.channel.endInput();
        const result = await session.completion;
        // TypeScript 7.0.2 exits with code 1 after an acknowledged shutdown.
        if (result.code !== 0 && !(shutdownAcknowledged && result.code === 1))
          throw new SignalGrepError(
            `TypeScript language service failed (${String(result.code)}): ${result.stderr}`,
          );
      } catch (error) {
        deadline.abort();
        session.channel.close();
        await session.completion.catch(() => undefined);
        throw error;
      } finally {
        clearTimeout(timer);
        releaseOnce();
      }
    }
  } catch (error) {
    if (!handedOff) clearTimeout(timer);
    releaseOnce();
    if (parent?.aborted) throw abortError();
    if (deadlineTriggered)
      throw new SignalGrepError(
        `TypeScript semantic view exceeded the ${String(TYPESCRIPT_QUERY_TIMEOUT_MS)} ms deadline`,
      );
    throw error;
  }
}
