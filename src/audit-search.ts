import { resolve } from "node:path";
import { SiftlightError } from "./errors.js";
import { normalizeRequest } from "./request.js";
import type { RipgrepRunner } from "./rg.js";
import { getSourceRevision, sameSourceRevision } from "./source.js";
import {
  MAX_SOURCE_REVISION_CONCURRENCY,
  MAX_AUDIT_LITERAL_CHARACTERS,
  MAX_RESULT_BYTES,
  type AuditFindingDetails,
  type AuditPatternInput,
  type SearchScopeDetails,
  type SearchScan,
  type SourceRevision,
  type SiftlightResult,
} from "./types.js";
import type { SiftlightInput } from "./service.js";
import { listWorkspaceFiles } from "./workspace-files.js";

const MAX_AUDIT_PATTERNS = 32;
const MAX_AUDIT_CHANGED_FILES = 20;
const MAX_AUDIT_EVIDENCE = 3;
const MAX_AUDIT_IGNORED_FILES = 20;
const MAX_AUDIT_REASONS = 20;
const MAX_AUDIT_REASON_PATH_SAMPLES = 3;
const MAX_AUDIT_SAMPLE_BYTES = 2_048;

function validatePatterns(patterns: AuditPatternInput[] | undefined): AuditPatternInput[] {
  if (!patterns?.length || patterns.length > MAX_AUDIT_PATTERNS)
    throw new SiftlightError(
      `mode=audit requires 1–${String(MAX_AUDIT_PATTERNS)} literal patterns`,
    );
  const ids = new Set<string>();
  return patterns.map((pattern) => {
    if (
      !pattern ||
      typeof pattern !== "object" ||
      Array.isArray(pattern) ||
      Object.keys(pattern).some((key) => key !== "id" && key !== "literal")
    )
      throw new SiftlightError("Each audit pattern accepts only id and literal fields");
    if (
      !pattern ||
      typeof pattern.id !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(pattern.id)
    )
      throw new SiftlightError(
        "Each audit pattern id must use 1–64 letters, digits, underscores or hyphens",
      );
    if (ids.has(pattern.id)) throw new SiftlightError("Audit pattern ids must be unique");
    ids.add(pattern.id);
    if (
      typeof pattern.literal !== "string" ||
      !pattern.literal.length ||
      pattern.literal.length > MAX_AUDIT_LITERAL_CHARACTERS ||
      Buffer.byteLength(pattern.literal) > MAX_AUDIT_LITERAL_CHARACTERS ||
      !pattern.literal.isWellFormed() ||
      /[\r\n\0]/u.test(pattern.literal)
    )
      throw new SiftlightError(
        `Each audit literal must be nonempty, single-line text of at most ${String(MAX_AUDIT_LITERAL_CHARACTERS)} characters and UTF-8 bytes`,
      );
    return { id: pattern.id, literal: pattern.literal };
  });
}

async function revisionsFor(
  cwd: string,
  paths: readonly string[],
  signal?: AbortSignal,
): Promise<{ revisions: Map<string, SourceRevision>; unavailable: string[] }> {
  const revisions = new Map<string, SourceRevision>();
  const unavailable: string[] = [];
  for (let offset = 0; offset < paths.length; offset += MAX_SOURCE_REVISION_CONCURRENCY) {
    if (signal?.aborted) throw signal.reason;
    const batch = paths.slice(offset, offset + MAX_SOURCE_REVISION_CONCURRENCY);
    // oxlint-disable-next-line no-await-in-loop -- bounded batches cap metadata concurrency.
    await Promise.all(
      batch.map(async (path) => {
        const revision = await getSourceRevision(resolve(cwd, path), () => unavailable.push(path));
        if (revision) revisions.set(path, revision);
      }),
    );
  }
  return { revisions, unavailable };
}

function changedFiles(
  beforePaths: readonly string[],
  afterPaths: readonly string[],
  before: ReadonlyMap<string, SourceRevision>,
  after: ReadonlyMap<string, SourceRevision>,
): string[] {
  const all = new Set([...beforePaths, ...afterPaths]);
  return [...all]
    .filter((path) => {
      const left = before.get(path);
      const right = after.get(path);
      return left === undefined || right === undefined || !sameSourceRevision(left, right);
    })
    .toSorted();
}

