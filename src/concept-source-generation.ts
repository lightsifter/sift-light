import { SiftLightError } from "./errors.js";
import { createHash } from "node:crypto";
import { MAX_STRUCTURE_FILES } from "./analysis-limits.js";
import { SourceAccess, SourceBudgetError } from "./source-access.js";
import {
  SourceDocumentError,
  type SourceDocument,
  type SourceReference,
} from "./source-document.js";
import { listWorkspaceFiles, type WorkspaceFileList } from "./workspace-files.js";

export interface ConceptSourceFilters {
  path?: string;
  glob: string[];
  exclude: string[];
  hidden: boolean;
}

export interface ConceptSourceInventoryEntry {
  path: string;
  status: "admitted" | "empty" | "binary" | "unavailable";
  reference?: SourceReference;
  contentHash?: string;
  reason?: string;
}

export interface ConceptSourceSummary {
  inventoryHash: string;
  verification: "verified-during-interval" | "unverified";
  startedAt: number;
  verifiedAt?: number;
  filesEnumerated: number;
  filesAdmitted: number;
  filesSkippedEmpty: number;
  filesSkippedBinary: number;
  filesUnavailable: number;
  batches: number;
  batchFileLimit: number;
  fileLimit: number;
}

export interface ConceptSourceGeneration {
  readonly cwd: string;
  readonly filters: ConceptSourceFilters;
  readonly files: WorkspaceFileList;
  readonly inventory: readonly ConceptSourceInventoryEntry[];
  readonly documents: readonly SourceDocument[];
  readonly partial: boolean;
  readonly reasons: readonly string[];
  readonly filesSkippedEmpty: number;
  readonly filesSkippedBinary: number;
  readonly filesUnavailable: number;
  readonly filesAdmitted: number;
  readonly batches: number;
  readonly batchFileLimit: number;
  readonly fileLimit: number;
  readonly startedAt: number;
  readonly inventoryHash: string;
  verifiedAt?: number;
}

export class ConceptSourceChangedError extends SiftLightError {
  constructor(message = "Concept source changed while evidence was being computed") {
    super(message);
    this.name = "ConceptSourceChangedError";
  }
}

function isSourceMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function options(filters: ConceptSourceFilters): {
  path?: string;
  glob: string[];
  exclude: string[];
  hidden: boolean;
} {
  return {
    ...(filters.path ? { path: filters.path } : {}),
    glob: filters.glob,
    exclude: filters.exclude,
    hidden: filters.hidden,
  };
}

export async function createConceptSourceGeneration(
  access: SourceAccess,
  filters: ConceptSourceFilters,
  providedFiles?: WorkspaceFileList,
): Promise<ConceptSourceGeneration> {
  const files =
    providedFiles ?? (await listWorkspaceFiles(access.cwd, access.signal, options(filters)));
  const startedAt = Date.now();
  const inventory: ConceptSourceInventoryEntry[] = [];
  const documents: SourceDocument[] = [];
  const reasons = [...files.reasons];
  let filesSkippedEmpty = 0;
  let filesSkippedBinary = 0;
  let filesUnavailable = 0;
  let budgetError: SourceBudgetError | undefined;
  for (const path of files.paths) {
    if (budgetError) {
      inventory.push({ path, status: "unavailable", reason: budgetError.message });
      filesUnavailable += 1;
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- SourceAccess serializes a bounded source budget.
      const document = await access.load(path);
      if (document.bytes.includes(0)) {
        inventory.push({
          path,
          status: "binary",
          reference: document.reference,
          ...(document.reference.origin.kind === "worktree"
            ? { contentHash: document.reference.origin.contentHash }
            : {}),
          reason: "Binary source contains NUL bytes",
        });
        filesSkippedBinary += 1;
        continue;
      }
      if (!document.utf8) throw new SourceDocumentError("encoding", "Not lossless UTF-8");
      if (!document.text.trim()) {
        inventory.push({
          path,
          status: "empty",
          reference: document.reference,
          ...(document.reference.origin.kind === "worktree"
            ? { contentHash: document.reference.origin.contentHash }
            : {}),
        });
        filesSkippedEmpty += 1;
        continue;
      }
      inventory.push({
        path,
        status: "admitted",
        reference: document.reference,
        ...(document.reference.origin.kind === "worktree"
          ? { contentHash: document.reference.origin.contentHash }
          : {}),
      });
      documents.push(document);
    } catch (error) {
      if (isSourceMissing(error))
        throw new ConceptSourceChangedError(`${path}: source disappeared while reading`);
      if (error instanceof SourceBudgetError) {
        budgetError = error;
        reasons.push(error.message);
        inventory.push({ path, status: "unavailable", reason: error.message });
        filesUnavailable += 1;
        continue;
      }
      if (!(error instanceof SourceDocumentError)) throw error;
      if (error.reason === "source-changed")
        throw new ConceptSourceChangedError(`${path}: ${error.message}`);
      inventory.push({ path, status: "unavailable", reason: error.message });
      filesUnavailable += 1;
      reasons.push(`${path}: ${error.message}`);
    }
  }
  const inventoryHash = createHash("sha256")
    .update(JSON.stringify(inventory))
    .digest("hex")
    .slice(0, 32);
  return {
    cwd: access.cwd,
    filters: {
      ...(filters.path ? { path: filters.path } : {}),
      glob: [...filters.glob],
      exclude: [...filters.exclude],
      hidden: filters.hidden,
    },
    files,
    inventory,
    documents,
    partial: files.partial || filesUnavailable > 0,
    reasons,
    filesSkippedEmpty,
    filesSkippedBinary,
    filesUnavailable,
    filesAdmitted: documents.length,
    batches: 1,
    batchFileLimit: access.maxFiles,
    fileLimit: access.maxFiles,
    startedAt,
    inventoryHash,
  };
}

