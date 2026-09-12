import { resolve } from "node:path";
import { stat } from "node:fs/promises";
import type { AnalysisResultSet } from "./analysis-types.js";
import { SignalGrepError } from "./errors.js";
import { resolveSemanticProjectRoot } from "./project-root.js";
import { SourceAccess, SourceBudgetError } from "./source-access.js";
import { SourceDocumentError, type SourceDocument } from "./source-document.js";
import { listWorkspaceFiles, type WorkspaceFileOptions } from "./workspace-files.js";
import { syntaxLanguage } from "./syntax.js";
const semanticMetadataPath = /(?:^|\/)(?:[tj]sconfig[^/]*\.json|package\.json)$/;

function semanticWorkspacePaths(files: { paths: readonly string[] }): string[] {
  return files.paths
    .filter((path) => {
      const language = syntaxLanguage(path);
      return (language !== undefined && language !== "go") || semanticMetadataPath.test(path);
    })
    .toSorted((left, right) => left.localeCompare(right));
}
/** Only admitted, verified worktree source can become executable navigation evidence. */
export async function semanticProject(
  access: SourceAccess,
  targetPath: string,
  allowDirectoryTarget = false,
  filters: Pick<WorkspaceFileOptions, "glob" | "exclude" | "hidden"> = {},
) {
  let requestedTarget = targetPath;
  if (allowDirectoryTarget) {
    try {
      if ((await stat(resolve(access.cwd, targetPath))).isDirectory())
        requestedTarget = resolve(targetPath, "__relationship_target__.ts");
    } catch {
      // The existing target validation below reports an unavailable path.
    }
  }
  const root = await resolveSemanticProjectRoot(access.cwd, requestedTarget, access.signal);
  const workspaceFilters = {
    ...(filters.glob === undefined ? {} : { glob: [...filters.glob] }),
    ...(filters.exclude === undefined ? {} : { exclude: [...filters.exclude] }),
    ...(filters.hidden === undefined ? {} : { hidden: filters.hidden }),
  };
  const files = await listWorkspaceFiles(access.cwd, access.signal, {
    path: root,
    ...workspaceFilters,
  });
  const trackedPaths = semanticWorkspacePaths(files);
  const paths = files.paths.filter((path) => {
    const language = syntaxLanguage(path);
    return language && language !== "go";
  });
  const metadataPaths = files.paths.filter((path) => semanticMetadataPath.test(path));
  let target = resolve(access.cwd, targetPath);
  if (allowDirectoryTarget) {
    try {
      if ((await stat(target)).isDirectory()) {
        const first = paths.find((path) => resolve(access.cwd, path).startsWith(`${target}/`));
        if (first) target = resolve(access.cwd, first);
      }
    } catch {
      // The existing target validation below reports an unavailable directory.
    }
  }
  if (!paths.some((path) => resolve(access.cwd, path) === target))
    throw new SignalGrepError(
      "Semantic target must be an admitted JS/TS workspace file under current ignore rules",
    );
  paths.sort(
    (a, b) =>
      Number(resolve(access.cwd, b) === target) - Number(resolve(access.cwd, a) === target) ||
      a.localeCompare(b),
  );
  const documents = new Map<string, SourceDocument>();
  const reasons = [...files.reasons];
  const metadata: SourceDocument[] = [];
  for (const path of [...paths, ...metadataPaths]) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one shared source budget, deterministic target-first admission.
      const document = await access.load(path);
      if (!document.utf8)
        throw new SourceDocumentError("encoding", `Non-UTF-8 semantic source: ${path}`);
      if (paths.includes(path)) documents.set(resolve(access.cwd, path), document);
      else metadata.push(document);
    } catch (error) {
      if (error instanceof SourceBudgetError) {
        reasons.push(error.message);
        break;
      }
      if (!(error instanceof SourceDocumentError)) throw error;
      reasons.push(`${path}: ${error.message}`);
    }
  }
  const primary = documents.get(target);
  if (!primary)
    throw new SignalGrepError("Semantic target could not be read within the source budget");
  const recheckInventory = async () => {
    const after = await listWorkspaceFiles(access.cwd, access.signal, {
      path: root,
      ...workspaceFilters,
    });
    if (JSON.stringify(semanticWorkspacePaths(after)) !== JSON.stringify(trackedPaths))
      throw new SignalGrepError("Workspace file set changed during semantic query; retry");
  };
  const recheck = async () => {
    for (const document of [...documents.values(), ...metadata]) {
      if (document.reference.origin.kind !== "worktree")
        throw new Error("Expected worktree semantic source");
      // oxlint-disable-next-line no-await-in-loop -- reread each captured version without doubling retained source memory.
      await access.refresh(document.path, document.reference);
    }
    await recheckInventory();
  };
  const result: AnalysisResultSet = {
    kind: "references",
    unit: "relationships",
    items: [],
    partial: reasons.length > 0,
    reasons,
    filesRead: access.filesRead,
    bytesRead: access.bytesRead,
    coverage: {
      admittedSources: reasons.length ? "partial" : "complete",
      runtimeDispatch: "not-applicable",
    },
    stats: { filesEnumerated: paths.length, filesSkipped: paths.length - documents.size },
  };
  return { documents, metadata, primary, result, recheck, recheckInventory, root, trackedPaths };
}
