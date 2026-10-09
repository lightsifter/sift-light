import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, isAbsolute, resolve } from "node:path";
import { SiftLightError } from "./errors.js";

const OVERRIDE_ENV = "SIFT_LIGHT_RG_PATH";
const PATH_RIPGREP_NAME = process.platform === "win32" ? "rg.exe" : "rg";
const BUNDLED_REPAIR = `Reinstall sift-light with optional dependencies enabled for this platform, set ${OVERRIDE_ENV} to an absolute ripgrep executable path, or ensure ${PATH_RIPGREP_NAME} is available on PATH.`;

async function findExecutableOnPath(): Promise<string | undefined> {
  const pathValue = process.env.PATH;
  if (!pathValue) return undefined;
  const candidates = pathValue
    .split(delimiter)
    .map((directory) => resolve(directory || ".", PATH_RIPGREP_NAME));
  const available = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        if (!(await stat(candidate)).isFile()) return undefined;
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Continue scanning PATH entries; the final error remains explicit if none work.
        return undefined;
      }
    }),
  );
  return available.find((candidate): candidate is string => candidate !== undefined);
}

/** One executable choice for content, filename and historical-source searches. */
export async function resolveRipgrepExecutable(): Promise<string> {
  const configured = process.env[OVERRIDE_ENV];
  if (configured !== undefined && !isAbsolute(configured))
    throw new SiftLightError(
      `${OVERRIDE_ENV} must be an absolute executable file path; shell functions, aliases and relative paths are not supported.`,
    );

  let executable: string;
  if (configured !== undefined) {
    executable = configured;
  } else {
    try {
      // Resolve lazily so a broken installation remains a visible tool error and an
      // explicit executable can be used without loading the platform package.
      executable = (await import("@vscode/ripgrep")).rgPath;
    } catch (cause) {
      const pathExecutable = await findExecutableOnPath();
      if (pathExecutable === undefined)
        throw new SiftLightError(`Bundled ripgrep is unavailable. ${BUNDLED_REPAIR}`, { cause });
      executable = pathExecutable;
    }
  }

  try {
    if (!(await stat(executable)).isFile()) throw new Error("Expected an executable file");
    await access(executable, constants.X_OK);
  } catch (cause) {
    const repair =
      configured === undefined
        ? BUNDLED_REPAIR
        : `Fix ${OVERRIDE_ENV} or unset it to use bundled ripgrep. No fallback was attempted.`;
    throw new SiftLightError(`ripgrep executable is unavailable: ${executable}. ${repair}`, {
      cause,
    });
  }
  return executable;
}