export function conceptSourceSummary(generation: ConceptSourceGeneration): ConceptSourceSummary {
  return {
    inventoryHash: generation.inventoryHash,
    verification: generation.verifiedAt === undefined ? "unverified" : "verified-during-interval",
    startedAt: generation.startedAt,
    ...(generation.verifiedAt === undefined ? {} : { verifiedAt: generation.verifiedAt }),
    filesEnumerated: generation.files.paths.length,
    filesAdmitted: generation.filesAdmitted,
    filesSkippedEmpty: generation.filesSkippedEmpty,
    filesSkippedBinary: generation.filesSkippedBinary,
    filesUnavailable: generation.filesUnavailable,
    batches: generation.batches,
    batchFileLimit: generation.batchFileLimit,
    fileLimit: generation.fileLimit,
  };
}

function samePathSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((path, index) => path === right[index]);
}

/** Re-enumerate and reread the exact admitted generation before publishing evidence. */
export async function verifyConceptSourceGeneration(
  generation: ConceptSourceGeneration,
  access: SourceAccess,
): Promise<void> {
  const current = await listWorkspaceFiles(access.cwd, access.signal, {
    ...options(generation.filters),
    maxFiles: generation.fileLimit,
  });
  if (
    current.coverageIssue !== undefined &&
    current.coverageIssue !== generation.files.coverageIssue
  ) {
    throw new SiftLightError(current.reasons.join("; "));
  }
  if (
    current.partial !== generation.files.partial ||
    !samePathSet(current.paths, generation.files.paths)
  ) {
    throw new ConceptSourceChangedError(
      "Concept source inventory changed while evidence was being computed",
    );
  }
  let verificationAccess = access.batch(Math.min(generation.batchFileLimit, MAX_STRUCTURE_FILES));
  let verifiedInBatch = 0;
  for (const entry of generation.inventory) {
    if (!entry.reference) continue;
    if (verifiedInBatch >= verificationAccess.maxFiles) {
      verificationAccess = access.batch(Math.min(generation.batchFileLimit, MAX_STRUCTURE_FILES));
      verifiedInBatch = 0;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- every admitted file must be version-checked.
      const document = await verificationAccess.refresh(entry.path, entry.reference);
      verifiedInBatch += 1;
      const hash =
        document.reference.origin.kind === "worktree"
          ? document.reference.origin.contentHash
          : undefined;
      if (entry.contentHash !== hash)
        throw new ConceptSourceChangedError(`${entry.path}: source content changed`);
    } catch (error) {
      if (error instanceof ConceptSourceChangedError) throw error;
      if (isSourceMissing(error))
        throw new ConceptSourceChangedError(
          `${entry.path}: source disappeared during verification`,
        );
      if (error instanceof SourceDocumentError)
        throw new ConceptSourceChangedError(`${entry.path}: ${error.message}`);
      throw error;
    }
  }
  generation.verifiedAt = Date.now();
}
