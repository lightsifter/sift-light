import { createHash } from "node:crypto";
import { access, constants, readdir, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, isAbsolute, resolve } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";

/** The default Python provider is the pinned Pyright runtime bundled by this package. */
export type PythonLanguageServerKind = "pylsp" | "pyright";

export interface PythonLanguageServerCommand {
  readonly kind: PythonLanguageServerKind;
  readonly executable: string;
  readonly args: readonly string[];
  readonly environment: NodeJS.ProcessEnv;
  readonly fingerprint: string;
}

const PYTHON_PROJECT_MARKERS = new Set([
  "pyproject.toml",
  "pyrightconfig.json",
  "setup.cfg",
  "setup.py",
]);
const PYTHON_ENVIRONMENT_KEYS = [
  "PATH",
  "PYTHONPATH",
  "PYTHONHOME",
  "VIRTUAL_ENV",
  "CONDA_PREFIX",
] as const;

const require = createRequire(import.meta.url);

function configuredExecutable(): { kind: PythonLanguageServerKind; path: string } | undefined {
  const pyright = process.env.BAOER_SIGNAL_GREP_PYRIGHT_PATH?.trim();
  if (!pyright) return undefined;
  const path = pyright;
  if (!path || !isAbsolute(path))
    throw new SignalGrepError("BAOER_SIGNAL_GREP_PYRIGHT_PATH must be an absolute executable path");
  return { kind: "pyright", path };
}

function commandArgs(kind: PythonLanguageServerKind): readonly string[] {
  return kind === "pyright" ? ["--stdio"] : [];
}

function environment(executable: string): NodeJS.ProcessEnv {
  const currentPath = process.env.PATH ?? "";
  const directory = isAbsolute(executable) ? dirname(executable) : undefined;
  return {
    ...process.env,
    ...(directory ? { PATH: `${directory}${delimiter}${currentPath}` } : {}),
  };
}

/**
 * Resolve the process command without starting it. The server is deliberately
 * lazy: an inventory request must not probe or start Python tooling.
 */
export function pythonLanguageServerCommand(): PythonLanguageServerCommand {
  const configured = configuredExecutable();
  const kind = configured?.kind ?? "pyright";
  const script = configured ? undefined : require.resolve("pyright/langserver.index.js");
  const executable = configured?.path ?? process.execPath;
  const args = configured ? commandArgs(kind) : [script!, "--stdio"];
  const env = environment(executable);
  const values: Record<string, string> = { kind, executable, args: args.join("\0") };
  if (script) {
    values.script = script;
    values.scriptHash = createHash("sha256").update(readFileSync(script)).digest("hex");
  }
  for (const key of PYTHON_ENVIRONMENT_KEYS) values[key] = env[key] ?? "";
  return {
    kind,
    executable,
    args,
    environment: env,
    fingerprint: createHash("sha256").update(JSON.stringify(values)).digest("hex"),
  };
}

export async function assertConfiguredPythonLanguageServer(): Promise<void> {
  const configured = configuredExecutable();
  if (!configured) return;
  try {
    await access(configured.path, constants.X_OK);
  } catch (error) {
    throw new SignalGrepError(
      `Configured Python language-server executable is unavailable: ${configured.path}`,
      { cause: error },
    );
  }
}

export async function resolvePythonProjectRoot(
  cwd: string,
  targetPath: string,
  signal?: AbortSignal,
): Promise<string> {
  const absoluteCwd = resolve(cwd);
  const absoluteTarget = resolve(absoluteCwd, targetPath);
  let current = dirname(absoluteTarget);
  try {
    // A scope may name a directory; keep the project walk anchored there.
    if ((await stat(absoluteTarget)).isDirectory()) current = absoluteTarget;
  } catch (error) {
    if (
      !(
        error instanceof Error &&
        "code" in error &&
        (error.code === "ENOENT" || error.code === "ENOTDIR")
      )
    )
      throw error;
  }
  while (current === absoluteCwd || current.startsWith(`${absoluteCwd}/`)) {
    if (signal?.aborted) throw abortError();
    try {
      // oxlint-disable-next-line no-await-in-loop -- ancestor order defines the project boundary.
      const entries = await readdir(current, { withFileTypes: true });
      if (entries.some((entry) => PYTHON_PROJECT_MARKERS.has(entry.name))) return current;
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          "code" in error &&
          (error.code === "ENOENT" || error.code === "ENOTDIR")
        )
      )
        throw error;
    }
    if (current === absoluteCwd) break;
    const parent = dirname(current);
    if (parent === current || !parent.startsWith(`${absoluteCwd}/`)) break;
    current = parent;
  }
  return dirname(resolve(absoluteCwd, targetPath));
}

export function isPythonProjectMarker(path: string): boolean {
  const name = path.replaceAll("\\", "/").split("/").at(-1) ?? "";
  return PYTHON_PROJECT_MARKERS.has(name);
}

export function pythonEnvironmentKeys(): readonly string[] {
  return PYTHON_ENVIRONMENT_KEYS;
}