function auditScope(input: SiftlightInput): SearchScopeDetails {
  const path = input.path?.replace(/^@/u, "") || ".";
  return {
    path,
    requestedPath: path,
    glob: input.glob === undefined ? [] : Array.isArray(input.glob) ? input.glob : [input.glob],
    exclude:
      input.exclude === undefined
        ? []
        : Array.isArray(input.exclude)
          ? input.exclude
          : [input.exclude],
    hidden: input.hidden ?? true,
    ignorePolicy: input.ignorePolicy ?? "respect",
    expandedToProjectRoot: false,
    assertion: path === "." ? "project-wide" : "requested-scope",
  };
}

function findingText(finding: AuditFindingDetails): string {
  const firstEvidence = finding.evidence[0];
  const evidence = firstEvidence
    ? `; evidence=${JSON.stringify(`${firstEvidence.path}:${String(firstEvidence.line)}`)}${finding.evidence.length > 1 ? `; ${String(finding.evidence.length - 1)} more evidence item(s) in structured receipt` : ""}`
    : "";
  return `- ${finding.id}: ${finding.status}; ${String(finding.matches)} match(es) across ${String(finding.files)} file(s)${evidence}; reproduce=${JSON.stringify(finding.reproduction)}`;
}

function boundedValues(
  values: readonly string[],
  maxItems: number,
  maxBytes: number,
): { values: string[]; omitted: number } {
  const retained: string[] = [];
  let bytes = 0;
  let omitted = 0;
  for (const value of values) {
    const size = Buffer.byteLength(JSON.stringify(value));
    if (retained.length >= maxItems || bytes + size > maxBytes) {
      omitted += 1;
      continue;
    }
    retained.push(value);
    bytes += size;
  }
  return { values: retained, omitted };
}

function boundedAuditText(required: readonly string[], optional: readonly string[]): string {
  const requiredText = required.join("\n");
  const omittedMarkerReserve = 128;
  if (Buffer.byteLength(requiredText) > MAX_RESULT_BYTES - omittedMarkerReserve)
    throw new SiftlightError(
      `Audit reproduction evidence exceeds the ${String(MAX_RESULT_BYTES)} byte result limit; narrow the scope or use fewer patterns`,
    );
  const retained = [...required];
  let bytes = Buffer.byteLength(requiredText);
  let omitted = 0;
  for (const line of optional) {
    const size = Buffer.byteLength(line) + 1;
    if (bytes + size > MAX_RESULT_BYTES - omittedMarkerReserve) {
      omitted += 1;
      continue;
    }
    retained.push(line);
    bytes += size;
  }
  if (omitted > 0)
    retained.push(`Optional receipt lines omitted by result budget: ${String(omitted)}.`);
  const text = retained.join("\n");
  if (Buffer.byteLength(text) > MAX_RESULT_BYTES)
    throw new SiftlightError("Audit result exceeded its byte budget");
  return text;
}

function unavailableReason(stage: "Initial" | "Final", paths: readonly string[]): string[] {
  if (paths.length === 0) return [];
  const omitted = Math.max(0, paths.length - MAX_AUDIT_REASON_PATH_SAMPLES);
  return [
    `${stage} metadata unavailable for ${String(paths.length)} file(s)`,
    ...paths
      .slice(0, MAX_AUDIT_REASON_PATH_SAMPLES)
      .map((path) => `${stage} metadata-unavailable sample: ${JSON.stringify(path)}`),
    ...(omitted ? [`${stage} metadata-unavailable samples omitted: ${String(omitted)}`] : []),
  ];
}

export async function runAuditSearch(
  input: SiftlightInput,
  cwd: string,
  runRipgrep: RipgrepRunner,
  signal?: AbortSignal,
): Promise<SiftlightResult> {
  const patterns = validatePatterns(input.patterns);
  const scope = auditScope(input);
  const ignorePolicy = scope.ignorePolicy ?? "respect";
  const fileOptions = {
    path: scope.path,
    glob: scope.glob,
    exclude: scope.exclude,
    hidden: scope.hidden,
    ...(ignorePolicy === "include" ? { ignore: false, ignoreParents: false } : {}),
  };
  const [startFiles, startAllFiles] = await Promise.all([
    listWorkspaceFiles(cwd, signal, fileOptions),
    ignorePolicy === "respect"
      ? listWorkspaceFiles(cwd, signal, { ...fileOptions, ignore: false, ignoreParents: false })
      : Promise.resolve(undefined),
  ]);
  const before = await revisionsFor(cwd, (startAllFiles ?? startFiles).paths, signal);
  const scans: SearchScan[] = [];
  for (const pattern of patterns) {
    const request = {
      ...normalizeRequest({
        pattern: pattern.literal,
        literal: true,
        path: scope.path,
        glob: scope.glob,
        exclude: scope.exclude,
        hidden: scope.hidden,
        ignorePolicy,
        scope: "strict",
      }),
      binaryAsText: true,
    };
    // oxlint-disable-next-line no-await-in-loop -- one declared pattern at a time keeps process use bounded.
    scans.push(await runRipgrep(request, cwd, signal));
  }
  const [endFiles, endAllFiles] = await Promise.all([
    listWorkspaceFiles(cwd, signal, fileOptions),
    ignorePolicy === "respect"
      ? listWorkspaceFiles(cwd, signal, { ...fileOptions, ignore: false, ignoreParents: false })
      : Promise.resolve(undefined),
  ]);
  const after = await revisionsFor(cwd, (endAllFiles ?? endFiles).paths, signal);
  const changed = changedFiles(
    (startAllFiles ?? startFiles).paths,
    (endAllFiles ?? endFiles).paths,
    before.revisions,
    after.revisions,
  );
  const startAdmitted = new Set(startFiles.paths);
  const startIgnoredPaths = startAllFiles?.paths.filter((path) => !startAdmitted.has(path)) ?? [];
  const filesDiscovered = (startAllFiles ?? startFiles).paths.length;
  const filesAdmitted = startFiles.paths.length;
  const searchedFiles = Math.min(...scans.map((scan) => scan.searchedFileCount ?? 0));
  const filesSkippedOther = Math.max(0, filesAdmitted - searchedFiles);
  const allReasons = new Set<string>([
    ...startFiles.reasons,
    ...endFiles.reasons,
    ...(startAllFiles?.reasons ?? []),
    ...(endAllFiles?.reasons ?? []),
    ...unavailableReason("Initial", before.unavailable),
    ...unavailableReason("Final", after.unavailable),
    ...scans.flatMap((scan) => scan.retention?.reasons ?? []),
  ]);
  if (startIgnoredPaths.length > 0)
    allReasons.add(`${String(startIgnoredPaths.length)} file(s) excluded by ignore rules`);
  if (filesSkippedOther > 0)
    allReasons.add(`${String(filesSkippedOther)} admitted file(s) were not searched for content`);
  if (changed.length > 0) allReasons.add("The declared source set changed during the audit");
  const reasonList = [...allReasons];
  const boundedReasons = boundedValues(reasonList, MAX_AUDIT_REASONS, MAX_AUDIT_SAMPLE_BYTES);
  const reasons = boundedReasons.values;
  const reasonsOmitted = boundedReasons.omitted;
  const filesystemComplete =
    !startFiles.partial &&
    !endFiles.partial &&
    !(startAllFiles?.partial ?? false) &&
    !(endAllFiles?.partial ?? false) &&
    startIgnoredPaths.length === 0 &&
    before.unavailable.length === 0 &&
    after.unavailable.length === 0;
  const searchComplete = scans.every(
    (scan) => scan.snapshotComplete && (scan.filesystemCoverage ?? "complete") === "complete",
  );
  const stable = changed.length === 0;
  const closureComplete = filesystemComplete && searchComplete && stable && filesSkippedOther === 0;
  const findings = patterns.map<AuditFindingDetails>((pattern, index) => {
    const scan = scans[index];
    if (!scan) throw new Error("Audit scan result missing");
    const status =
      scan.totalMatches > 0
        ? "present"
        : closureComplete
          ? "absent_with_complete_coverage"
          : "unknown";
    return {
      id: pattern.id,
      status,
      matches: scan.totalMatches,
      files: scan.fileCounts.size,
      evidence: scan.matches.slice(0, MAX_AUDIT_EVIDENCE).map((match) => ({
        path: match.displayPath,
        line: match.lineNumber,
      })),
      reproduction: {
        mode: "matches",
        pattern: pattern.literal,
        literal: true,
        path: scope.path,
        glob: [...scope.glob],
        exclude: [...scope.exclude],
        hidden: scope.hidden,
        ignorePolicy,
        scope: "strict",
      },
    };
  });
  const stabilityStatus: "stable" | "changed_during_search" | "unknown" =
    before.unavailable.length || after.unavailable.length
      ? "unknown"
      : changed.length
        ? "changed_during_search"
        : "stable";
  const boundedIgnored = boundedValues(
    startIgnoredPaths,
    MAX_AUDIT_IGNORED_FILES,
    MAX_AUDIT_SAMPLE_BYTES,
  );
  const ignoredFileSamples = boundedIgnored.values;
  const ignoredFilesOmitted = boundedIgnored.omitted;
  const boundedChanged = boundedValues(changed, MAX_AUDIT_CHANGED_FILES, MAX_AUDIT_SAMPLE_BYTES);
  const receipt = {
    declaredScope: scope,
    coverage: {
      filesDiscovered,
      filesAdmitted,
      filesSearched: searchedFiles,
      ignoredFiles: startIgnoredPaths.length,
      ignoredFileSamples,
      ignoredFilesOmitted,
      filesSkippedOther,
      complete: closureComplete,
      reasons,
      reasonsOmitted,
    },
    stability: {
      status: stabilityStatus,
      changedFiles: boundedChanged.values,
      changedFilesOmitted: boundedChanged.omitted,
    },
    findings,
  };
  const text = boundedAuditText(
    [
      `Audit receipt (${closureComplete ? "complete" : "PARTIAL"}).`,
      `Scope: ${JSON.stringify(scope)}.`,
      `Coverage: ${String(filesDiscovered)} discovered, ${String(filesAdmitted)} admitted, ${String(searchedFiles)} searched, ${String(startIgnoredPaths.length)} ignored, ${String(filesSkippedOther)} otherwise skipped.`,
      `Stability: ${stabilityStatus}${changed.length ? `; ${String(changed.length)} changed file(s)` : ""}.`,
      "Findings:",
      ...findings.map(findingText),
    ],
    [
      ...(ignoredFileSamples.length
        ? [
            `Ignored file samples: ${ignoredFileSamples.map((path) => JSON.stringify(path)).join(", ")}${ignoredFilesOmitted ? `; ${String(ignoredFilesOmitted)} more omitted` : ""}.`,
          ]
        : []),
      ...(boundedChanged.values.length
        ? [
            `Changed file samples: ${boundedChanged.values.map((path) => JSON.stringify(path)).join(", ")}${boundedChanged.omitted ? `; ${String(boundedChanged.omitted)} more omitted` : ""}.`,
          ]
        : []),
      ...(reasons.length || reasonsOmitted
        ? [
            reasons.length
              ? `Reasons: ${reasons.map((reason) => JSON.stringify(reason)).join("; ")}${reasonsOmitted ? `; ${String(reasonsOmitted)} more omitted` : ""}.`
              : `Reasons omitted by receipt budget: ${String(reasonsOmitted)}.`,
          ]
        : []),
    ],
  );
  return {
    text,
    details: {
      version: 1,
      mode: "audit",
      status: closureComplete ? "complete" : "partial",
      totalMatches: scans.reduce((sum, scan) => sum + scan.totalMatches, 0),
      storedMatches: scans.reduce((sum, scan) => sum + scan.matches.length, 0),
      totalFiles: startFiles.paths.length,
      returnedMatches: findings.reduce((sum, finding) => sum + finding.evidence.length, 0),
      snapshotComplete: closureComplete,
      scope,
      audit: receipt,
    },
  };
}
