#!/usr/bin/env node

// src/mcp.ts
import { randomUUID as randomUUID6 } from "node:crypto";
import { createServer } from "node:http";
import { URL as URL2 } from "node:url";
// package.json
var package_default = {
  name: "siftlight",
  version: "1.7.0-2",
  description: "Context-efficient local search for files, documents, notes and logs across Pi, OMP and MCP clients",
  keywords: [
    "ai-agent",
    "claude-code",
    "code-navigation",
    "codex",
    "context-engineering",
    "grep",
    "mcp",
    "oh-my-pi",
    "omp",
    "pi",
    "pi-extension",
    "pi-package",
    "ripgrep",
    "search",
    "source-inspection"
  ],
  homepage: "https://github.com/lightsifter/siftlight#readme",
  bugs: {
    url: "https://github.com/lightsifter/siftlight/issues"
  },
  license: "AGPL-3.0-only",
  author: "LightSifter",
  repository: {
    type: "git",
    url: "git+https://github.com/lightsifter/siftlight.git"
  },
  bin: {
    "siftlight-mcp": "src/mcp-server.mjs",
    "siftlight-model": "src/concept-worker.mjs"
  },
  files: [
    "src/**/*.ts",
    "src/syntax-worker.mjs",
    "src/mcp-server.mjs",
    "src/syntax-worker.toml",
    "README.md",
    "README.zh-CN.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "CHANGELOG.md",
    "SECURITY.md",
    "src/concept-worker.mjs",
    "plugins/siftlight/**"
  ],
  type: "module",
  publishConfig: {
    access: "public",
    provenance: true,
    registry: "https://registry.npmjs.org"
  },
  scripts: {
    "build:worker": "bun run scripts/build-syntax-worker.ts",
    "check:worker": "bun run doc/testing/scripts/check-syntax-worker.ts",
    "build:mcp": "bun run scripts/build-mcp-server.ts",
    "check:mcp": "bun run doc/testing/scripts/check-mcp-server.ts",
    format: "oxfmt --write .",
    "format:check": "oxfmt --check .",
    lint: "oxlint --type-aware --deny-warnings --report-unused-disable-directives src scripts",
    typecheck: "tsc --noEmit",
    test: "bun test ./doc/testing/test",
    "test:node": "bun run doc/testing/scripts/node-smoke.ts",
    benchmark: "bun run doc/testing/scripts/benchmark.ts",
    check: "bun run format:check && bun run lint && bun run typecheck && bun run build",
    "pack:check": "bun pm pack --dry-run && bun run scripts/check-npm-publish.ts",
    "setup:concept": "bun run src/concept-worker.mjs --install-model",
    "build:concept-worker": "bun run scripts/build-concept-worker.ts",
    "check:concept-worker": "bun run doc/testing/scripts/check-concept-worker.ts",
    "test:concept": "bun run doc/testing/scripts/test-concept.ts",
    "evaluate:investigations": "bun run doc/testing/scripts/investigation-eval.ts",
    "build:search-plugin": "bun run scripts/build-search-plugin.ts",
    "check:search-plugin": "bun run doc/testing/scripts/check-search-plugin.ts",
    "test:mcp-hosts": "bun run doc/testing/scripts/mcp-host-verification.ts",
    build: "bun run build:worker && bun run build:concept-worker && bun run build:search-plugin && bun run build:mcp",
    "format:local:check": "bun run doc/testing/scripts/format-local.ts --check",
    "lint:local": "oxlint --no-ignore --type-aware --tsconfig doc/testing/tsconfig.json --deny-warnings --report-unused-disable-directives src scripts doc/testing/test doc/testing/scripts",
    "typecheck:local": "tsc --noEmit --project doc/testing/tsconfig.json",
    "check:local": "bun run format:check && bun run format:local:check && bun run check:search-plugin && bun run check:concept-worker && bun run check:worker && bun run check:mcp && bun run lint:local && bun run typecheck:local && bun run test && bun run test:node && bun run benchmark"
  },
  dependencies: {
    "@ast-grep/lang-go": "0.0.6",
    "@ast-grep/napi": "0.45.2",
    "@huggingface/transformers": "3.8.1",
    "@modelcontextprotocol/sdk": "1.30.0",
    "@vscode/ripgrep": "1.18.0",
    typebox: "1.3.19",
    "web-tree-sitter": "0.25.10",
    zod: "4.5.4"
  },
  devDependencies: {
    "@earendil-works/pi-ai": "0.84.3",
    "@earendil-works/pi-coding-agent": "0.84.3",
    "@earendil-works/pi-tui": "0.84.3",
    "@types/bun": "^1.4.0",
    oxfmt: "^0.65.0",
    oxlint: "^1.80.0",
    "oxlint-tsgolint": "^7.0.2001",
    "tree-sitter-bash": "0.25.1",
    "tree-sitter-powershell": "0.26.4",
    typescript: "7.0.2"
  },
  peerDependencies: {
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*"
  },
  peerDependenciesMeta: {
    "@earendil-works/pi-ai": {
      optional: true
    },
    "@earendil-works/pi-coding-agent": {
      optional: true
    },
    "@earendil-works/pi-tui": {
      optional: true
    }
  },
  engines: {
    bun: ">=1.4.0",
    node: ">=22.19.0"
  },
  packageManager: "bun@1.4.2",
  knip: {
    entry: [
      "src/mcp-server.ts"
    ]
  },
  omp: {
    extensions: [
      "./plugins/siftlight/omp-extension.mjs"
    ]
  },
  pi: {
    extensions: [
      "./src/index.ts"
    ]
  }
};

// src/package-version.ts
var SIFTLIGHT_VERSION = package_default.version;

// src/mcp.ts
import { Value } from "typebox/value";
import {
  CallToolRequestSchema,
  isInitializeRequest,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// src/mcp-output.ts
var DEFAULT_MCP_OUTPUT_MODE = "structured";
function parseSiftlightMcpOutputMode(value) {
  if (value === undefined || value === DEFAULT_MCP_OUTPUT_MODE)
    return DEFAULT_MCP_OUTPUT_MODE;
  if (value === "text" || value === "model")
    return value;
  throw new Error('SIFTLIGHT_MCP_OUTPUT_MODE must be "structured", "text", or "model"');
}

// src/result-statistics.ts
var MAX_BREAKDOWN_ENTRIES = 5;
var MAX_TOP_FILES = 8;
function normalizedPath(value) {
  return value.replaceAll("\\", "/");
}
function extensionOf(value) {
  const path = normalizedPath(value);
  const slash = path.lastIndexOf("/");
  const basename = path.slice(slash + 1);
  const dot = basename.lastIndexOf(".");
  if (dot <= 0)
    return "[no extension]";
  return basename.slice(dot).toLowerCase();
}
function directoryOf(value) {
  const path = normalizedPath(value);
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "." : `${path.slice(0, slash)}/`;
}
function rankedEntries(counts) {
  return [...counts.entries()].map(([label, count]) => ({ label, count })).toSorted((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}
function group(dimension, counts) {
  const ranked = rankedEntries(counts);
  if (!ranked.length)
    return;
  return {
    dimension,
    entries: ranked.slice(0, MAX_BREAKDOWN_ENTRIES),
    omitted: Math.max(0, ranked.length - MAX_BREAKDOWN_ENTRIES),
    total: ranked.reduce((sum, entry) => sum + entry.count, 0)
  };
}
function fileCountsFromItems(items) {
  const counts = new Map;
  for (const item of items)
    counts.set(item.path, (counts.get(item.path) ?? 0) + 1);
  return counts;
}
function pathsFromCounts(counts) {
  return [...counts.keys()];
}
function createStatistics(unit, total, fileCounts, extraGroups = []) {
  const extensionCounts = new Map;
  const directoryCounts = new Map;
  for (const path of pathsFromCounts(fileCounts)) {
    extensionCounts.set(extensionOf(path), (extensionCounts.get(extensionOf(path)) ?? 0) + (fileCounts.get(path) ?? 0));
    directoryCounts.set(directoryOf(path), (directoryCounts.get(directoryOf(path)) ?? 0) + (fileCounts.get(path) ?? 0));
  }
  const groups = [
    group("file type", extensionCounts),
    group("directory", directoryCounts),
    ...extraGroups
  ].filter((entry) => entry !== undefined);
  const rankedFiles = rankedEntries(fileCounts);
  return {
    unit,
    total,
    files: fileCounts.size,
    directories: new Set(pathsFromCounts(fileCounts).map(directoryOf)).size,
    groups,
    topFiles: rankedFiles.slice(0, MAX_TOP_FILES),
    topFilesOmitted: Math.max(0, rankedFiles.length - MAX_TOP_FILES)
  };
}
function statisticsForItems(items, total, unit, extraGroups = []) {
  return createStatistics(unit, total, fileCountsFromItems(items), extraGroups);
}
function statisticsGroup(dimension, entries) {
  if (!entries.length)
    return;
  const ranked = [...entries].toSorted((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  return {
    dimension,
    entries: ranked.slice(0, MAX_BREAKDOWN_ENTRIES),
    omitted: Math.max(0, ranked.length - MAX_BREAKDOWN_ENTRIES),
    total: ranked.reduce((sum, entry) => sum + entry.count, 0)
  };
}
function formatStatistics(statistics, options = {}) {
  const lines = [
    `Result: ${String(statistics.total)} ${statistics.unit} across ${String(statistics.files)} files and ${String(statistics.directories)} directories.`
  ];
  for (const breakdown of statistics.groups) {
    const entries = breakdown.entries.map((entry) => `${entry.label}=${String(entry.count)}`).join(", ");
    const omitted = breakdown.omitted > 0 ? `, +${String(breakdown.omitted)} other categories` : "";
    lines.push(`By ${breakdown.dimension}: ${entries}${omitted}`);
  }
  if (options.includeTopFiles !== false && statistics.topFiles.length) {
    lines.push(`Top files: ${statistics.topFiles.map((entry) => `${entry.label}=${String(entry.count)}`).join(", ")}${statistics.topFilesOmitted > 0 ? `, +${String(statistics.topFilesOmitted)} other files` : ""}`);
  }
  return lines;
}
function analysisExtraGroups(counts, termCounts, items) {
  const groups = [];
  const classification = counts ? statisticsGroup("classification", Object.entries(counts).map(([label, count]) => ({ label, count }))) : undefined;
  if (classification)
    groups.push(classification);
  const terms = termCounts ? statisticsGroup("conditions", termCounts.map((term, index) => ({
    label: `condition #${String(index + 1)}`,
    count: term.retainedOccurrences
  }))) : undefined;
  if (terms)
    groups.push(terms);
  const evidence = new Map;
  for (const item of items) {
    const source = item.details?.source;
    if (source === "literal" || source === "concept")
      evidence.set(source, (evidence.get(source) ?? 0) + 1);
  }
  const evidenceGroup = group("evidence", evidence);
  if (evidenceGroup)
    groups.push(evidenceGroup);
  return groups;
}

// src/mcp-model-output.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function compactMetadata(details, analysis) {
  return [
    ...analysis.statistics ? formatStatistics(analysis.statistics) : [],
    analysis.counts ? `Counts: ${JSON.stringify(analysis.counts)}` : undefined,
    analysis.termCounts ? `Term counts: ${JSON.stringify(analysis.termCounts)}` : undefined,
    analysis.termCountsNextRequest ? `More term counts: ${JSON.stringify(analysis.termCountsNextRequest)}` : undefined,
    analysis.matchesRequest ? `Matches request: ${JSON.stringify(analysis.matchesRequest)}` : undefined,
    analysis.changes ? `Changes: ${JSON.stringify(analysis.changes)}` : undefined,
    analysis.scope ? `Scope: ${JSON.stringify(analysis.scope)}` : undefined,
    analysis.chunks ? `Chunks: ${JSON.stringify(analysis.chunks)}` : undefined,
    analysis.coverage ? `Coverage: ${JSON.stringify(analysis.coverage)}` : undefined,
    analysis.stats ? `Stats: ${JSON.stringify(analysis.stats)}` : undefined,
    analysis.sourceGeneration ? `Source generation: ${JSON.stringify(analysis.sourceGeneration)}` : undefined,
    analysis.semanticJudge ? `Semantic judge: ${JSON.stringify(analysis.semanticJudge)}` : undefined,
    details.operation ? `Operation: ${JSON.stringify(details.operation)}` : undefined,
    analysis.kind === "outline" && analysis.modelOutput ? "[Outline signatures are deferred; use version-checked inspection for source excerpts.]" : undefined,
    ...analysis.reasons.map((reason) => `[${reason}]`),
    details.redactionApplied ? "[Display redaction applied.]" : undefined
  ].filter((line) => line !== undefined);
}
function compactRows(analysis) {
  const rows = [];
  let previousPath;
  for (const item of analysis.items) {
    if (item.path !== previousPath) {
      rows.push(JSON.stringify(item.path));
      previousPath = item.path;
    }
    const label = analysis.kind === "outline" && analysis.modelOutput ? item.label : "metadata";
    const semanticJudge = item.details?.semanticJudge;
    const judgment = isRecord(semanticJudge) && typeof semanticJudge.classification === "string" && typeof semanticJudge.probability === "number" && typeof semanticJudge.model === "string" ? ` Jev: ${semanticJudge.classification}; probability=${String(semanticJudge.probability)};${typeof semanticJudge.confidence === "number" ? ` confidence=${String(semanticJudge.confidence)};` : ""} model=${JSON.stringify(semanticJudge.model)}.` : "";
    rows.push(`#${String(item.index)} L${String(item.line)} ${label}${judgment}`);
  }
  return rows;
}
function compactInspectInstruction(analysis) {
  if (analysis.inspectCursor)
    return `Inspect item #N: mode="inspect", cursor=${JSON.stringify(analysis.inspectCursor)}, matchIndex=N.`;
  const inspect = analysis.items.find((item) => item.inspect !== undefined)?.inspect;
  if (!inspect || typeof inspect.cursor !== "string")
    return;
  return `Inspect item #N: mode="inspect", cursor=${JSON.stringify(inspect.cursor)}, matchIndex=N${inspect.redact ? ", redact=true" : ""}.`;
}
function compactHeader(details, analysis) {
  if (analysis.termCounts && analysis.termCountsOffset !== undefined && analysis.totalTerms !== undefined) {
    const start = analysis.termCountsOffset + 1;
    const end = analysis.termCountsOffset + analysis.termCounts.length;
    return `${analysis.kind} term inventory ${String(start)}–${String(end)} of ${String(analysis.totalTerms)} (${details.status}).`;
  }
  const first = analysis.items[0]?.index;
  const last = analysis.items.at(-1)?.index;
  const shown = first === undefined || last === undefined ? "showing none" : `showing #${String(first)}–#${String(last)}`;
  return `${analysis.kind}: ${String(analysis.totalItems)} retained ${analysis.unit} (${details.status}); ${shown}.`;
}
function distinctNextRequest(details, analysis) {
  if (!details.nextRequest)
    return;
  const serialized = JSON.stringify(details.nextRequest);
  return serialized === JSON.stringify(analysis.termCountsNextRequest) || serialized === JSON.stringify(analysis.matchesRequest) ? undefined : serialized;
}
function compactMcpModelText(result) {
  const analysis = result.details.analysis;
  if (!analysis || analysis.kind === "validate")
    return result.text;
  const header = compactHeader(result.details, analysis);
  const inspect = compactInspectInstruction(analysis);
  const nextRequest = distinctNextRequest(result.details, analysis);
  const compact = [
    header,
    ...compactMetadata(result.details, analysis),
    ...compactRows(analysis),
    ...inspect ? [inspect] : [],
    ...nextRequest ? [`Next request: ${nextRequest}`] : []
  ].join(`
`);
  const standard = result.text.replace(" Structured output retains per-item evidence details.", "");
  if (analysis.semanticJudge)
    return compact;
  return Buffer.byteLength(compact) < Buffer.byteLength(standard) ? compact : standard;
}

// src/model-error.ts
import { types } from "node:util";

// src/analysis-limits.ts
var MAX_STRUCTURE_FILES = 200;
var MAX_CONFIGURABLE_STRUCTURE_FILES = 2000;
var MAX_STRUCTURE_BYTES = 32 * 1024 * 1024;
var MAX_SYNTAX_CACHE_ENTRIES = 256;
var MAX_SYNTAX_CACHE_NODES = 1e6;
var MAX_GIT_DIFF_WORK = 2000000;
var MAX_SYNTAX_NODES = 1e5;
var MAX_PARSE_TIME_MS = 5000;
var MAX_ANALYSIS_RESULTS = 50000;
var MAX_ANALYSIS_SNAPSHOTS = 20;
var MAX_ANALYSIS_STORAGE_BYTES = 32 * 1024 * 1024;
var ANALYSIS_METADATA_RESERVE_BYTES = 64 * 1024;
var MAX_ANALYSIS_REASONS = 64;
var MAX_ANALYSIS_REASON_BYTES = 4 * 1024;
var MIN_ANY_OF_TERMS = 2;
var MAX_ANY_OF_TERMS = 8;
var MAX_ANY_OF_TOTAL_TERMS = 64;
var MAX_LITERAL_TERM_BYTES = 256;
var ANALYSIS_TTL_MS = 10 * 60 * 1000;
var MAX_SOURCE_CONTINUATIONS = 20;
var MAX_SOURCE_CONTINUATION_BYTES = 1024 * 1024;
var MAX_IMPORT_HOPS = 8;
var MAX_IMPORT_FILES = 20;
var DEFAULT_HYBRID_CONCEPT_LIMIT = 3;
var MAX_HYBRID_CONCEPT_LIMIT = 20;

// src/types.ts
var DEFAULT_PAGE_SIZE = 100;
var MAX_PAGE_SIZE = 100;
var DEFAULT_RESULT_TOKEN_BUDGET = 2000;
var ESTIMATED_CHARACTERS_PER_TOKEN = 4;
var DEFAULT_SUMMARY_FILE_LIMIT = 30;
var MAX_SELECTED_PATHS = 20;
var MAX_INSPECT_TARGETS = 5;
var MAX_DISPLAYED_OCCURRENCES = 20;
var MAX_STORED_MATCHES = 50000;
var MAX_STORED_OCCURRENCES = 200000;
var MAX_SEARCH_STORAGE_BYTES = 32 * 1024 * 1024;
var MAX_LINE_CHARACTERS = 500;
var MAX_RESULT_BYTES = 16 * 1024;
var MAX_CONTEXT_LINES = 20;
var MAX_PROTOCOL_LINE_BYTES = 16 * 1024 * 1024;
var MAX_SOURCE_FILE_BYTES = 5 * 1024 * 1024;
var MAX_PATH_CHARACTERS = 4096;
var MAX_PATTERN_CHARACTERS = 64 * 1024;
var MAX_AUDIT_LITERAL_CHARACTERS = 256;
var MAX_FILE_FILTER_ITEMS = 64;
var MAX_SOURCE_REVISION_CONCURRENCY = 16;
var MAX_SOURCE_REVISION_FILES = 50000;

// src/redaction.ts
var PRIVATE_KEY = /-----BEGIN ([^-\r\n]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g;
var SENSITIVE_NAME = String.raw`(?:(?:[A-Za-z][A-Za-z0-9]*[_-])*(?:password|passwd|secret|token|api[_-]?key|access[_-]?(?:key|token)|secret[_-]?access[_-]?key|private[_-]?key|service[_-]?key)(?:[_-][A-Za-z0-9]+)*)`;
var SENSITIVE_ASSIGNMENT = new RegExp(String.raw`((?<![A-Za-z0-9_-])(?:["']?${SENSITIVE_NAME}["']?)\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\r\n]+)`, "gi");
var SENSITIVE_TOKEN = /\b(?:sk|ghp|xox[baprs])[-_][A-Za-z0-9][A-Za-z0-9_-]{7,}\b/g;
var TYPE_ONLY_VALUES = new Set([
  "boolean",
  "number",
  "string",
  "unknown",
  "never",
  "undefined",
  "null"
]);
function redactString(value) {
  let count = 0;
  let redacted = value.replace(PRIVATE_KEY, (_match, kind) => {
    count += 1;
    return `-----BEGIN ${kind}-----
[REDACTED]
-----END ${kind}-----`;
  });
  redacted = redacted.replace(SENSITIVE_ASSIGNMENT, (match, prefix, rawValue) => {
    const unquoted = rawValue.replace(/^["']|["']$/g, "").toLowerCase();
    if (TYPE_ONLY_VALUES.has(unquoted))
      return match;
    count += 1;
    return `${prefix}"[REDACTED]"`;
  });
  redacted = redacted.replace(SENSITIVE_TOKEN, () => {
    count += 1;
    return "[REDACTED]";
  });
  return { value: redacted, count };
}
function redactDiagnosticText(value) {
  return redactString(value).value;
}
function containsSensitiveText(value) {
  if (typeof value === "string")
    return redactString(value).count > 0;
  if (Array.isArray(value))
    return value.some((item) => containsSensitiveText(item));
  if (typeof value !== "object" || value === null)
    return false;
  return Object.values(value).some((item) => containsSensitiveText(item));
}
function redactInPlace(value, seen) {
  if (typeof value !== "object" || value === null)
    return 0;
  if (seen.has(value))
    return 0;
  seen.add(value);
  if (Array.isArray(value)) {
    let count = 0;
    for (let index = 0;index < value.length; index += 1) {
      const item = value[index];
      if (typeof item === "string") {
        const redacted = redactString(item);
        value[index] = redacted.value;
        count += redacted.count;
      } else
        count += redactInPlace(item, seen);
    }
    return count;
  }
  let count = 0;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      const redacted = redactString(item);
      Reflect.set(value, key, redacted.value);
      count += redacted.count;
    } else
      count += redactInPlace(item, seen);
  }
  return count;
}
function redactSiftlightResult(result) {
  const text = redactString(result.text);
  const details = structuredClone(result.details);
  const redactedCount = text.count + redactInPlace(details, new WeakSet);
  return {
    text: text.value,
    details: {
      ...details,
      redactedCount,
      redactionApplied: true
    }
  };
}

// src/errors.ts
class SiftlightError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "SiftlightError";
  }
}

class ConceptUnavailableError extends SiftlightError {
  constructor(message, options) {
    super(message, options);
    this.name = "ConceptUnavailableError";
  }
}

class RipgrepInputError extends SiftlightError {
  code;
  guidance;
  details;
  constructor(code, message, guidance) {
    super(`${message} ${guidance}`);
    this.name = "RipgrepInputError";
    this.code = code;
    this.guidance = guidance;
    this.details = {
      code,
      issues: [
        {
          field: code === "E_REGEX_INVALID" ? "pattern" : "path",
          reason: guidance
        }
      ],
      recovery: { action: "manual", reason: guidance }
    };
  }
}

class CursorError extends SiftlightError {
  code;
  constructor(message, code = "E_CURSOR_MALFORMED") {
    super(`${code}: ${message}`);
    this.name = "CursorError";
    this.code = code;
  }
}
function abortError() {
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}

// src/request-contract-error.ts
var MAX_REQUEST_RECOVERY_BYTES = 64 * 1024;
var MAX_REQUEST_DISPLAY_CHARACTERS = 256;
function boundedDisplay(value, maximum = MAX_REQUEST_DISPLAY_CHARACTERS) {
  const normalized = value.toWellFormed();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}…`;
}

class RequestContractError extends SiftlightError {
  #details;
  constructor(details, message) {
    super(message);
    this.name = "RequestContractError";
    this.#details = details;
  }
  get code() {
    return this.#details.code;
  }
  get mode() {
    return this.#details.mode;
  }
  get issues() {
    return this.#details.issues;
  }
  get recovery() {
    return this.#details.recovery;
  }
  get details() {
    return boundedRequestContractDetails(this.#details);
  }
  toJSON() {
    return { name: this.name, ...this.details };
  }
}
function isSiftlightDiagnosticError(error) {
  if (!(error instanceof Error))
    return false;
  const details = "details" in error ? error.details : undefined;
  return typeof details === "object" && details !== null;
}
function boundedRequestContractDetails(details) {
  let serialized;
  try {
    serialized = JSON.stringify(details);
  } catch {
    serialized = undefined;
  }
  if (serialized !== undefined && Buffer.byteLength(serialized) <= MAX_REQUEST_RECOVERY_BYTES)
    return details;
  return {
    code: boundedDisplay(details.code, 128),
    ...details.mode ? { mode: boundedDisplay(details.mode, 128) } : {},
    issues: [
      {
        field: "<payload>",
        reason: "The request-contract diagnostic exceeded the bounded payload budget."
      }
    ],
    recovery: {
      action: "manual",
      reason: "Exact recovery was omitted because the request-contract payload exceeded its bounded budget; preserve valid selectors and filters and correct the request explicitly."
    }
  };
}

// src/language-capability-definitions.ts
import { extname } from "node:path";
var TYPESCRIPT_LANGUAGE_CAPABILITIES = [
  {
    id: "ast-grep.outline",
    name: "outline",
    provider: "ast-grep",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy"
  },
  {
    id: "ast-grep.structure",
    name: "structure",
    provider: "ast-grep",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy"
  },
  {
    id: "ast-grep.roles",
    name: "roles",
    provider: "ast-grep",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy"
  },
  {
    id: "static-navigation.imports",
    name: "imports",
    provider: "bounded static module resolver",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy"
  },
  {
    id: "static-navigation.tests",
    name: "tests",
    provider: "bounded static module resolver",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy"
  }
];
var GO_LANGUAGE_CAPABILITIES = [
  {
    id: "ast-grep-go.structure",
    name: "structure",
    provider: "ast-grep lang-go",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy"
  },
  {
    id: "ast-grep-go.roles",
    name: "roles",
    provider: "ast-grep lang-go",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy"
  }
];
var PYTHON_LANGUAGE_CAPABILITIES = [
  {
    id: "python-outline.outline",
    name: "outline",
    provider: "bounded Python outline parser",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy"
  }
];
var DEFAULT_LANGUAGE_CAPABILITIES = [
  {
    language: "javascript",
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
    capabilities: TYPESCRIPT_LANGUAGE_CAPABILITIES
  },
  {
    language: "typescript",
    extensions: [".ts", ".mts", ".cts"],
    capabilities: TYPESCRIPT_LANGUAGE_CAPABILITIES
  },
  {
    language: "tsx",
    extensions: [".tsx"],
    capabilities: TYPESCRIPT_LANGUAGE_CAPABILITIES
  },
  { language: "go", extensions: [".go"], capabilities: GO_LANGUAGE_CAPABILITIES },
  { language: "python", extensions: [".py"], capabilities: PYTHON_LANGUAGE_CAPABILITIES },
  { language: "swift", extensions: [".swift"], capabilities: [] }
];
var DEFAULT_NEUTRAL_CAPABILITIES = [
  {
    id: "neutral.content",
    name: "content",
    provider: "ripgrep",
    providerKind: "builtin",
    evidence: "text",
    availability: "implemented",
    load: "none"
  },
  {
    id: "neutral.files",
    name: "files",
    provider: "ripgrep --files",
    providerKind: "builtin",
    evidence: "text",
    availability: "implemented",
    load: "none"
  },
  {
    id: "neutral.concept",
    name: "concept",
    provider: "local multilingual-e5 model",
    providerKind: "model",
    evidence: "model",
    availability: "conditional",
    load: "lazy",
    prerequisites: ["verified local model assets"]
  },
  {
    id: "neutral.hybrid",
    name: "hybrid",
    provider: "ripgrep + local multilingual-e5 model",
    providerKind: "model",
    evidence: "model",
    availability: "conditional",
    load: "lazy",
    prerequisites: ["verified local model assets"]
  }
];
function descriptorForPath(descriptors, path) {
  const extension = extname(path).toLowerCase();
  return descriptors.find((item) => item.extensions.includes(extension));
}
function languageForPath(descriptors, path) {
  return descriptorForPath(descriptors, path)?.language;
}
function outlineExtension(path) {
  const extension = extname(path).toLowerCase();
  return extension || undefined;
}

// src/request-contract-catalog.ts
var SIFTLIGHT_MODES = [
  "audit",
  "auto",
  "summary",
  "matches",
  "inspect",
  "outline",
  "imports",
  "tests",
  "files",
  "structure",
  "concept",
  "hybrid",
  "validate",
  "capabilities",
  "await",
  "cancel"
];
var commonFields = ["mode", "redact"];
var sourceFilters = [
  "path",
  "glob",
  "exclude",
  "hidden"
];
var ordinaryFields = [
  ...commonFields,
  "pattern",
  ...sourceFilters,
  "ignorePolicy",
  "literal",
  "ignoreCase",
  "context",
  "limit",
  "scope",
  "wholeWord",
  "modifiedAfter",
  "modifiedBefore",
  "anyOf",
  "allOf",
  "within",
  "roles",
  "changes",
  "maxFilesToParse",
  "cursor",
  "matchIndex"
];
var MODE_FIELDS_BY_MODE = {
  audit: [...commonFields, "patterns", ...sourceFilters, "ignorePolicy"],
  auto: ordinaryFields,
  summary: ordinaryFields,
  matches: ordinaryFields,
  inspect: [...commonFields, "path", "line", "cursor", "matchIndex", "matchIndices", "targets"],
  outline: [...commonFields, "path", "line", "symbol", "cursor", "matchIndex", "maxFilesToParse"],
  imports: [
    ...commonFields,
    ...sourceFilters,
    "line",
    "symbol",
    "cursor",
    "matchIndex",
    "maxFilesToParse"
  ],
  tests: [
    ...commonFields,
    ...sourceFilters,
    "line",
    "symbol",
    "cursor",
    "matchIndex",
    "maxFilesToParse"
  ],
  files: [...commonFields, "query", ...sourceFilters, "modifiedAfter", "modifiedBefore"],
  structure: [...commonFields, "pattern", ...sourceFilters, "maxFilesToParse"],
  concept: [...commonFields, "query", ...sourceFilters],
  hybrid: [...commonFields, "query", ...sourceFilters, "conceptLimit"],
  validate: [...commonFields, "cursor", "matchIndex"],
  capabilities: [...commonFields, ...sourceFilters],
  await: ["mode", "operationId"],
  cancel: ["mode", "operationId"]
};
var SAFE_DROP_FIELDS = {
  files: ["scope"]
};
var SUPPORTED_OUTLINE_EXTENSIONS = new Set(DEFAULT_LANGUAGE_CAPABILITIES.flatMap((descriptor) => descriptor.capabilities.some((capability) => capability.name === "outline") ? descriptor.extensions : []));
function modeFields(mode) {
  return MODE_FIELDS_BY_MODE[mode];
}
function modeFieldSummary(mode) {
  return `${mode}: ${modeFields(mode).join(",")}`;
}
var MODE_SUMMARY_MODES = [
  "audit",
  "files",
  "concept",
  "hybrid",
  "inspect",
  "outline",
  "capabilities",
  "await",
  "cancel"
];
var MODE_FIELD_SUMMARY = MODE_SUMMARY_MODES.map((mode) => modeFieldSummary(mode)).join("; ");
var REQUEST_FIELD_GUIDANCE = {
  pattern: "pattern is regex by default; literal=true matches source text exactly",
  literal: "literal=true makes pattern exact source text; anyOf/allOf already use literal semantics",
  path: "path must be an existing exact file or root; use mode=files+query for unknown names",
  query: "files+query matches known filename/path text (not glob patterns); omit files query to list every file under path; concept/hybrid query is natural language",
  anyOf: "anyOf is case-sensitive exact-literal OR; omit pattern, allOf, literal, ignoreCase, roles",
  allOf: "allOf is case-sensitive exact-literal AND; omit pattern, anyOf, literal, ignoreCase, roles",
  context: "context is an output-context budget and is never silently dropped",
  limit: "limit is an output/page budget and is never silently dropped",
  scope: "scope applies to ordinary content search; mode=files rejects this field because its scope is fixed strict, and only redundant strict may be removed",
  ignorePolicy: "respect keeps repository ignore rules; include searches ignored files but always excludes .git internals and protected paths",
  patterns: "audit accepts named exact-literal patterns and returns one closure receipt"
};
function fieldGuidance(field) {
  return REQUEST_FIELD_GUIDANCE[field] ?? `${field} is accepted only by its cataloged modes`;
}
var GUIDANCE_FIELDS = [
  "pattern",
  "literal",
  "path",
  "query",
  "anyOf",
  "allOf",
  "context",
  "limit",
  "scope"
];
var SEARCH_GUIDANCE_FIELDS = ["pattern", "literal", "path", "query"];
var VARIANT_GUIDANCE_FIELDS = ["anyOf", "allOf"];
var BUDGET_GUIDANCE_FIELDS = ["limit", "context"];
var REQUEST_USAGE_GUIDANCE = [
  `search: ${SEARCH_GUIDANCE_FIELDS.map((field) => fieldGuidance(field)).join("; ")}`,
  `variants: ${VARIANT_GUIDANCE_FIELDS.map((field) => fieldGuidance(field)).join("; ")}`,
  `budgets: ${BUDGET_GUIDANCE_FIELDS.map((field) => fieldGuidance(field)).join("; ")}`,
  `selectors: ${modeFieldSummary("inspect")}; ${modeFieldSummary("hybrid")}; ${modeFieldSummary("files")}; ${modeFieldSummary("capabilities")}`,
  "use only the advertised names: exact, any-of and max_results are not parameters"
].join("; ");
var MODEL_USAGE_GUIDANCE = [
  "pattern is regex by default; literal=true matches source text exactly",
  "path is an existing exact file or root; use files+query for an unknown name",
  "anyOf/allOf are exact-literal OR/AND variants and exclude pattern/literal",
  `limit/context are ordinary-search output budgets; limit <= ${String(MAX_PAGE_SIZE)}; omit both for hybrid/concept/outline/structure/inspect`,
  "outline requires a concrete source file, not a directory; structure requires a nonempty AST pattern and JS/TS/TSX/Go sources, no lang field; use capabilities before unfamiliar language operations",
  "outline supports JS/TS/TSX and bounded Python syntax; imports/tests are static candidates for JS/TS/TSX",
  `selectors: ${modeFieldSummary("inspect")}; ${modeFieldSummary("hybrid")}; ${modeFieldSummary("capabilities")}`,
  "exact, any-of and max_results are not parameters"
].join("; ");
var MODE_CONTRACT_DESCRIPTION = [
  `fields: ${MODE_FIELD_SUMMARY}`,
  `rules: ${GUIDANCE_FIELDS.map((field) => `${field} — ${fieldGuidance(field)}`).join("; ")}`,
  "inspect uses cursor+matchIndex or explicit targets; imports/tests report static syntax candidates",
  "capabilities performs a bounded names-only project inventory and reports per-language modes with lazy loading; it does not start a parser, compiler, model or language server",
  "outline follows declared syntax capabilities; unavailable languages appear in capabilities",
  "there are no exact, any-of or max_results fields; use literal, anyOf or limit",
  "context 0–20 is never clamped"
].join("; ");
function outlineExtension2(path) {
  if (typeof path !== "string")
    return;
  return outlineExtension(path);
}

// src/request-contract.ts
var MAX_REQUEST_RECOVERY_ISSUES = 16;
function boundedField(value) {
  return boundedDisplay(value, 128);
}
function record(value) {
  return typeof value === "object" && value !== null;
}
function modeOf(input) {
  const mode = input.mode;
  if (mode === undefined)
    return "auto";
  if (typeof mode !== "string")
    return;
  return SIFTLIGHT_MODES.find((candidate) => candidate === mode);
}
function inputModeLabel(input) {
  return typeof input.mode === "string" ? input.mode.slice(0, 128) : undefined;
}
function outlineCapability(path, resolvedDocument = false) {
  const extension = outlineExtension2(path);
  return {
    ...extension ? { extension } : {},
    supported: extension !== undefined ? SUPPORTED_OUTLINE_EXTENSIONS.has(extension) : !resolvedDocument
  };
}
function capabilityError(code, mode, field, reason, message) {
  return new RequestContractError({
    code,
    ...mode ? { mode } : {},
    issues: [{ field, reason }],
    recovery: { action: "choose-capability", reason }
  }, message);
}
function schemaError(input, field, reason) {
  const mode = inputModeLabel(input);
  return new RequestContractError({
    code: `E_${field.replaceAll(/[^a-z0-9]+/giu, "_").toUpperCase()}_RANGE`,
    ...mode ? { mode } : {},
    issues: [{ field, reason }],
    recovery: { action: "manual", reason }
  }, `${field} is invalid: ${reason}`);
}
function safeNextRequest(input, mode, invalid) {
  if (input.redact === true && containsSensitiveText(input))
    return;
  const safe = new Set(SAFE_DROP_FIELDS[mode] ?? []);
  if (invalid.some((field) => !safe.has(field)))
    return;
  const next = { ...input };
  for (const field of invalid)
    delete next[field];
  if (selectorIssuesFor(next, mode).length > 0)
    return;
  try {
    if (Buffer.byteLength(JSON.stringify(next)) > MAX_REQUEST_RECOVERY_BYTES)
      return;
  } catch {
    return;
  }
  return next;
}
function fieldsError(input, mode, invalid, selectorIssues = []) {
  const nextRequest = safeNextRequest(input, mode, invalid);
  const visibleInvalid = invalid.slice(0, MAX_REQUEST_RECOVERY_ISSUES);
  const omitted = invalid.length - visibleInvalid.length;
  const issues = [
    ...visibleInvalid.map((field) => ({
      field: boundedField(field),
      reason: `not accepted by mode=${boundedDisplay(mode, 128)}`
    })),
    ...selectorIssues
  ];
  if (omitted > 0)
    issues.push({
      field: "<additional-fields>",
      reason: `${String(omitted)} additional fields are not accepted`
    });
  const visibleFields = visibleInvalid.map((field) => boundedField(field)).join(", ");
  const reason = omitted > 0 ? `mode=${mode} does not accept ${visibleFields} and ${String(omitted)} additional field(s)` : `mode=${mode} does not accept ${visibleFields}`;
  const flatRule = `Fields are flat: pass them at the top level, not inside a per-mode object. mode=${mode} accepts: ${modeFields(mode).join(", ")}.`;
  return new RequestContractError({
    code: "E_MODE_FIELDS",
    mode,
    issues,
    recovery: nextRequest ? {
      action: "retry",
      reason: `Remove only ${visibleFields} and copy the exact nextRequest; all other fields are preserved.`,
      nextRequest
    } : {
      action: "manual",
      reason: `${reason}; choose the mode explicitly or remove the fields yourself without changing the requested scope. ${flatRule}`
    }
  }, nextRequest ? `${reason}; retry the exact nextRequest without repeating the original query.` : `${reason}; no semantics-preserving automatic request is available. ${flatRule} Preserve valid path, filters, redact and cursor fields when choosing the next request.`);
}
function selectorIssuesFor(input, mode) {
  if ((mode === "auto" || mode === "summary" || mode === "matches") && typeof input.cursor === "string" && input.cursor.trim().length > 0 && !input.cursor.includes(".analysis")) {
    const issues = [];
    if (mode === "summary" && input.path !== undefined)
      issues.push({ field: "path", reason: "summary cursor paging cannot select a direct path" });
    if (mode === "summary" && input.paths !== undefined)
      issues.push({ field: "paths", reason: "summary cursor paging cannot select retained paths" });
    if (mode !== "summary" && input.path !== undefined && input.paths !== undefined)
      issues.push({ field: "paths", reason: "cursor selection accepts path or paths, not both" });
    return issues;
  }
  if (mode === "outline" || mode === "imports" || mode === "tests") {
    if (input.cursor !== undefined) {
      const issues = [];
      if (!Number.isSafeInteger(input.matchIndex))
        issues.push({ field: "matchIndex", reason: "cursor continuation requires matchIndex" });
      for (const field of ["path", "line", "symbol"])
        if (input[field] !== undefined)
          issues.push({ field, reason: "cursor continuation cannot combine a direct selector" });
      return issues;
    }
    if (typeof input.path !== "string" || input.path.length === 0)
      return [
        { field: "path", reason: `mode=${mode} requires a source path or cursor+matchIndex` }
      ];
    return [];
  }
  if (mode === "inspect") {
    const issues = [];
    const hasMatchIndices = input.matchIndices !== undefined;
    const hasTargets = input.targets !== undefined;
    if (hasMatchIndices && hasTargets)
      issues.push({ field: "targets", reason: "use either matchIndices or targets, not both" });
    if (hasMatchIndices && typeof input.cursor !== "string")
      issues.push({ field: "cursor", reason: "matchIndices requires a cursor" });
    if (hasTargets && input.cursor !== undefined)
      issues.push({ field: "cursor", reason: "targets cannot be combined with cursor" });
    if (hasMatchIndices || hasTargets) {
      for (const field of ["path", "line", "matchIndex"])
        if (input[field] !== undefined)
          issues.push({
            field,
            reason: "batch inspection accepts targets or matchIndices instead of path, line or matchIndex"
          });
      return issues;
    }
    if (typeof input.cursor === "string" && input.cursor.includes(".analysis")) {
      if (!Number.isSafeInteger(input.matchIndex))
        issues.push({
          field: "matchIndex",
          reason: "cursor inspection requires matchIndex"
        });
      if (input.path !== undefined)
        issues.push({ field: "path", reason: "analysis cursor inspection cannot combine path" });
      if (input.line !== undefined)
        issues.push({ field: "line", reason: "analysis cursor inspection cannot combine line" });
    }
    return issues;
  }
  if (mode === "validate" && typeof input.cursor !== "string")
    return [{ field: "cursor", reason: "mode=validate requires a saved evidence cursor" }];
  return [];
}
function selectorError(input, mode, issues) {
  const reason = issues.map((issue) => `${issue.field}: ${issue.reason}`).join("; ");
  return new RequestContractError({
    code: "E_MODE_SELECTOR",
    mode,
    issues,
    recovery: {
      action: "manual",
      reason: `${reason}; choose a complete selector variant explicitly. No executable nextRequest can be inferred.`
    }
  }, `mode=${mode} has an incomplete or conflicting selector: ${reason}`);
}
function validateValueRanges(input) {
  const integerRanges = [
    ["context", 0, MAX_CONTEXT_LINES],
    ["limit", 1, MAX_PAGE_SIZE],
    ["conceptLimit", 1, MAX_HYBRID_CONCEPT_LIMIT],
    ["maxFilesToParse", 1, MAX_CONFIGURABLE_STRUCTURE_FILES]
  ];
  for (const [field, minimum, maximum] of integerRanges) {
    const value = input[field];
    if (value !== undefined && (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum))
      throw schemaError(input, field, `must be an integer from ${String(minimum)} through ${String(maximum)}`);
  }
}
function validateRequired(input, mode) {
  if (mode === "audit" && (!Array.isArray(input.patterns) || input.patterns.length === 0))
    throw capabilityError("E_AUDIT_PATTERNS_REQUIRED", mode, "patterns", "mode=audit requires one or more named literal patterns", "Provide patterns as objects with id and literal fields");
  if ((mode === "concept" || mode === "hybrid") && (typeof input.query !== "string" || !input.query.trim()))
    throw capabilityError("E_MODE_QUERY_REQUIRED", mode, "query", `mode=${mode} requires a nonempty natural-language query`, `mode=${mode} requires query; provide the natural-language question and retry`);
  if (mode === "await" || mode === "cancel") {
    if (typeof input.operationId !== "string" || !input.operationId.trim())
      throw capabilityError("E_OPERATION_ID_REQUIRED", mode, "operationId", `${mode} requires the exact operationId returned by a prior waiting result`, `${mode} requires operationId; copy the returned nextRequest exactly`);
  }
}
function validateOutlineCapability(input, mode) {
  if (mode !== "outline")
    return;
  const capability = outlineCapability(typeof input.path === "string" ? input.path : undefined);
  if (!capability.supported && typeof input.path === "string")
    throw outlineCapabilityError(input.path, mode);
}
function outlineCapabilityError(path, mode = "outline", resolvedDocument = false) {
  const capability = outlineCapability(path, resolvedDocument);
  if (capability.supported)
    return;
  const extension = capability.extension ?? "extensionless source";
  return capabilityError("E_MODE_UNSUPPORTED", mode, "language", `outline requires a declared language outline capability; ${extension} is unsupported`, `mode=outline is unavailable for ${extension}; choose a language capability from mode=capabilities or use ordinary content search`);
}
function validateRequestContract(input) {
  const value = input;
  if (!record(value))
    throw schemaError({}, "request", "request must be an object");
  const raw = value;
  validateValueRanges(raw);
  const mode = modeOf(raw);
  if (!mode)
    throw capabilityError("E_MODE_UNKNOWN", inputModeLabel(raw), "mode", `mode must be one of ${SIFTLIGHT_MODES.join(", ")}`, "Choose one of the advertised modes and retry");
  if (raw.sourceCursor !== undefined && mode !== "inspect")
    throw capabilityError("E_SOURCE_CURSOR_MODE", mode, "sourceCursor", "sourceCursor is only valid with mode=inspect", "Copy the source continuation request with mode=inspect");
  if (raw.operationId !== undefined && mode !== "await" && mode !== "cancel")
    throw capabilityError("E_OPERATION_MODE", mode, "operationId", "operationId is only valid with mode=await or mode=cancel", "Copy the returned await or cancel request exactly");
  validateRequired(raw, mode);
  validateOutlineCapability(raw, mode);
  if (mode === "auto" && raw.query !== undefined)
    throw capabilityError("E_MODE_REQUIRED", mode, "query", "query is ambiguous without an explicit discovery or semantic mode", 'Use mode="files" for filename discovery or mode="concept" for semantic discovery');
  if (mode === "files" && raw.scope === "expand")
    throw new RequestContractError({
      code: "E_FILES_SCOPE_EXPAND",
      mode,
      issues: [
        { field: "scope", reason: "scope=expand has no semantics-preserving files repair" }
      ],
      recovery: {
        action: "manual",
        reason: "Choose mode=files with the intended discovery root and preserve path/filters explicitly."
      }
    }, "mode=files does not support scope=expand; choose the intended discovery root explicitly and preserve path/glob/exclude/hidden filters");
  const allowed = new Set(MODE_FIELDS_BY_MODE[mode]);
  if (mode === "inspect" && raw.sourceCursor !== undefined) {
    allowed.clear();
    for (const field of ["mode", "sourceCursor", "redact"])
      allowed.add(field);
  }
  if ((mode === "auto" || mode === "summary" || mode === "matches") && typeof raw.cursor === "string" && raw.cursor.includes(".analysis")) {
    allowed.clear();
    for (const field of ["mode", "cursor", "redact"])
      allowed.add(field);
  }
  if ((mode === "auto" || mode === "summary" || mode === "matches") && typeof raw.cursor === "string" && raw.cursor.trim().length > 0 && !raw.cursor.includes(".analysis")) {
    allowed.clear();
    for (const field of ["mode", "cursor", "path", "paths", "redact"])
      allowed.add(field);
  }
  const allowedNames = new Set(allowed);
  const invalid = Object.keys(raw).filter((field) => !allowedNames.has(field));
  const selectorIssues = selectorIssuesFor(raw, mode);
  if (invalid.length > 0) {
    throw fieldsError(raw, mode, invalid, selectorIssues);
  }
  if (selectorIssues.length > 0)
    throw selectorError(raw, mode, selectorIssues);
}
function schemaContractError(value, field, message) {
  const raw = record(value) ? value : {};
  const normalized = boundedField(field?.replace(/^\//u, "") || "request");
  if (normalized === "context")
    return schemaError(raw, "context", `must be an integer from 0 through ${String(MAX_CONTEXT_LINES)}; choose the desired bounded context explicitly`);
  const mode = inputModeLabel(raw);
  return new RequestContractError({
    code: "E_SCHEMA",
    ...mode ? { mode } : {},
    issues: [{ field: normalized, reason: message }],
    recovery: {
      action: "manual",
      reason: "Correct the value according to the advertised schema; no value is clamped or guessed."
    }
  }, `Invalid siftlight arguments at /${normalized}: ${message}`);
}

// src/model-error.ts
var MAX_RAW_ERROR_SCAN_CHARACTERS = 4096;
var MAX_MODEL_ERROR_CHARACTERS = 1024;
var MODEL_ERROR_PREFIX = "siftlight failed:";
function errorMessage(error) {
  try {
    if (types.isNativeError(error)) {
      const message = Object.getOwnPropertyDescriptor(error, "message");
      if (!message)
        return "unknown failure";
      return typeof message.value === "string" ? message.value : "unreadable failure";
    }
    if (error === null)
      return "null";
    switch (typeof error) {
      case "string":
        return error;
      case "number":
        return String(error);
      case "boolean":
        return error ? "true" : "false";
      case "undefined":
        return "undefined";
      case "bigint":
        return "bigint failure";
      case "symbol":
        return "symbol failure";
      case "function":
      case "object":
        return "non-error failure";
      default:
        return "unreadable failure";
    }
  } catch {
    return "unreadable failure";
  }
}
function modelErrorText(error) {
  if (isSiftlightDiagnosticError(error))
    return requestContractErrorText(error);
  const raw = errorMessage(error);
  const normalized = raw.slice(0, MAX_RAW_ERROR_SCAN_CHARACTERS).toWellFormed().replace(/\s+/gu, " ").trim();
  const message = normalized.replace(/^(?:siftlight failed:\s*)+/u, "") || "unknown failure";
  const text = `${MODEL_ERROR_PREFIX} ${message}`;
  if (text.length <= MAX_MODEL_ERROR_CHARACTERS)
    return text;
  return `${text.slice(0, MAX_MODEL_ERROR_CHARACTERS - 1).toWellFormed()}…`;
}
function requestContractErrorText(error) {
  return requestContractProjection(error).text;
}
function projectRequestContract(projected, serialized, message) {
  const prefix = `siftlight failed: request rejected [${projected.code}]: ${message}`;
  const recovery = projected.recovery;
  const next = recovery.nextRequest ? `
Copy the nested recovery.nextRequest object unchanged; do not repeat the original query.` : `
Recovery action: ${recovery.action}. ${recovery.reason}`;
  return `
Error details: ${serialized}
${prefix}${next}`;
}
function requestContractProjection(error) {
  const details = boundedRequestContractDetails(error.details);
  const serializedDetails = JSON.stringify(details);
  const boundedMessage = error.message.toWellFormed().slice(0, 1024);
  const result = projectRequestContract(details, serializedDetails, boundedMessage);
  if (Buffer.byteLength(result) <= MAX_REQUEST_RECOVERY_BYTES)
    return { details, text: result };
  const compact = {
    code: boundedMessage.length > 0 ? details.code : "E_REQUEST_CONTRACT_PAYLOAD",
    ...details.mode ? { mode: details.mode } : {},
    issues: [
      {
        field: "<payload>",
        reason: "The visible request-contract error exceeded its bounded payload budget."
      }
    ],
    recovery: {
      action: "manual",
      reason: "Exact recovery was omitted; correct the request explicitly."
    }
  };
  const compactText = projectRequestContract(compact, JSON.stringify(compact), "The request-contract error exceeded the bounded payload budget; correct the request explicitly.");
  return { details: compact, text: compactText };
}

// src/rg.ts
import { isAbsolute as isAbsolute3, relative as relative2, resolve as resolve4 } from "node:path";

// src/excerpt.ts
function boundedCharacter(value, maximum) {
  if (!Number.isFinite(value))
    return 0;
  return Math.min(maximum, Math.max(0, Math.floor(value)));
}
function excerptText(text, focusStart = 0, focusEnd = focusStart, maximumCharacters = MAX_LINE_CHARACTERS) {
  if (!Number.isSafeInteger(maximumCharacters) || maximumCharacters <= 0) {
    throw new Error("Excerpt size must be a positive safe integer");
  }
  if (text.length <= maximumCharacters) {
    return {
      text,
      truncated: false,
      startCharacter: 0,
      endCharacter: text.length
    };
  }
  const boundedStart = boundedCharacter(focusStart, text.length);
  const boundedEnd = Math.max(boundedStart, boundedCharacter(focusEnd, text.length));
  const focusLength = boundedEnd - boundedStart;
  const startCharacter = focusLength >= maximumCharacters ? Math.min(boundedStart, text.length - maximumCharacters) : Math.min(Math.max(0, boundedStart - Math.floor((maximumCharacters - focusLength) / 2)), text.length - maximumCharacters);
  const endCharacter = startCharacter + maximumCharacters;
  const prefix = startCharacter > 0 ? "…" : "";
  const suffix = endCharacter < text.length ? "…" : "";
  return {
    text: `${prefix}${text.slice(startCharacter, endCharacter)}${suffix}`,
    truncated: true,
    startCharacter,
    endCharacter
  };
}

// src/search-retention.ts
class SearchRetention {
  #bytes = 0;
  #metadataBytes = 0;
  #metadataLimitReached = false;
  #occurrences = 0;
  #reasons = new Set;
  maxBytes;
  maxOccurrences;
  constructor(maxBytes = MAX_SEARCH_STORAGE_BYTES, maxOccurrences = MAX_STORED_OCCURRENCES) {
    this.maxBytes = maxBytes;
    this.maxOccurrences = maxOccurrences;
    for (const value of [maxBytes, maxOccurrences]) {
      if (!Number.isSafeInteger(value) || value < 1)
        throw new SiftlightError("Search retention limits must be positive safe integers");
    }
  }
  file(displayPath, absolutePath) {
    if (this.#metadataLimitReached)
      return false;
    const bytes = Buffer.byteLength(JSON.stringify([displayPath, absolutePath])) + 512;
    const metadataLimit = Math.floor(this.maxBytes / 4);
    if (this.#metadataBytes + bytes > metadataLimit) {
      this.#metadataLimitReached = true;
      this.#reasons.add(`File-summary retention reached its ${String(metadataLimit)}-byte share of the search budget; file summaries are partial; narrow the path or filters`);
      return false;
    }
    this.#bytes += bytes;
    this.#metadataBytes += bytes;
    return true;
  }
  canRetainOccurrences(count) {
    if (this.#occurrences + count <= this.maxOccurrences)
      return true;
    this.#reasons.add(`Occurrence retention reached the ${String(this.maxOccurrences)} limit`);
    return false;
  }
  retain(match) {
    if (!this.canRetainOccurrences(match.occurrences.length))
      return false;
    const bytes = Buffer.byteLength(JSON.stringify(match)) + 1;
    if (this.#bytes - this.#metadataBytes + bytes > this.maxBytes - Math.floor(this.maxBytes / 4)) {
      this.#reasons.add(`Search evidence retention reached the ${String(this.maxBytes)}-byte limit`);
      return false;
    }
    this.#bytes += bytes;
    this.#occurrences += match.occurrences.length;
    return true;
  }
  noteLimit(reason) {
    this.#reasons.add(reason);
  }
  get details() {
    return {
      accountedBytes: this.#bytes,
      retainedOccurrences: this.#occurrences,
      maxBytes: this.maxBytes,
      maxOccurrences: this.maxOccurrences,
      reasons: [...this.#reasons]
    };
  }
}

// src/capped-lines.ts
var MAX_DIAGNOSTIC_PREFIX_BYTES = 8 * 1024;
async function consumeCappedLines(stream, onLine, options = {}) {
  const maxLineBytes = options.maxLineBytes ?? MAX_PROTOCOL_LINE_BYTES;
  if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 1)
    throw new Error("Capped line byte limit must be a positive safe integer");
  let lineChunks = [];
  let lineBytes = 0;
  let discarding = false;
  const resetLine = () => {
    lineChunks = [];
    lineBytes = 0;
  };
  const lastLineByte = () => {
    const chunk = lineChunks.at(-1);
    return chunk && chunk.length > 0 ? chunk[chunk.length - 1] : undefined;
  };
  const prefixFor = (segment, totalBytes) => {
    const prefixBytes = Math.min(MAX_DIAGNOSTIC_PREFIX_BYTES, totalBytes);
    const prefix = Buffer.allocUnsafe(prefixBytes);
    let copied = 0;
    for (const chunk of lineChunks) {
      if (copied === prefixBytes)
        break;
      const length = Math.min(chunk.length, prefixBytes - copied);
      prefix.set(chunk.subarray(0, length), copied);
      copied += length;
    }
    if (copied < prefixBytes) {
      const length = Math.min(segment.length, prefixBytes - copied);
      prefix.set(segment.subarray(0, length), copied);
    }
    return prefix.toString("utf8");
  };
  const lineText = (withoutTrailingCarriageReturn) => {
    const contentBytes = lineBytes - (withoutTrailingCarriageReturn && lineBytes > 0 ? 1 : 0);
    const bytes = Buffer.concat(lineChunks, lineBytes);
    return bytes.toString("utf8", 0, contentBytes);
  };
  const reportOverflow = (segment, observedBytes, final) => {
    if (!options.onLineTooLong)
      throw new Error(`Input line exceeds the ${String(maxLineBytes)}-byte limit${final ? " at end of stream" : ""}`);
    options.onLineTooLong({
      prefix: prefixFor(segment, observedBytes),
      observedBytes
    });
  };
  const consumeChunk = (chunk, final) => {
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline >= 0 ? newline : chunk.length;
      const segment = chunk.subarray(offset, end);
      if (discarding) {
        if (newline < 0)
          return;
        discarding = false;
        resetLine();
        offset = newline + 1;
        continue;
      }
      const observedBytes = lineBytes + segment.length;
      const hasTrailingCarriageReturn = newline >= 0 && observedBytes > 0 && (segment.at(-1) ?? lastLineByte()) === 13;
      const contentBytes = observedBytes - (hasTrailingCarriageReturn ? 1 : 0);
      if (contentBytes > maxLineBytes) {
        reportOverflow(segment, observedBytes, final && newline < 0);
        resetLine();
        if (newline < 0)
          discarding = true;
        else
          offset = newline + 1;
        continue;
      }
      if (segment.length > 0)
        lineChunks.push(segment);
      lineBytes = observedBytes;
      if (newline < 0)
        return;
      onLine(lineText(hasTrailingCarriageReturn));
      resetLine();
      offset = newline + 1;
    }
  };
  for await (const chunk of stream)
    consumeChunk(chunk, false);
  if (discarding)
    return;
  consumeChunk(new Uint8Array, true);
  if (lineBytes > 0)
    onLine(lineText(false));
}

// src/path-policy.ts
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
var POSIX_SPECIAL_ROOTS = ["/dev", "/proc", "/sys"];
var PORTABLE_CREDENTIAL_DIRECTORY_NAMES = [
  ".ssh",
  ".gnupg",
  ".aws",
  ".azure",
  ".kube",
  ".docker",
  ".password-store"
];
var HOME_CREDENTIAL_DIRECTORIES = [
  [".ssh"],
  [".gnupg"],
  [".aws"],
  [".azure"],
  [".kube"],
  [".docker"],
  [".password-store"],
  [".config", "gcloud"],
  [".config", "gh"],
  [".local", "share", "keyrings"]
];
var HOME_CREDENTIAL_FILES = [[".netrc"], [".npmrc"], [".pypirc"], [".git-credentials"]];
var DARWIN_CREDENTIAL_DIRECTORIES = [
  ["Library", "Keychains"],
  ["Library", "Application Support", "Google", "Chrome"],
  ["Library", "Application Support", "Chromium"],
  ["Library", "Application Support", "Firefox"],
  ["Library", "Application Support", "Microsoft Edge"],
  ["Library", "Application Support", "BraveSoftware", "Brave-Browser"]
];
var LINUX_CREDENTIAL_DIRECTORIES = [
  [".mozilla", "firefox"],
  [".config", "google-chrome"],
  [".config", "chromium"],
  [".config", "microsoft-edge"],
  [".config", "BraveSoftware", "Brave-Browser"]
];
function pathKey(path) {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}
function directoryNameKey(name) {
  return process.platform === "win32" || process.platform === "darwin" ? name.toLowerCase() : name;
}
var PORTABLE_CREDENTIAL_DIRECTORY_KEYS = new Set(PORTABLE_CREDENTIAL_DIRECTORY_NAMES.map(directoryNameKey));
function isGitInternal(path) {
  return resolve(path).split(sep).some((part) => part.toLowerCase() === ".git");
}
function isPathInsideRoot(path, root) {
  const local = relative(pathKey(root), pathKey(path));
  return local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local);
}
function isPathInsideCwd(path, cwd) {
  return isPathInsideRoot(resolve(cwd, path), resolve(cwd));
}
function defaultSensitiveRoots() {
  const home = homedir();
  const roots = [...HOME_CREDENTIAL_DIRECTORIES, ...HOME_CREDENTIAL_FILES].map((parts) => join(home, ...parts));
  if (process.platform !== "win32")
    roots.push(...POSIX_SPECIAL_ROOTS);
  if (process.platform === "darwin") {
    roots.push(...DARWIN_CREDENTIAL_DIRECTORIES.map((parts) => join(home, ...parts)));
  } else if (process.platform === "linux") {
    roots.push(...LINUX_CREDENTIAL_DIRECTORIES.map((parts) => join(home, ...parts)));
  } else if (process.platform === "win32") {
    const { APPDATA, LOCALAPPDATA, ProgramData, SystemRoot } = process.env;
    if (APPDATA) {
      roots.push(join(APPDATA, "Microsoft", "Credentials"), join(APPDATA, "Microsoft", "Protect"), join(APPDATA, "gnupg"));
    }
    if (LOCALAPPDATA) {
      roots.push(join(LOCALAPPDATA, "Google", "Chrome", "User Data"), join(LOCALAPPDATA, "Chromium", "User Data"), join(LOCALAPPDATA, "Microsoft", "Edge", "User Data"), join(LOCALAPPDATA, "BraveSoftware", "Brave-Browser", "User Data"));
    }
    if (ProgramData)
      roots.push(join(ProgramData, "Microsoft", "Crypto", "RSA", "MachineKeys"));
    if (SystemRoot)
      roots.push(join(SystemRoot, "System32", "config"));
  }
  return [...new Set(roots.map((root) => resolve(root)))];
}
var DEFAULT_SENSITIVE_ROOTS = defaultSensitiveRoots();
function escapeGlobPath(path) {
  const normalized = path.split(sep).join("/");
  return normalized.replaceAll(/([\\*?[\]{}])/g, "\\$1");
}
function blockedPathMessage(path) {
  return `Path is inside a protected credential or system area: ${path}`;
}

class SearchPathPolicy {
  cwd;
  protectedRoots;
  constructor(cwd, protectedRoots = DEFAULT_SENSITIVE_ROOTS) {
    this.cwd = resolve(cwd);
    this.protectedRoots = [...new Set(protectedRoots.map((root) => resolve(root)))];
  }
  isProtected(path) {
    const absolute = resolve(this.cwd, path);
    if (isPathInsideRoot(absolute, this.cwd))
      return false;
    return absolute.split(sep).some((part) => PORTABLE_CREDENTIAL_DIRECTORY_KEYS.has(directoryNameKey(part))) || this.protectedRoots.some((root) => isPathInsideRoot(absolute, root));
  }
  assertPath(path) {
    const absolute = resolve(this.cwd, path);
    if (isGitInternal(absolute))
      throw new SiftlightError("Git internals are excluded from search");
    if (this.isProtected(absolute))
      throw new SiftlightError(blockedPathMessage(absolute));
  }
  async resolveExistingPath(path) {
    const absolute = resolve(this.cwd, path);
    this.assertPath(absolute);
    let canonical;
    try {
      canonical = await realpath(absolute);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return;
      throw error;
    }
    this.assertPath(canonical);
    return canonical;
  }
  async assertExistingPath(path) {
    await this.resolveExistingPath(path);
  }
  async resolveSearchTarget(path) {
    const absolute = resolve(this.cwd, path);
    const [canonical, canonicalCwd] = await Promise.all([
      this.resolveExistingPath(absolute),
      realpath(this.cwd)
    ]);
    return canonical && (!isPathInsideRoot(absolute, this.cwd) || !isPathInsideRoot(canonical, canonicalCwd)) ? canonical : absolute;
  }
  ripgrepGlobArguments(searchPath) {
    const absolute = resolve(this.cwd, searchPath);
    if (isPathInsideRoot(absolute, this.cwd))
      return [];
    const args = [];
    const globFlag = process.platform === "win32" || process.platform === "darwin" ? "--iglob" : "--glob";
    for (const name of PORTABLE_CREDENTIAL_DIRECTORY_NAMES) {
      args.push(globFlag, `!${name}`, globFlag, `!${name}/**`, globFlag, `!**/${name}`, globFlag, `!**/${name}/**`);
    }
    for (const root of this.protectedRoots) {
      if (!isPathInsideRoot(root, absolute))
        continue;
      const local = relative(absolute, root);
      if (!local || local === ".")
        continue;
      const escaped = escapeGlobPath(local);
      args.push(globFlag, `!${escaped}`, globFlag, `!${escaped}/**`);
    }
    return args;
  }
}

// src/owned-process.ts
import { spawn } from "node:child_process";
var MAX_STDERR_BYTES = 16 * 1024;
var TERMINATE_GRACE_MS = 250;
var TERMINATE_DEADLINE_MS = 2000;
async function runOwnedProcess(options, consumeOutput) {
  const { executable, args, cwd, signal, env, input } = options;
  if (signal?.aborted)
    throw abortError();
  const spawnOptions = { cwd, windowsHide: true, ...env ? { env } : {} };
  const child = input === undefined && !options.interactive ? spawn(executable, args, { ...spawnOptions, stdio: ["ignore", "pipe", "pipe"] }) : spawn(executable, args, { ...spawnOptions, stdio: ["pipe", "pipe", "pipe"] });
  if (options.interactive)
    child.stdin?.on("error", () => {
      return;
    });
  const inputComplete = new Promise((resolveInput, rejectInput) => {
    if (input === undefined || child.stdin === null) {
      resolveInput();
      return;
    }
    child.stdin.on("error", rejectInput);
    child.stdin.end(input, (error) => {
      if (error)
        rejectInput(error);
      else
        resolveInput();
    });
  });
  let closed = false;
  let spawnError;
  let forceTimer;
  let deadlineTimer;
  let rejectClose;
  const closePromise = new Promise((resolveClose, reject) => {
    rejectClose = reject;
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code) => {
      closed = true;
      resolveClose(code);
    });
  });
  const stderrChunks = [];
  let stderrBytes = 0;
  child.stderr.on("data", (chunk) => {
    const retained = chunk.subarray(0, MAX_STDERR_BYTES - stderrBytes);
    if (retained.length === 0)
      return;
    stderrChunks.push(retained);
    stderrBytes += retained.length;
  });
  const terminate = () => {
    if (closed || forceTimer)
      return;
    child.stdin?.destroy();
    child.kill("SIGTERM");
    forceTimer = setTimeout(() => {
      if (!closed)
        child.kill("SIGKILL");
    }, TERMINATE_GRACE_MS);
    deadlineTimer = setTimeout(() => {
      rejectClose?.(new SiftlightError("Owned search process did not close after termination"));
    }, TERMINATE_DEADLINE_MS);
  };
  signal?.addEventListener("abort", terminate, { once: true });
  if (signal?.aborted)
    terminate();
  try {
    const [code] = await Promise.all([
      closePromise,
      consumeOutput(child.stdout, child.stdin),
      inputComplete
    ]);
    if (signal?.aborted)
      throw abortError();
    if (spawnError)
      throw spawnError;
    return { code, stderr: Buffer.concat(stderrChunks).toString("utf8") };
  } catch (error) {
    terminate();
    await closePromise;
    if (signal?.aborted)
      throw abortError();
    if (spawnError)
      throw spawnError;
    throw error;
  } finally {
    if (forceTimer)
      clearTimeout(forceTimer);
    if (deadlineTimer)
      clearTimeout(deadlineTimer);
    signal?.removeEventListener("abort", terminate);
  }
}

// src/ripgrep-executable.ts
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { isAbsolute as isAbsolute2 } from "node:path";
var OVERRIDE_ENV = "SIFTLIGHT_RG_PATH";
var BUNDLED_REPAIR = `Reinstall siftlight with optional dependencies enabled for this platform, or set ${OVERRIDE_ENV} to an absolute ripgrep executable path.`;
async function resolveRipgrepExecutable() {
  const configured = process.env[OVERRIDE_ENV];
  if (configured !== undefined && !isAbsolute2(configured))
    throw new SiftlightError(`${OVERRIDE_ENV} must be an absolute executable file path; shell functions, aliases and relative paths are not supported.`);
  let executable;
  if (configured !== undefined) {
    executable = configured;
  } else {
    try {
      executable = (await import("@vscode/ripgrep")).rgPath;
    } catch (cause) {
      throw new SiftlightError(`Bundled ripgrep is unavailable. ${BUNDLED_REPAIR}`, { cause });
    }
  }
  try {
    if (!(await stat(executable)).isFile())
      throw new Error("Expected an executable file");
    await access(executable, constants.X_OK);
  } catch (cause) {
    const repair = configured === undefined ? BUNDLED_REPAIR : `Fix ${OVERRIDE_ENV} or unset it to use bundled ripgrep. No fallback was attempted.`;
    throw new SiftlightError(`ripgrep executable is unavailable: ${executable}. ${repair}`, {
      cause
    });
  }
  return executable;
}

// src/ripgrep-diagnostics.ts
import { resolve as resolve2 } from "node:path";
var UNREADABLE_SUFFIX = /:\s+Permission denied(?:\s+\(os error 13\))?\s*$/iu;
var UNREADABLE_CODE = /\(os error 13\)\s*$/iu;
var INVALID_REGEX_DIAGNOSTIC = /(?:^|\n)\s*(?:rg:\s*)?regex parse error:/iu;
var MISSING_PATH_DIAGNOSTIC = /(?:IO error for operation on .+?:\s*)?No such file or directory \(os error 2\)\s*$/iu;
var MAX_RIPGREP_DIAGNOSTIC_CHARACTERS = 4096;
function diagnosticLines(stderr) {
  return stderr.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
}
function boundedRipgrepDiagnostic(value, redact = false) {
  const safe = redact ? redactDiagnosticText(value) : value;
  const normalized = safe.toWellFormed();
  return normalized.length <= MAX_RIPGREP_DIAGNOSTIC_CHARACTERS ? normalized : `${normalized.slice(0, MAX_RIPGREP_DIAGNOSTIC_CHARACTERS - 1)}…`;
}
function classifyRipgrepInputFailure(stderr) {
  if (INVALID_REGEX_DIAGNOSTIC.test(stderr))
    return "E_REGEX_INVALID";
  if (diagnosticLines(stderr).some((line) => MISSING_PATH_DIAGNOSTIC.test(line)))
    return "E_SEARCH_PATH_NOT_FOUND";
  return;
}
function missingPathFromDiagnostics(stderr) {
  for (const line of diagnosticLines(stderr)) {
    const operation = /IO error for operation on (.+?):\s*No such file or directory \(os error 2\)\s*$/iu.exec(line);
    if (operation?.[1])
      return operation[1].trim();
    const direct = /^rg:\s*(.+?):\s*No such file or directory \(os error 2\)\s*$/iu.exec(line);
    if (direct?.[1])
      return direct[1].trim();
  }
  return;
}
function createRipgrepInputError(stderr, redact = false) {
  const code = classifyRipgrepInputFailure(stderr);
  if (code === "E_REGEX_INVALID") {
    return new RipgrepInputError(code, "ripgrep regex parse error: pattern is not a valid regular expression.", "Correct pattern or set literal=true for source text; no automatic literal conversion was attempted.");
  }
  if (code === "E_SEARCH_PATH_NOT_FOUND") {
    const path = missingPathFromDiagnostics(stderr);
    const location = path ? ` (${JSON.stringify(boundedRipgrepDiagnostic(path, redact))})` : "";
    return new RipgrepInputError(code, `A searched path${location} does not exist or became unavailable.`, "Provide an existing exact path, or use mode=files with query to discover an unknown filename; no retry or scope expansion was attempted.");
  }
  return;
}
function unreadablePath(line, suffix) {
  const match = suffix.exec(line);
  if (!match || match.index === undefined)
    return;
  const prefix = line.slice(0, match.index).trim();
  const separator = prefix.indexOf(": ");
  const path = (separator < 0 ? prefix : prefix.slice(separator + 2)).trim();
  return path.replace(/^['"]|['"]$/gu, "") || undefined;
}
function classifyRipgrepDiagnostics(stderr) {
  const unreadable = [];
  const other = [];
  for (const line of diagnosticLines(stderr)) {
    const path = unreadablePath(line, UNREADABLE_SUFFIX);
    if (path !== undefined || UNREADABLE_CODE.test(line)) {
      unreadable.push({ message: line, ...path ? { path } : {} });
    } else {
      other.push(line);
    }
  }
  return { unreadable, other };
}
function hasRequestedRootUnreadable(diagnostics, cwd, searchPath) {
  const expected = resolve2(cwd, searchPath);
  return diagnostics.some((diagnostic) => diagnostic.path === undefined || resolve2(cwd, diagnostic.path) === expected);
}
function describeUnreadableDiagnostics(diagnostics) {
  const messages = [...new Set(diagnostics.map((diagnostic) => diagnostic.message))];
  return `Ripgrep skipped ${String(messages.length)} unreadable path(s); search coverage is partial: ${messages.join("; ")}`;
}

// src/source.ts
import { readFile, realpath as realpath2, stat as stat2 } from "node:fs/promises";
var SOURCE_RANGE_METADATA_RESERVE_BYTES = 1024;
var MAX_SOURCE_RANGE_BYTES = MAX_RESULT_BYTES - SOURCE_RANGE_METADATA_RESERVE_BYTES;
async function getSourceRevision(path, onError) {
  try {
    const metadata = await stat2(path);
    return sourceRevisionFromStats(metadata);
  } catch (error) {
    onError?.(error);
    return;
  }
}
function sourceRevisionFromStats(metadata) {
  return {
    size: metadata.size,
    mtimeMs: metadata.mtimeMs,
    ctimeMs: metadata.ctimeMs,
    ...metadata.ino !== 0 ? { inode: metadata.ino } : {},
    ...metadata.dev !== 0 ? { device: metadata.dev } : {}
  };
}
function sameSourceRevision(left, right) {
  return left.size === right.size && left.mtimeMs === right.mtimeMs && (left.ctimeMs === undefined || right.ctimeMs === undefined || left.ctimeMs === right.ctimeMs) && left.inode === right.inode && left.device === right.device;
}
function matchesModificationTime(revision, modifiedAfterMs, modifiedBeforeMs) {
  return (modifiedAfterMs === undefined || revision.mtimeMs >= modifiedAfterMs) && (modifiedBeforeMs === undefined || revision.mtimeMs < modifiedBeforeMs);
}
function modificationTimeDisplay(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? `${String(value)} Unix ms` : JSON.stringify(date.toISOString());
}
function modificationTimeBoundsText(modifiedAfterMs, modifiedBeforeMs) {
  if (modifiedAfterMs === undefined && modifiedBeforeMs === undefined)
    return "";
  const bounds = [
    modifiedAfterMs === undefined ? undefined : `mtime >= ${modificationTimeDisplay(modifiedAfterMs)}`,
    modifiedBeforeMs === undefined ? undefined : `mtime < ${modificationTimeDisplay(modifiedBeforeMs)}`
  ].filter((value) => value !== undefined);
  return ` [Modification-time filter: ${bounds.join("; ")}.]`;
}
async function assertExistingPathInsideCwd(path, cwd) {
  if (!isPathInsideCwd(path, cwd)) {
    throw new SiftlightError("Path must stay within the working directory");
  }
  const canonical = await new SearchPathPolicy(cwd).resolveExistingPath(path);
  if (canonical && !isPathInsideCwd(canonical, await realpath2(cwd))) {
    throw new SiftlightError("Path must stay within the working directory");
  }
}
class SourceBudgetTooSmallError extends SiftlightError {
  constructor() {
    super("Source target line exceeds the available byte budget");
    this.name = "SourceBudgetTooSmallError";
  }
}

class SourceLineUnavailableError extends SiftlightError {
  constructor(line) {
    super(`Source line ${String(line)} is beyond the end of the file`);
    this.name = "SourceLineUnavailableError";
  }
}
function sourceLineBytes(line) {
  return Buffer.byteLength(`${String(line.line)}: ${line.text}`, "utf8");
}
function selectSourceWindow(rendered, targetIndex, maxBytes) {
  let startIndex = targetIndex;
  let endIndex = targetIndex;
  const target = rendered[targetIndex];
  if (!target)
    throw new Error("Source target line is unavailable");
  let bytes = sourceLineBytes(target);
  if (bytes > maxBytes)
    throw new SourceBudgetTooSmallError;
  let canGrowBefore = true;
  let canGrowAfter = true;
  while (canGrowBefore || canGrowAfter) {
    let grew = false;
    if (canGrowBefore) {
      const candidate = rendered[startIndex - 1];
      if (candidate === undefined) {
        canGrowBefore = false;
      } else if (bytes + 1 + sourceLineBytes(candidate) <= maxBytes) {
        startIndex -= 1;
        bytes += 1 + sourceLineBytes(candidate);
        grew = true;
      } else {
        canGrowBefore = false;
      }
    }
    if (canGrowAfter) {
      const candidate = rendered[endIndex + 1];
      if (candidate === undefined) {
        canGrowAfter = false;
      } else if (bytes + 1 + sourceLineBytes(candidate) <= maxBytes) {
        endIndex += 1;
        bytes += 1 + sourceLineBytes(candidate);
        grew = true;
      } else {
        canGrowAfter = false;
      }
    }
    if (!grew && !canGrowBefore && !canGrowAfter)
      break;
  }
  return { lines: rendered.slice(startIndex, endIndex + 1), startIndex, endIndex };
}
function sourceRangeFromBytes(content, startLine, endLine, targetLine = startLine, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_SOURCE_RANGE_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_SOURCE_RANGE_BYTES)
    throw new Error("Source range byte budget must be within the result body limit");
  const lines = [];
  let lineStart = 0;
  for (let newline = content.indexOf(10);newline >= 0; newline = content.indexOf(10, lineStart)) {
    lines.push(content.subarray(lineStart, newline));
    lineStart = newline + 1;
  }
  lines.push(content.subarray(lineStart));
  const boundedStart = Math.max(1, startLine);
  if (boundedStart > lines.length) {
    throw new SourceLineUnavailableError(targetLine);
  }
  const boundedEnd = Math.min(lines.length, Math.max(boundedStart, endLine));
  if (targetLine < 1 || targetLine > lines.length) {
    throw new SourceLineUnavailableError(targetLine);
  }
  const boundedTarget = Math.min(boundedEnd, Math.max(boundedStart, targetLine));
  const rendered = Array.from({ length: boundedEnd - boundedStart + 1 }, (_, index) => {
    const lineNumber = boundedStart + index;
    const raw = lines[lineNumber - 1];
    if (!raw)
      throw new Error("Source line is unavailable");
    const focus = lineNumber === targetLine ? options.focus : undefined;
    const start = focus?.range.start.character ?? 0;
    const end = focus?.range.end.character ?? start;
    const bytes = focus?.range.encoding === "utf-8" ? raw : undefined;
    const excerpt = excerptText(raw.toString("utf8").replaceAll("\r", ""), bytes ? bytes.subarray(0, start).toString("utf8").replaceAll("\r", "").length : start, bytes ? bytes.subarray(0, end).toString("utf8").replaceAll("\r", "").length : end);
    return { line: lineNumber, text: excerpt.text, truncated: excerpt.truncated };
  });
  const selected = selectSourceWindow(rendered, boundedTarget - boundedStart, maxBytes);
  const omittedBefore = selected.startIndex;
  const omittedAfter = rendered.length - selected.endIndex - 1;
  return {
    text: selected.lines.map((line) => `${String(line.line)}: ${line.text}`).join(`
`),
    lines: selected.lines,
    startLine: boundedStart + selected.startIndex,
    endLine: boundedStart + selected.endIndex,
    truncated: omittedBefore > 0 || omittedAfter > 0,
    omittedBefore,
    omittedAfter,
    truncatedLines: selected.lines.filter((line) => line.truncated).map((line) => line.line)
  };
}

// src/scan-revisions.ts
import { resolve as resolve3 } from "node:path";
async function captureRevision(path, revisions, onRevisionError) {
  let failed = false;
  let failure;
  const revision = await getSourceRevision(path, (error) => {
    failed = true;
    failure = error;
  });
  if (revision)
    revisions.set(path, revision);
  if (failed)
    onRevisionError?.(path, failure);
}
async function captureBatch(paths, revisions, signal, onRevisionError) {
  if (signal?.aborted)
    throw abortError();
  await Promise.all(paths.map((path) => captureRevision(path, revisions, onRevisionError)));
  if (signal?.aborted)
    throw abortError();
}
async function captureCandidateRevisions(executable, args, cwd, maxFiles, signal, redact = false) {
  const revisions = new Map;
  let candidateCount = 0;
  let enumerationTruncated = false;
  let invalidPathCount = 0;
  const metadataFailures = [];
  const recordMetadataFailure = (path, error) => {
    const reason = error instanceof Error ? error.message : String(error);
    metadataFailures.push({
      path,
      message: `Source metadata unavailable: ${boundedRipgrepDiagnostic(reason, redact)}`
    });
  };
  const result = await runOwnedProcess({ executable, args, cwd, ...signal ? { signal } : {} }, async (stdout) => {
    let pending = Buffer.alloc(0);
    let batch = [];
    for await (const chunk of stdout) {
      if (signal?.aborted)
        throw abortError();
      pending = Buffer.concat([pending, chunk]);
      let delimiter = pending.indexOf(0);
      while (delimiter >= 0) {
        const rawPath = pending.subarray(0, delimiter);
        if (rawPath.length > MAX_PROTOCOL_LINE_BYTES) {
          throw new SiftlightError("ripgrep file path exceeds the protocol byte limit");
        }
        const path = rawPath.toString("utf8");
        if (Buffer.from(path, "utf8").equals(rawPath)) {
          if (candidateCount < maxFiles) {
            candidateCount += 1;
            batch.push(resolve3(cwd, path));
          } else {
            enumerationTruncated = true;
          }
          if (batch.length === MAX_SOURCE_REVISION_CONCURRENCY) {
            await captureBatch(batch, revisions, signal, recordMetadataFailure);
            batch = [];
          }
        } else {
          invalidPathCount += 1;
        }
        pending = pending.subarray(delimiter + 1);
        delimiter = pending.indexOf(0);
      }
      if (pending.length > MAX_PROTOCOL_LINE_BYTES) {
        throw new SiftlightError("ripgrep file path exceeds the protocol byte limit");
      }
    }
    if (pending.length > 0) {
      throw new SiftlightError("ripgrep file enumeration ended without a NUL delimiter");
    }
    await captureBatch(batch, revisions, signal, recordMetadataFailure);
  });
  const diagnostics = classifyRipgrepDiagnostics(result.stderr);
  const inputError = createRipgrepInputError(result.stderr, redact);
  const unreadable = [...diagnostics.unreadable, ...metadataFailures];
  if (inputError)
    throw inputError;
  if (result.code === 2 && diagnostics.other.length === 0 && unreadable.length > 0)
    return { revisions, unreadable, enumerationTruncated, invalidPathCount };
  if (result.code !== 0 && result.code !== 1) {
    throw new SiftlightError(result.stderr.trim() || `ripgrep file enumeration exited with status ${String(result.code)}`);
  }
  return { revisions, unreadable, enumerationTruncated, invalidPathCount };
}
async function retainStableSourceRevisions(paths, before, signal) {
  const after = new Map;
  const candidates = [...paths].filter((path) => before.has(path));
  for (let offset = 0;offset < candidates.length; offset += MAX_SOURCE_REVISION_CONCURRENCY) {
    await captureBatch(candidates.slice(offset, offset + MAX_SOURCE_REVISION_CONCURRENCY), after, signal);
  }
  return new Map([...after].filter(([path, revision]) => {
    const initial = before.get(path);
    return initial !== undefined && sameSourceRevision(initial, revision);
  }));
}

// src/rg.ts
function isRecord2(value) {
  return typeof value === "object" && value !== null;
}
function isRgText(value) {
  return isRecord2(value) && (typeof value.text === "string" || typeof value.bytes === "string");
}
function isRgSubmatch(value) {
  if (!isRecord2(value))
    return false;
  return isRgText(value.match) && typeof value.start === "number" && Number.isSafeInteger(value.start) && typeof value.end === "number" && Number.isSafeInteger(value.end) && value.start >= 0 && value.end >= value.start;
}
function isRgMatchEvent(value) {
  if (!isRecord2(value) || value.type !== "match" || !isRecord2(value.data))
    return false;
  const submatches = value.data.submatches;
  return isRgText(value.data.path) && isRgText(value.data.lines) && typeof value.data.line_number === "number" && Number.isSafeInteger(value.data.line_number) && value.data.line_number > 0 && (submatches === undefined || Array.isArray(submatches) && submatches.every(isRgSubmatch));
}
function decodeRgText(value, field) {
  if (typeof value.text === "string") {
    return { text: value.text, bytes: Buffer.from(value.text, "utf8"), encoding: "utf-16" };
  }
  if (typeof value.bytes === "string") {
    const bytes = Buffer.from(value.bytes, "base64");
    return { text: bytes.toString("utf8"), bytes, encoding: "utf-8" };
  }
  throw new SiftlightError(`ripgrep JSON event omitted ${field}`);
}
function displayPath(rawPath, cwd) {
  const absolutePath = isAbsolute3(rawPath) ? rawPath : resolve4(cwd, rawPath);
  const localPath = relative2(cwd, absolutePath).replaceAll("\\", "/");
  const isInsideCwd = localPath !== ".." && !localPath.startsWith("../") && !isAbsolute3(localPath);
  return {
    absolutePath,
    displayPath: isInsideCwd && localPath.length > 0 ? localPath : absolutePath
  };
}
function jsonObjectEnd(value, start, end) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start;index < end; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped)
        escaped = false;
      else if (character === "\\")
        escaped = true;
      else if (character === '"')
        inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character !== "}")
      continue;
    depth -= 1;
    if (depth === 0)
      return index + 1;
  }
  return;
}
function jsonObjectStringProperty(value, property, pathStart) {
  let offset = pathStart + '"path"'.length;
  while (/\s/.test(value[offset] ?? ""))
    offset += 1;
  if (value[offset] !== ":")
    return;
  offset += 1;
  while (/\s/.test(value[offset] ?? ""))
    offset += 1;
  if (value[offset] !== "{")
    return;
  const objectEnd = jsonObjectEnd(value, offset, value.length);
  if (objectEnd === undefined)
    return;
  try {
    const parsed = JSON.parse(value.slice(offset, objectEnd));
    if (!isRecord2(parsed))
      return;
    const candidate = parsed[property];
    return typeof candidate === "string" ? candidate : undefined;
  } catch {
    return;
  }
}
function oversizedMatchPath(prefix, cwd) {
  const pathStart = prefix.indexOf('"path"');
  if (pathStart < 0)
    return;
  const text = jsonObjectStringProperty(prefix, "text", pathStart);
  if (text !== undefined)
    return displayPath(text, cwd);
  const encoded = jsonObjectStringProperty(prefix, "bytes", pathStart);
  if (encoded === undefined)
    return;
  const bytes = Buffer.from(encoded, "base64");
  const decoded = bytes.toString("utf8");
  return Buffer.from(decoded, "utf8").equals(bytes) ? displayPath(decoded, cwd) : undefined;
}
async function assertSearchTargetIdentity(policy, path, expectedCanonical) {
  const currentCanonical = await policy.resolveExistingPath(path);
  if (currentCanonical !== expectedCanonical) {
    throw new SiftlightError("Search target changed during validation; retry the search");
  }
}
async function assertRetainedPathsAllowed(policy, paths, signal) {
  for (let offset = 0;offset < paths.length; offset += MAX_SOURCE_REVISION_CONCURRENCY) {
    if (signal?.aborted)
      throw abortError();
    const batch = paths.slice(offset, offset + MAX_SOURCE_REVISION_CONCURRENCY);
    await Promise.all(batch.map((path) => policy.resolveExistingPath(path)));
  }
}
function utf16Length(value) {
  return value.length;
}
function byteOffsetToCharacter(bytes, byteOffset, encoding) {
  if (byteOffset < 0 || byteOffset > bytes.length) {
    throw new SiftlightError("ripgrep emitted a submatch outside its matching line");
  }
  if (encoding === "utf-8")
    return byteOffset;
  const prefix = bytes.subarray(0, byteOffset).toString("utf8").replaceAll("\r", "");
  return utf16Length(prefix);
}
function createOccurrences(lineNumber, decodedLine, submatches) {
  const range = {
    start: { line: lineNumber - 1, character: 0 },
    end: { line: lineNumber - 1, character: 0 },
    encoding: decodedLine.encoding
  };
  const occurrences = [];
  for (const submatch of submatches) {
    if (submatch.end > decodedLine.bytes.length) {
      throw new SiftlightError("ripgrep emitted a submatch outside its matching line");
    }
    occurrences.push({
      byteStart: submatch.start,
      byteEnd: submatch.end,
      range: {
        start: {
          ...range.start,
          character: byteOffsetToCharacter(decodedLine.bytes, submatch.start, range.encoding)
        },
        end: {
          ...range.end,
          character: byteOffsetToCharacter(decodedLine.bytes, submatch.end, range.encoding)
        },
        encoding: range.encoding
      }
    });
  }
  return occurrences;
}
function fileScopeArguments(request) {
  const args = [];
  if (request.ignorePolicy === "include")
    args.push("--no-ignore", "--no-ignore-parent");
  if (request.hidden)
    args.push("--hidden");
  for (const glob of request.glob)
    args.push("--glob", glob);
  for (const excluded of request.exclude) {
    const normalized = excluded.startsWith("!") ? excluded : `!${excluded}`;
    args.push("--glob", normalized);
  }
  args.push("--iglob", "!.git", "--iglob", "!.git/**", "--iglob", "!**/.git/**");
  return args;
}
function buildRipgrepArguments(request, cwd, validatedSearchPath) {
  const searchPath = validatedSearchPath ?? resolve4(cwd, request.path ?? ".");
  const policy = new SearchPathPolicy(cwd);
  policy.assertPath(searchPath);
  const args = [
    "--no-config",
    "--json",
    "--line-number",
    "--color=never",
    "--no-heading",
    ...request.binaryAsText ? ["--text"] : [],
    ...fileScopeArguments(request),
    ...policy.ripgrepGlobArguments(searchPath)
  ];
  args.push(...patternArguments(request));
  const searchTarget = isPathInsideCwd(searchPath, cwd) ? relative2(resolve4(cwd), searchPath) || "." : searchPath;
  args.push("--", request.pattern, searchTarget);
  return args;
}
function patternArguments(request) {
  return [
    ...request.wholeWord ? ["--word-regexp"] : [],
    ...request.literal ? ["--fixed-strings"] : [],
    request.ignoreCase === true ? "--ignore-case" : request.ignoreCase === false ? "--case-sensitive" : "--smart-case"
  ];
}
function createRipgrepRunner(options = {}) {
  const maxStoredMatches = options.maxStoredMatches ?? MAX_STORED_MATCHES;
  const maxEventBytes = options.maxEventBytes ?? MAX_PROTOCOL_LINE_BYTES;
  const maxSourceRevisionFiles = options.maxSourceRevisionFiles ?? MAX_SOURCE_REVISION_FILES;
  return async function runRipgrep(request, cwd, signal) {
    if (signal?.aborted)
      throw abortError();
    const executable = options.executable ?? await resolveRipgrepExecutable();
    const searchPath = resolve4(cwd, request.path ?? ".");
    const policy = new SearchPathPolicy(cwd);
    const validatedSearchPath = await policy.resolveSearchTarget(searchPath);
    const expectedSearchTarget = await policy.resolveExistingPath(validatedSearchPath);
    const searchTarget = isPathInsideCwd(validatedSearchPath, cwd) ? relative2(resolve4(cwd), validatedSearchPath) || "." : validatedSearchPath;
    const args = buildRipgrepArguments(request, cwd, validatedSearchPath);
    if (signal?.aborted)
      throw abortError();
    const matches = [];
    const retention = new SearchRetention(options.maxStoredBytes, options.maxStoredOccurrences);
    const fileCounts = new Map;
    const lossyPaths = new Set;
    const oversizedPathReasons = new Set;
    let totalMatches = 0;
    let truncatedLines = 0;
    let modificationTimeFilterIncomplete = false;
    let candidateRevisions = new Map;
    const onLine = (line) => {
      if (line.length === 0)
        return;
      let event;
      try {
        event = JSON.parse(line);
      } catch (error) {
        throw new SiftlightError("Failed to parse ripgrep JSON output", { cause: error });
      }
      if (!isRecord2(event))
        return;
      if (event.type !== "match")
        return;
      if (!isRgMatchEvent(event)) {
        throw new SiftlightError("ripgrep emitted an invalid match event");
      }
      const rawPath = decodeRgText(event.data.path, "path");
      const rawContent = decodeRgText(event.data.lines, "line content");
      const normalizedContent = rawContent.text.replaceAll("\r", "").replace(/\n$/, "");
      const path = displayPath(rawPath.text, cwd);
      if (request.modifiedAfterMs !== undefined || request.modifiedBeforeMs !== undefined) {
        const revision = candidateRevisions.get(path.absolutePath);
        if (!revision) {
          modificationTimeFilterIncomplete = true;
          retention.noteLimit(`Modification time could not be verified for ${path.displayPath}; matching evidence was retained`);
        } else if (!matchesModificationTime(revision, request.modifiedAfterMs, request.modifiedBeforeMs)) {
          return;
        }
      }
      if (rawPath.encoding === "utf-8")
        lossyPaths.add(path.absolutePath);
      const submatches = event.data.submatches ?? [];
      if (submatches.some((match) => match.end > rawContent.bytes.length))
        throw new SiftlightError("ripgrep emitted a submatch outside its matching line");
      const primaryOccurrence = submatches[0];
      let focusStart = 0;
      let focusEnd = 0;
      if (primaryOccurrence) {
        focusStart = byteOffsetToCharacter(rawContent.bytes, primaryOccurrence.start, "utf-16");
        focusEnd = byteOffsetToCharacter(rawContent.bytes, primaryOccurrence.end, "utf-16");
      }
      const excerpt = excerptText(normalizedContent, focusStart, focusEnd);
      const { text: lineContent, truncated: lineTruncated } = excerpt;
      totalMatches += 1;
      if (!fileCounts.has(path.displayPath)) {
        if (retention.file(path.displayPath, path.absolutePath))
          fileCounts.set(path.displayPath, 0);
      }
      if (fileCounts.has(path.displayPath))
        fileCounts.set(path.displayPath, (fileCounts.get(path.displayPath) ?? 0) + 1);
      if (lineTruncated)
        truncatedLines += 1;
      if (matches.length >= maxStoredMatches)
        retention.noteLimit(`Matching-line retention reached the ${String(maxStoredMatches)} limit`);
      if (matches.length < maxStoredMatches && retention.canRetainOccurrences(submatches.length)) {
        const match = {
          ...path,
          lineNumber: event.data.line_number,
          lineContent,
          lineTruncated,
          occurrences: createOccurrences(event.data.line_number, rawContent, submatches)
        };
        if (retention.retain(match))
          matches.push(match);
      }
    };
    try {
      const before = await captureCandidateRevisions(executable, [
        "--no-config",
        "--files",
        "--null",
        ...fileScopeArguments(request),
        ...policy.ripgrepGlobArguments(validatedSearchPath),
        "--",
        searchTarget
      ], cwd, maxSourceRevisionFiles, signal, request.redact);
      let ignoredFileCount = 0;
      let ignoredFileSamples = [];
      let filesystemCoverage = "complete";
      const filesystemCoverageReasons = new Set;
      if (before.enumerationTruncated) {
        filesystemCoverage = "partial";
        filesystemCoverageReasons.add(`Filesystem coverage comparison reached the ${String(maxSourceRevisionFiles)} file metadata limit`);
      }
      if (before.invalidPathCount > 0) {
        filesystemCoverage = "partial";
        filesystemCoverageReasons.add(`${String(before.invalidPathCount)} candidate path(s) were not valid UTF-8`);
      }
      if (request.ignorePolicy !== "include") {
        const allCandidates = await captureCandidateRevisions(executable, [
          "--no-config",
          "--files",
          "--null",
          ...fileScopeArguments({ ...request, ignorePolicy: "include" }),
          ...policy.ripgrepGlobArguments(validatedSearchPath),
          "--",
          searchTarget
        ], cwd, maxSourceRevisionFiles, signal, request.redact);
        const ignored = [...allCandidates.revisions.keys()].filter((path) => !before.revisions.has(path));
        ignoredFileCount = ignored.length;
        ignoredFileSamples = ignored.slice(0, 20).map((path) => displayPath(path, cwd).displayPath);
        if (ignoredFileCount > 0)
          filesystemCoverage = "policy-filtered";
        if (allCandidates.unreadable.length > 0) {
          filesystemCoverage = "partial";
          retention.noteLimit(describeUnreadableDiagnostics(allCandidates.unreadable));
        }
        if (allCandidates.enumerationTruncated) {
          filesystemCoverage = "partial";
          filesystemCoverageReasons.add(`Include-ignored coverage comparison reached the ${String(maxSourceRevisionFiles)} file metadata limit`);
        }
        if (allCandidates.invalidPathCount > 0) {
          filesystemCoverage = "partial";
          filesystemCoverageReasons.add(`${String(allCandidates.invalidPathCount)} include-ignored candidate path(s) were not valid UTF-8`);
        }
      }
      if (hasRequestedRootUnreadable(before.unreadable, cwd, validatedSearchPath))
        throw new SiftlightError(describeUnreadableDiagnostics(before.unreadable));
      candidateRevisions = before.revisions;
      if (before.unreadable.length > 0)
        retention.noteLimit(describeUnreadableDiagnostics(before.unreadable));
      if (before.unreadable.length > 0)
        filesystemCoverage = "partial";
      if (before.unreadable.length > 0)
        filesystemCoverageReasons.add(describeUnreadableDiagnostics(before.unreadable));
      await assertSearchTargetIdentity(policy, validatedSearchPath, expectedSearchTarget);
      const { code, stderr } = await runOwnedProcess({ executable, args, cwd, ...signal ? { signal } : {} }, (stdout) => consumeCappedLines(stdout, onLine, {
        maxLineBytes: maxEventBytes,
        onLineTooLong: ({ prefix, observedBytes }) => {
          const source = oversizedMatchPath(prefix, cwd);
          const label = source?.displayPath ?? "unknown source";
          if (oversizedPathReasons.has(label))
            return;
          oversizedPathReasons.add(label);
          retention.noteLimit(`Skipped oversized ripgrep match line in ${JSON.stringify(label)}; observed at least ${String(observedBytes)} bytes, limit is ${String(maxEventBytes)} bytes`);
        }
      }));
      const diagnostics = classifyRipgrepDiagnostics(stderr);
      const inputError = createRipgrepInputError(stderr, request.redact);
      if (inputError)
        throw inputError;
      if (hasRequestedRootUnreadable(diagnostics.unreadable, cwd, validatedSearchPath))
        throw new SiftlightError(describeUnreadableDiagnostics(diagnostics.unreadable));
      if (diagnostics.unreadable.length > 0)
        retention.noteLimit(describeUnreadableDiagnostics(diagnostics.unreadable));
      if (diagnostics.unreadable.length > 0)
        filesystemCoverage = "partial";
      if (diagnostics.unreadable.length > 0)
        filesystemCoverageReasons.add(describeUnreadableDiagnostics(diagnostics.unreadable));
      if (code === 2 && (diagnostics.other.length > 0 || diagnostics.unreadable.length === 0)) {
        throw new SiftlightError(stderr.trim() || `ripgrep exited with status ${String(code)}`);
      }
      await assertSearchTargetIdentity(policy, validatedSearchPath, expectedSearchTarget);
      const retainedPaths = new Set(matches.map((match) => match.absolutePath).filter((path) => !lossyPaths.has(path)));
      await assertRetainedPathsAllowed(policy, [...retainedPaths], signal);
      const sourceRevisions = await retainStableSourceRevisions(retainedPaths, before.revisions, signal);
      if (signal?.aborted)
        throw abortError();
      return {
        request,
        matches,
        totalMatches,
        fileCounts,
        sourceRevisions,
        snapshotComplete: matches.length === totalMatches && !modificationTimeFilterIncomplete && retention.details.reasons.length === 0,
        filesystemCoverage,
        filesystemCoverageReasons: [...filesystemCoverageReasons],
        ignoredFileCount,
        ignoredFileSamples,
        searchedFileCount: before.revisions.size,
        truncatedLines,
        retention: retention.details
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        throw abortError();
      if (error instanceof RipgrepInputError)
        throw error;
      const cause = error instanceof Error ? error : new Error(String(error));
      const executableMissing = "code" in cause && cause.code === "ENOENT";
      const message = executableMissing ? `ripgrep executable not found: ${boundedRipgrepDiagnostic(executable, request.redact)}` : boundedRipgrepDiagnostic(cause.message, request.redact);
      throw new SiftlightError(message, { cause });
    }
  };
}

// src/structure.ts
import { isAbsolute as isAbsolute4, resolve as resolve5 } from "node:path";
var CTAGS_CAPABILITY_ARGUMENTS = [
  "--output-format=json",
  "--fields=+ne",
  "--extras=-p"
];

class CtagsCommandError extends Error {
  constructor(message) {
    super(message);
    this.name = "CtagsCommandError";
  }
}

class CtagsProtocolError extends SiftlightError {
}
function hasCode(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}
function isRecord3(value) {
  return typeof value === "object" && value !== null;
}
function asOptionalString(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function asOptionalPositiveInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
function parseCtagsTag(value) {
  if (!isRecord3(value))
    return;
  const hasTagType = Object.entries(value).some(([key, entry]) => key === "_type" && entry === "tag");
  if (!hasTagType)
    return;
  const path = asOptionalString(value.path);
  const name = asOptionalString(value.name);
  const language = asOptionalString(value.language);
  const kind = asOptionalString(value.kind);
  const scope = asOptionalString(value.scope);
  const line = asOptionalPositiveInteger(value.line);
  const end = asOptionalPositiveInteger(value.end);
  if (!path || !name)
    return;
  return {
    path,
    name,
    ...language ? { language } : {},
    ...kind ? { kind } : {},
    ...scope ? { scope } : {},
    ...line ? { line } : {},
    ...end ? { end } : {}
  };
}
async function runCtagsCommand(executable, absolutePath, cwd, signal) {
  const tags = [];
  const { code, stderr } = await runOwnedProcess({
    executable,
    args: [...CTAGS_CAPABILITY_ARGUMENTS, absolutePath],
    cwd,
    ...signal ? { signal } : {}
  }, async (stdout) => {
    try {
      await consumeCappedLines(stdout, (line) => {
        if (line.length === 0)
          return;
        let value;
        try {
          value = JSON.parse(line);
        } catch (error) {
          throw new CtagsProtocolError("Failed to parse Universal Ctags JSON output", {
            cause: error
          });
        }
        const tag = parseCtagsTag(value);
        if (tag)
          tags.push(tag);
      }, { maxLineBytes: MAX_PROTOCOL_LINE_BYTES });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Input line exceeds the ")) {
        throw new CtagsProtocolError(error.message, { cause: error });
      }
      throw error;
    }
  });
  if (code !== 0) {
    throw new CtagsCommandError(stderr.trim() || `ctags exited with status ${String(code)}`);
  }
  return tags;
}
function pathMatches(tagPath, absolutePath, cwd) {
  return resolve5(isAbsolute4(tagPath) ? tagPath : resolve5(cwd, tagPath)) === resolve5(absolutePath);
}
function symbolFromTag(tag) {
  if (tag.line === undefined || tag.end === undefined || tag.end < tag.line)
    return;
  return {
    name: tag.name,
    kind: tag.kind ?? "unknown",
    scope: tag.scope ? [tag.scope] : [],
    range: { startLine: tag.line, endLine: tag.end }
  };
}
function chooseEnclosingSymbol(tags, absolutePath, cwd, line) {
  const candidates = tags.filter((tag) => pathMatches(tag.path, absolutePath, cwd)).map(symbolFromTag).filter((symbol) => symbol !== undefined).filter((symbol) => symbol.range.startLine <= line && line <= symbol.range.endLine).toSorted((left, right) => {
    const leftSize = left.range.endLine - left.range.startLine;
    const rightSize = right.range.endLine - right.range.startLine;
    if (leftSize !== rightSize)
      return leftSize - rightSize;
    return right.scope.length - left.scope.length;
  });
  return candidates[0];
}
function createCtagsStructureProvider(options = {}) {
  const executable = options.executable ?? "ctags";
  const maxFileBytes = options.maxFileBytes ?? MAX_SOURCE_FILE_BYTES;
  const runCtags = options.runCtags ?? ((absolutePath, cwd, signal) => runCtagsCommand(executable, absolutePath, cwd, signal));
  return {
    async inspect(request, signal) {
      if (signal?.aborted)
        throw abortError();
      const currentRevision = await getSourceRevision(request.absolutePath);
      if (!currentRevision) {
        return { details: { status: "source-unavailable", provider: "universal-ctags" } };
      }
      if (request.expectedRevision && !sameSourceRevision(request.expectedRevision, currentRevision)) {
        return {
          details: { status: "source-changed", provider: "universal-ctags" },
          currentRevision
        };
      }
      if (currentRevision.size > maxFileBytes) {
        return {
          details: { status: "file-too-large", provider: "universal-ctags" },
          currentRevision
        };
      }
      let tags;
      try {
        tags = await runCtags(request.absolutePath, request.cwd, signal);
      } catch (error) {
        if (signal?.aborted || error instanceof Error && error.name === "AbortError") {
          throw abortError();
        }
        if (hasCode(error, "ENOENT") || error instanceof CtagsCommandError) {
          return {
            details: {
              status: "provider-unavailable",
              provider: "universal-ctags",
              reason: "Universal Ctags is unavailable; install universal-ctags or use JS/TS/Python outline support"
            },
            currentRevision
          };
        }
        if (error instanceof CtagsProtocolError) {
          return {
            details: {
              status: "parse-error",
              provider: "universal-ctags",
              reason: "Universal Ctags returned invalid JSON output; check the installed provider"
            },
            currentRevision
          };
        }
        throw error;
      }
      const symbol = chooseEnclosingSymbol(tags, request.absolutePath, request.cwd, request.line);
      const language = tags.find((tag) => tag.language)?.language;
      return {
        details: {
          status: symbol ? "available" : "no-symbol",
          provider: "universal-ctags",
          ...language ? { language } : {},
          ...symbol ? { symbol, range: symbol.range } : {}
        },
        currentRevision
      };
    }
  };
}

// src/service.ts
import { createHash as createHash4 } from "node:crypto";

// src/analysis-evidence.ts
function sourceEvidence(document, range) {
  const line = document.lineAt(range.start);
  const lineRange = document.lineRange(line);
  const lineStart = document.toCharacterOffset(lineRange.start);
  const lineEnd = document.toCharacterOffset(lineRange.end);
  const focus = document.toCharacterOffset(range.start);
  const focusEnd = document.toCharacterOffset(range.end);
  let start = Math.max(lineStart, focus - Math.floor(Math.max(0, MAX_LINE_CHARACTERS - (focusEnd - focus)) / 2));
  let end = Math.min(lineEnd, start + MAX_LINE_CHARACTERS);
  const startCode = document.text.charCodeAt(start);
  const endCode = document.text.charCodeAt(end);
  if (startCode >= 56320 && startCode <= 57343)
    start--;
  if (endCode >= 56320 && endCode <= 57343)
    end--;
  const excerptRange = { start: document.toByteOffset(start), end: document.toByteOffset(end) };
  return {
    range: { ...range },
    line,
    excerpt: `${start > lineStart ? "…" : ""}${document.text.slice(start, end)}${end < lineEnd ? "…" : ""}`,
    excerptRange,
    excerptTruncated: start > lineStart || end < lineEnd
  };
}
function rangeEvidence(document, range) {
  const start = document.toCharacterOffset(range.start);
  const rangeEnd = document.toCharacterOffset(range.end);
  let end = Math.min(rangeEnd, start + MAX_LINE_CHARACTERS);
  const code = document.text.charCodeAt(end);
  if (code >= 56320 && code <= 57343)
    end -= 1;
  return {
    excerpt: `${document.text.slice(start, end)}${end < rangeEnd ? "…" : ""}`,
    excerptRange: { start: range.start, end: document.toByteOffset(end) },
    excerptTruncated: end < rangeEnd
  };
}

// src/owned-task-queue.ts
class OwnedTaskQueue {
  #tail = Promise.resolve();
  async acquire(signal) {
    if (signal?.aborted)
      throw abortError();
    const previous = this.#tail;
    const completed = Promise.withResolvers();
    this.#tail = previous.then(() => completed.promise);
    const cancelled = Promise.withResolvers();
    const abort = () => cancelled.reject(abortError());
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted)
      abort();
    try {
      await Promise.race([previous, cancelled.promise]);
      if (signal?.aborted)
        throw abortError();
      let released = false;
      return () => {
        if (released)
          return;
        released = true;
        completed.resolve();
      };
    } finally {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted)
        completed.resolve();
    }
  }
  async run(operation, signal) {
    const release = await this.acquire(signal);
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

// src/concept-search.ts
import { dirname as dirname3 } from "node:path";
import { join as join4 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { StringDecoder } from "node:string_decoder";
import { mkdir as mkdir2 } from "node:fs/promises";
import { rm as rm2 } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// src/concept-model.ts
import { homedir as homedir2 } from "node:os";
import { join as join2, resolve as resolve6 } from "node:path";
var CONCEPT_MODEL = "Xenova/multilingual-e5-small";
var CONCEPT_REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";
var MAX_CONCEPT_CHARS = 1000;
var CONCEPT_PASSAGE_OVERLAP_CHARS = 160;
var CONCEPT_CACHE_VERSION = 1;
var CONCEPT_CACHE_MAX_BYTES = 512 * 1024 * 1024;
var CONCEPT_TIMEOUT_MS = 10 * 60000;
var MIN_CONCEPT_TIMEOUT_MS = 1000;
var MAX_CONCEPT_TIMEOUT_MS = 60 * 60000;
var CONCEPT_TIMEOUT_ENV = "SIFTLIGHT_CONCEPT_TIMEOUT_MS";
var MAX_CONCEPT_WORKER_INPUT_BYTES = 64 * 1024 * 1024;
var MAX_CONCEPT_WORKER_OUTPUT_BYTES = 4 * 1024 * 1024;
function conceptCacheDirectory() {
  return resolve6(process.env.SIFTLIGHT_MODEL_DIR ?? join2(homedir2(), ".cache", "siftlight", "models"), "concept-cache", `${CONCEPT_REVISION}-v${String(CONCEPT_CACHE_VERSION)}`);
}
function resolveConceptTimeoutMs(environment = process.env) {
  const raw = environment[CONCEPT_TIMEOUT_ENV];
  if (raw === undefined || raw === "")
    return CONCEPT_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < MIN_CONCEPT_TIMEOUT_MS || value > MAX_CONCEPT_TIMEOUT_MS) {
    throw new SiftlightError(`${CONCEPT_TIMEOUT_ENV} must be an integer from ${String(MIN_CONCEPT_TIMEOUT_MS)} through ${String(MAX_CONCEPT_TIMEOUT_MS)}`);
  }
  return value;
}

// src/script-runtime.ts
function scriptRuntimeEnvironment() {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  if (process.versions.bun)
    env.BUN_BE_BUN = "1";
  return env;
}

// src/record-value.ts
function isRecordValue(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// src/request.ts
function list(value) {
  if (value === undefined)
    return [];
  return (Array.isArray(value) ? value : [value]).filter((item) => item.length > 0);
}
function validateText(value, field, maxCharacters, singleLine = false) {
  if (!value.isWellFormed() || /\0/.test(value) || singleLine && /[\r\n]/.test(value))
    throw new SiftlightError(`${field} must be well-formed text without NUL or line breaks`);
  if (value.length > maxCharacters)
    throw new SiftlightError(`${field} is too long (maximum ${String(maxCharacters)} characters); use a shorter value or a narrower working directory`);
}
function validateSearchPath(value, field = "path") {
  validateText(value.replace(/^@/, ""), field, MAX_PATH_CHARACTERS, true);
}
function validateRawSearchInput(input) {
  if (input.pattern !== undefined)
    validateText(input.pattern, "pattern", MAX_PATTERN_CHARACTERS);
  if (input.path !== undefined) {
    validateSearchPath(input.path);
  }
  for (const [field, value] of [
    ["glob", input.glob],
    ["exclude", input.exclude]
  ]) {
    const values = list(value);
    if (values.length > MAX_FILE_FILTER_ITEMS)
      throw new SiftlightError(`${field} accepts at most ${String(MAX_FILE_FILTER_ITEMS)} entries`);
    values.forEach((item) => validateText(item, field, MAX_PATH_CHARACTERS, true));
  }
  for (const [field, value] of [
    ["modifiedAfter", input.modifiedAfter],
    ["modifiedBefore", input.modifiedBefore]
  ]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
      throw new SiftlightError(`${field} must be a non-negative Unix timestamp in milliseconds`);
  }
  if (input.modifiedAfter !== undefined && input.modifiedBefore !== undefined && input.modifiedAfter > input.modifiedBefore)
    throw new SiftlightError("modifiedAfter must be earlier than or equal to modifiedBefore");
}
function boundedInteger(value, fallback, minimum, maximum, field) {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new SiftlightError(`${field} must be an integer from ${String(minimum)} through ${String(maximum)}`);
  }
  return candidate;
}
function normalizeRequest(input) {
  validateRawSearchInput(input);
  if (input.scope !== undefined && input.scope !== "strict" && input.scope !== "expand")
    throw new SiftlightError("scope must be strict or expand");
  if (input.ignorePolicy !== undefined && input.ignorePolicy !== "respect" && input.ignorePolicy !== "include")
    throw new SiftlightError("ignorePolicy must be respect or include");
  const pattern = input.pattern;
  if (pattern === undefined) {
    throw new SiftlightError("pattern is required when cursor is not provided");
  }
  const path = input.path?.replace(/^@/, "");
  return {
    pattern,
    ...path ? { path } : {},
    glob: list(input.glob),
    exclude: list(input.exclude),
    literal: input.literal ?? false,
    ...input.ignoreCase === undefined ? {} : { ignoreCase: input.ignoreCase },
    hidden: input.hidden ?? true,
    ignorePolicy: input.ignorePolicy ?? "respect",
    context: boundedInteger(input.context, 0, 0, MAX_CONTEXT_LINES, "context"),
    pageSize: boundedInteger(input.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE, "limit"),
    redact: input.redact ?? false,
    ...input.modifiedAfter !== undefined ? { modifiedAfterMs: input.modifiedAfter } : {},
    ...input.modifiedBefore !== undefined ? { modifiedBeforeMs: input.modifiedBefore } : {},
    ...input.scope !== undefined ? { scope: input.scope } : {},
    ...input.wholeWord !== undefined ? { wholeWord: input.wholeWord } : {}
  };
}

// src/concept-source-generation.ts
import { createHash as createHash3 } from "node:crypto";

// src/source-access.ts
import { extname as extname2, resolve as resolve11 } from "node:path";

// src/historical-paths.ts
import { lstat, mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { constants as constants2 } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join as join3, parse, relative as relative4, resolve as resolve8 } from "node:path";

// src/workspace-files.ts
import { relative as relative3, resolve as resolve7, sep as sep2 } from "node:path";
class EnumerationLimit extends Error {
}
function workspaceRelativePath(cwd, path, policy = new SearchPathPolicy(cwd)) {
  const absolute = resolve7(cwd, path);
  policy.assertPath(absolute);
  const local = relative3(resolve7(cwd), absolute);
  if (local.split(sep2).some((part) => part.toLowerCase() === ".git"))
    throw new SiftlightError("Git internals are excluded from source candidates");
  return isPathInsideCwd(absolute, cwd) ? local.split(sep2).join("/") : absolute.replaceAll("\\", "/");
}
async function listWorkspaceFiles(cwd, signal, options = {}) {
  const absolutePath = resolve7(cwd, options.path ?? ".");
  const policy = new SearchPathPolicy(cwd);
  const searchPath = await policy.resolveSearchTarget(absolutePath);
  const maxFiles = options.maxFiles ?? MAX_SOURCE_REVISION_FILES;
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1)
    throw new SiftlightError("Candidate file limit must be a positive integer");
  const paths = new Set;
  const reasons = new Set;
  let coverageIssue;
  let bytes = 0;
  try {
    const result = await runOwnedProcess({
      executable: await resolveRipgrepExecutable(),
      args: [
        "--no-config",
        "--files",
        "--null",
        ...options.ignore === false ? ["--no-ignore"] : [],
        ...options.ignoreParents === false ? ["--no-ignore-parent"] : [],
        ...fileScopeArguments({
          hidden: options.hidden ?? true,
          glob: options.glob ?? [],
          exclude: options.exclude ?? []
        }),
        ...policy.ripgrepGlobArguments(searchPath),
        "--",
        searchPath
      ],
      cwd,
      ...signal ? { signal } : {}
    }, async (stdout) => {
      let pending = Buffer.alloc(0);
      for await (const chunk of stdout) {
        if (signal?.aborted)
          throw abortError();
        bytes += chunk.byteLength;
        if (bytes > MAX_PROTOCOL_LINE_BYTES)
          throw new EnumerationLimit(`Candidate enumeration exceeds the ${String(MAX_PROTOCOL_LINE_BYTES)} byte protocol limit`);
        pending = Buffer.concat([pending, chunk]);
        let delimiter = pending.indexOf(0);
        while (delimiter >= 0) {
          const raw = pending.subarray(0, delimiter);
          const decoded = raw.toString("utf8");
          if (!Buffer.from(decoded).equals(raw)) {
            reasons.add("Some candidate paths are not valid UTF-8");
            coverageIssue ??= "invalid-path";
          } else {
            const local = workspaceRelativePath(cwd, decoded, policy);
            if (!paths.has(local) && paths.size >= maxFiles)
              throw new EnumerationLimit(`Candidate enumeration reached the ${String(maxFiles)} file limit`);
            paths.add(local);
          }
          pending = pending.subarray(delimiter + 1);
          delimiter = pending.indexOf(0);
        }
      }
      if (pending.length > 0)
        throw new SiftlightError("Candidate enumeration ended without a NUL delimiter");
    });
    const diagnostics = classifyRipgrepDiagnostics(result.stderr);
    if (hasRequestedRootUnreadable(diagnostics.unreadable, cwd, searchPath))
      throw new SiftlightError(describeUnreadableDiagnostics(diagnostics.unreadable));
    if (diagnostics.unreadable.length > 0) {
      reasons.add(describeUnreadableDiagnostics(diagnostics.unreadable));
      coverageIssue = "unreadable";
    }
    if (result.code === 2 && (diagnostics.other.length > 0 || diagnostics.unreadable.length === 0))
      throw new SiftlightError(result.stderr.trim() || `Candidate enumeration exited ${String(result.code)}`);
  } catch (error) {
    if (!(error instanceof EnumerationLimit))
      throw error;
    reasons.add(error.message);
    coverageIssue = "enumeration-limit";
  }
  return {
    paths: [...paths].toSorted(),
    partial: reasons.size > 0,
    reasons: [...reasons],
    ...coverageIssue ? { coverageIssue } : {}
  };
}

// src/historical-paths.ts
function partitionPaths(paths) {
  const groups = [];
  for (const path of paths) {
    const group = groups.find((candidate) => !candidate.some((other) => path.startsWith(`${other}/`) || other.startsWith(`${path}/`)));
    if (group)
      group.push(path);
    else
      groups.push([path]);
  }
  return groups;
}
function relevantDirectories(cwd, paths) {
  const directories = new Set;
  for (const path of [cwd, ...paths.map((sourcePath) => dirname(resolve8(cwd, sourcePath)))]) {
    let current = path;
    for (;; ) {
      directories.add(current);
      const parent = dirname(current);
      if (current === parent)
        break;
      current = parent;
    }
  }
  return [...directories];
}
async function filterHistoricalPaths(cwd, paths, request, signal) {
  if (!isPathInsideCwd(resolve8(cwd, request.path ?? "."), cwd)) {
    throw new SiftlightError("Historical path filtering requires a path inside cwd");
  }
  const selectedPath = workspaceRelativePath(cwd, request.path ?? ".");
  const candidates = paths.filter((path) => selectedPath.length === 0 || path === selectedPath || path.startsWith(`${selectedPath}/`));
  const reasons = new Set;
  if (candidates.length > MAX_STRUCTURE_FILES)
    reasons.add(`Historical path filtering reached the ${String(MAX_STRUCTURE_FILES)} candidate limit`);
  const bounded = candidates.slice(0, MAX_STRUCTURE_FILES);
  if (bounded.length === 0)
    return { paths: [], partial: reasons.size > 0, reasons: [...reasons], ignoreBytesRead: 0 };
  const root = await mkdtemp(join3(tmpdir(), "siftlight-paths-"));
  const absoluteCwd = resolve8(cwd);
  const volumeRoot = parse(absoluteCwd).root;
  const ignoreFiles = [];
  let ignoreBytesRead = 0;
  try {
    for (const directory of relevantDirectories(absoluteCwd, bounded)) {
      if (isPathInsideCwd(directory, absoluteCwd))
        await assertExistingPathInsideCwd(directory, absoluteCwd);
      for (const name of [".ignore", ".rgignore"]) {
        if (signal?.aborted)
          throw abortError();
        const path = join3(directory, name);
        let discovered = false;
        try {
          const before = await lstat(path);
          discovered = true;
          if (!before.isFile())
            throw new SiftlightError("Current ignore rules are not regular files; historical path filtering is unavailable");
          if (before.size > MAX_SOURCE_FILE_BYTES || ignoreBytesRead + before.size > MAX_STRUCTURE_BYTES)
            throw new SiftlightError("Current ignore rules exceed the source read budget");
          const handle = await open(path, constants2.O_RDONLY | (constants2.O_NOFOLLOW ?? 0));
          let bytes;
          try {
            if (!sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(await handle.stat())))
              throw new SiftlightError("Current ignore rules changed before reading");
            const buffer = Buffer.alloc(before.size + 1);
            let used = 0;
            while (used < buffer.length) {
              if (signal?.aborted)
                throw abortError();
              const chunk = await handle.read(buffer, used, Math.min(64 * 1024, buffer.length - used), null);
              if (chunk.bytesRead === 0)
                break;
              used += chunk.bytesRead;
            }
            bytes = buffer.subarray(0, used);
            const after = await lstat(path);
            if (used !== before.size || !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(after)) || !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(await handle.stat())))
              throw new SiftlightError("Current ignore rules changed during historical path filtering");
          } finally {
            await handle.close();
          }
          ignoreBytesRead += bytes.length;
          ignoreFiles.push({ local: relative4(volumeRoot, path), bytes });
        } catch (error) {
          if (!(error instanceof Error && ("code" in error) && error.code === "ENOENT"))
            throw error;
          if (discovered)
            throw new SiftlightError("Current ignore rules disappeared during historical path filtering");
        }
      }
    }
    if (ignoreFiles.length === 0 && request.glob.length === 0 && request.exclude.length === 0 && request.hidden) {
      return { paths: bounded, partial: reasons.size > 0, reasons: [...reasons], ignoreBytesRead };
    }
    const visible = new Set;
    for (const [index, group] of partitionPaths(bounded).entries()) {
      const tree = join3(root, String(index));
      const target = join3(tree, relative4(volumeRoot, absoluteCwd));
      await mkdir(target, { recursive: true });
      for (const path of group) {
        const safe = workspaceRelativePath(absoluteCwd, path);
        const placeholder = resolve8(target, safe);
        await mkdir(dirname(placeholder), { recursive: true });
        await writeFile(placeholder, "");
      }
      for (const ignore of ignoreFiles) {
        const destination = join3(tree, ignore.local);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, ignore.bytes);
      }
      const privacy = await listWorkspaceFiles(tree, signal, { ignoreParents: false });
      const prefix = `${relative4(tree, target).split("\\").join("/")}/`;
      const allowed = new Set(privacy.paths.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length)));
      const scoped = await listWorkspaceFiles(target, signal, {
        glob: request.glob,
        exclude: request.exclude,
        hidden: request.hidden,
        ignore: false
      });
      for (const reason of [...privacy.reasons, ...scoped.reasons])
        reasons.add(reason);
      const included = new Set(group);
      for (const path of scoped.paths)
        if (included.has(path) && allowed.has(path))
          visible.add(path);
    }
    return {
      paths: [...visible].toSorted(),
      partial: reasons.size > 0,
      reasons: [...reasons],
      ignoreBytesRead
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// src/git-diff.ts
import { setImmediate } from "node:timers/promises";
class GitDiffLimitError extends SiftlightError {
}

class GitDiffBudget {
  work = 0;
  maxWork;
  signal;
  constructor(maxWork = MAX_GIT_DIFF_WORK, signal) {
    this.maxWork = maxWork;
    this.signal = signal;
  }
  tick() {
    if (this.signal?.aborted)
      throw abortError();
    this.work += 1;
    if (this.work > this.maxWork) {
      throw new GitDiffLimitError(`Git line comparison exceeds the ${String(this.maxWork)} step limit`);
    }
    return this.work % 4096 === 0;
  }
}
async function sourceLines(content, budget) {
  const lines = [];
  for (let start = 0;start < content.length; ) {
    if (budget.tick())
      await setImmediate();
    const newline = content.indexOf(10, start);
    const end = newline === -1 ? content.length : newline + 1;
    lines.push(content.toString("latin1", start, end));
    start = end;
  }
  return lines;
}
function sourceLineCount(content) {
  if (content.length === 0)
    return 0;
  let count = content[content.length - 1] === 10 ? 0 : 1;
  for (const byte of content)
    if (byte === 10)
      count += 1;
  return count;
}
function diagonal(vector, distance, k) {
  return vector[k + distance + 1] ?? -1;
}
function prependLine(ranges, line) {
  const last = ranges.at(-1);
  if (last && last.startLine === line + 1)
    last.startLine = line;
  else
    ranges.push({ startLine: line, endLine: line });
}
function reconstruct(trace, oldLength, newLength, prefix) {
  let x = oldLength;
  let y = newLength;
  const oldRanges = [];
  const newRanges = [];
  for (let distance = trace.length - 1;distance > 0; distance -= 1) {
    const previous = trace[distance - 1];
    if (!previous)
      throw new Error("Missing Git line comparison trace");
    const k = x - y;
    const previousK = k === -distance || k !== distance && diagonal(previous, distance - 1, k - 1) < diagonal(previous, distance - 1, k + 1) ? k + 1 : k - 1;
    const previousX = diagonal(previous, distance - 1, previousK);
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      x -= 1;
      y -= 1;
    }
    if (x === previousX) {
      prependLine(newRanges, prefix + y);
      y -= 1;
    } else {
      prependLine(oldRanges, prefix + x);
      x -= 1;
    }
  }
  return { oldRanges: oldRanges.toReversed(), newRanges: newRanges.toReversed() };
}
async function changedLineRanges(oldContent, newContent, budget = new GitDiffBudget) {
  if (budget.signal?.aborted)
    throw abortError();
  if (oldContent.equals(newContent))
    return { oldRanges: [], newRanges: [] };
  const oldLines = await sourceLines(oldContent, budget);
  const newLines = await sourceLines(newContent, budget);
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    if (budget.tick())
      await setImmediate();
    prefix += 1;
  }
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > prefix && newEnd > prefix && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    if (budget.tick())
      await setImmediate();
    oldEnd -= 1;
    newEnd -= 1;
  }
  const n = oldEnd - prefix;
  const m = newEnd - prefix;
  if (n === 0 || m === 0) {
    return {
      oldRanges: n === 0 ? [] : [{ startLine: prefix + 1, endLine: oldEnd }],
      newRanges: m === 0 ? [] : [{ startLine: prefix + 1, endLine: newEnd }]
    };
  }
  const trace = [];
  for (let distance = 0;distance <= n + m; distance += 1) {
    const current = new Int32Array(2 * distance + 3).fill(-1);
    const previous = trace[distance - 1];
    for (let k = -distance;k <= distance; k += 2) {
      if (budget.tick())
        await setImmediate();
      let x = 0;
      if (previous) {
        x = k === -distance || k !== distance && diagonal(previous, distance - 1, k - 1) < diagonal(previous, distance - 1, k + 1) ? diagonal(previous, distance - 1, k + 1) : diagonal(previous, distance - 1, k - 1) + 1;
      }
      let y = x - k;
      while (x < n && y < m && oldLines[prefix + x] === newLines[prefix + y]) {
        if (budget.tick())
          await setImmediate();
        x += 1;
        y += 1;
      }
      current[k + distance + 1] = x;
      if (x >= n && y >= m) {
        trace.push(current);
        return reconstruct(trace, n, m, prefix);
      }
    }
    trace.push(current);
  }
  throw new Error("Git line comparison did not produce an edit script");
}
async function sourceSimilarity(oldContent, newContent, budget) {
  if (oldContent.equals(newContent))
    return 100;
  const maximum = Math.max(oldContent.length, newContent.length);
  if (maximum === 0 || Math.min(oldContent.length, newContent.length) / maximum < 0.5)
    return 0;
  const counts = new Map;
  for (const line of await sourceLines(oldContent, budget))
    counts.set(line, (counts.get(line) ?? 0) + 1);
  let commonBytes = 0;
  for (const line of await sourceLines(newContent, budget)) {
    const remaining = counts.get(line) ?? 0;
    if (remaining === 0)
      continue;
    counts.set(line, remaining - 1);
    commonBytes += line.length;
  }
  return Math.min(99, Math.floor(100 * commonBytes / maximum));
}

// src/git-repository.ts
import { createHash } from "node:crypto";
import { constants as constants3 } from "node:fs";
import { lstat as lstat2, open as open2 } from "node:fs/promises";
import { isAbsolute as isAbsolute5, relative as relative5, resolve as resolve9, sep as sep3 } from "node:path";

// src/git-process.ts
var GIT_READ_ARGUMENTS = [
  "--no-pager",
  "--no-replace-objects",
  "--no-optional-locks",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.untrackedCache=false",
  "-c",
  "submodule.recurse=false"
];
var MINIMUM_NO_LAZY_FETCH_VERSION = [2, 45, 0];
var gitCapabilities = new Map;
function gitReadEnvironment() {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_"))),
    GIT_CONFIG_COUNT: "0",
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_PROTOCOL_FROM_USER: "0",
    LC_ALL: "C"
  };
}
function supportsNoLazyFetch(version) {
  const match = /^git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(version.trim());
  if (!match)
    throw new SiftlightError("Git returned an unrecognized version string");
  const actual = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
  for (let index = 0;index < MINIMUM_NO_LAZY_FETCH_VERSION.length; index += 1) {
    const difference = (actual[index] ?? 0) - (MINIMUM_NO_LAZY_FETCH_VERSION[index] ?? 0);
    if (difference !== 0)
      return difference > 0;
  }
  return true;
}
async function gitReadArguments(executable, cwd, signal) {
  const capabilityKey = `${executable}\x00${process.env.PATH ?? ""}`;
  let supports = gitCapabilities.get(capabilityKey);
  if (supports === undefined) {
    const versionChunks = [];
    const version = await runOwnedProcess({
      executable,
      args: ["--version"],
      cwd,
      env: gitReadEnvironment(),
      ...signal ? { signal } : {}
    }, async (stdout) => {
      for await (const chunk of stdout)
        versionChunks.push(Buffer.from(chunk));
    });
    if (version.code !== 0)
      throw new SiftlightError("Unable to determine the Git version");
    supports = supportsNoLazyFetch(Buffer.concat(versionChunks).toString("utf8"));
    gitCapabilities.set(capabilityKey, supports);
  }
  if (supports) {
    return [...GIT_READ_ARGUMENTS, "--no-lazy-fetch"];
  }
  const partial = await runOwnedProcess({
    executable,
    args: [
      ...GIT_READ_ARGUMENTS,
      "config",
      "--local",
      "--get-regexp",
      "^(extensions\\.partialClone|remote\\..*\\.promisor)$"
    ],
    cwd,
    env: gitReadEnvironment(),
    ...signal ? { signal } : {}
  }, async (stdout) => {
    for await (const chunk of stdout) {}
  });
  if (partial.code === 0) {
    throw new SiftlightError("Git 2.45 or newer is required for non-fetching reads from a partial/promisor clone");
  }
  if (partial.code !== 1) {
    throw new SiftlightError("Unable to verify whether this older Git repository is partial");
  }
  return [...GIT_READ_ARGUMENTS];
}
async function runGitRead(cwd, command, args, options = {}) {
  const chunks = [];
  if (options.input && options.input.byteLength > MAX_PROTOCOL_LINE_BYTES) {
    throw new SiftlightError(`Git input exceeds the ${String(MAX_PROTOCOL_LINE_BYTES)} byte protocol limit`);
  }
  let bytes = 0;
  const maxBytes = options.maxBytes ?? MAX_PROTOCOL_LINE_BYTES;
  const result = await runOwnedProcess({
    executable: options.executable ?? "git",
    args: [
      ...await gitReadArguments(options.executable ?? "git", cwd, options.signal),
      ...command === "ls-tree" ? ["--literal-pathspecs"] : [],
      command,
      ...args
    ],
    cwd,
    env: gitReadEnvironment(),
    ...options.signal ? { signal: options.signal } : {},
    ...options.input ? { input: options.input } : {}
  }, async (stdout) => {
    for await (const chunk of stdout) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        throw new SiftlightError(`Git ${command} output exceeds the ${String(maxBytes)} byte limit`);
      }
      chunks.push(Buffer.from(chunk));
    }
  });
  if (result.code === null || !(options.allowedCodes ?? [0]).includes(result.code)) {
    throw new SiftlightError(`Git ${command} failed: ${result.stderr.trim() || `exit ${String(result.code)}`}`);
  }
  return { output: Buffer.concat(chunks), code: result.code };
}
function decodeGitPath(bytes) {
  const value = bytes.toString("utf8");
  if (!Buffer.from(value, "utf8").equals(bytes)) {
    throw new SiftlightError("Git path is not valid UTF-8; path-based source access is unavailable");
  }
  return value;
}
function splitGitRecords(output) {
  if (output.length === 0)
    return [];
  if (output[output.length - 1] !== 0) {
    throw new SiftlightError("Git names protocol ended without a NUL delimiter");
  }
  const records = [];
  let offset = 0;
  for (let delimiter = output.indexOf(0);delimiter !== -1; delimiter = output.indexOf(0, offset)) {
    records.push(output.subarray(offset, delimiter));
    offset = delimiter + 1;
  }
  return records;
}

// src/git-repository.ts
async function verifyWorktreeRevision(cwd, path, expected) {
  try {
    const current = await lstat2(resolve9(cwd, path));
    await assertExistingPathInsideCwd(resolve9(cwd, path), cwd);
    if (current.isFile() && sameSourceRevision(sourceRevisionFromStats(current), expected))
      return;
  } catch (error) {
    if (!(error instanceof Error && ("code" in error) && error.code === "ENOENT"))
      throw error;
  }
  throw new SiftlightError("Working source changed during Git comparison; retry a new search");
}
function gitPath(cwd, path) {
  if (path.length === 0 || path.includes("\x00"))
    throw new SiftlightError("Git source path is invalid");
  const absolute = resolve9(cwd, path);
  const local = relative5(resolve9(cwd), absolute).split(sep3).join("/");
  if (!isPathInsideCwd(absolute, cwd) || local.split("/").some((part) => part.toLowerCase() === ".git")) {
    throw new SiftlightError("Git source path must stay within the working directory and outside .git");
  }
  return local;
}
async function resolveGitCommit(cwd, ref, signal) {
  if (ref.trim().length === 0 || ref.length > 1024 || ref.includes("\x00")) {
    throw new SiftlightError("Git commit reference must be a nonempty bounded string");
  }
  const { output } = await runGitRead(cwd, "rev-parse", ["--verify", "--end-of-options", `${ref}^{commit}`], {
    ...signal ? { signal } : {},
    maxBytes: 128
  });
  const commit = output.toString("ascii").trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit))
    throw new SiftlightError("Git returned an invalid commit identity");
  return commit;
}
async function resolveGitRepository(cwd, signal) {
  const { output } = await runGitRead(cwd, "rev-parse", ["--show-toplevel"], signal ? { signal, maxBytes: 4096 } : { maxBytes: 4096 });
  const root = decodeGitPath(output).replace(/\r?\n$/, "");
  if (!isAbsolute5(root))
    throw new SiftlightError("Git returned an invalid repository root");
  return resolve9(root);
}
async function findGitRepository(cwd, signal) {
  try {
    return await resolveGitRepository(cwd, signal);
  } catch (error) {
    if (error instanceof SiftlightError && error.message.includes("not a git repository")) {
      return;
    }
    throw error;
  }
}
async function readGitTree(cwd, commit, signal, path) {
  const { output } = await runGitRead(cwd, "ls-tree", ["-r", "-z", "-l", commit, ...path ? ["--", gitPath(cwd, path)] : []], signal ? { signal } : {});
  const entries = new Map;
  for (const record of splitGitRecords(output)) {
    if (entries.size === MAX_SOURCE_REVISION_FILES)
      return { entries, limited: true };
    const tab = record.indexOf(9);
    const header = record.subarray(0, tab).toString("ascii").trim().split(/\s+/);
    const [mode, type, blob, size] = header;
    if (tab < 0 || !mode || !blob || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(blob) || !["blob", "commit"].includes(type ?? "")) {
      throw new SiftlightError("Git tree returned an invalid raw object entry");
    }
    const local = gitPath(cwd, decodeGitPath(record.subarray(tab + 1)));
    const byteSize = type === "commit" ? 0 : Number(size);
    if (!Number.isSafeInteger(byteSize) || byteSize < 0)
      throw new SiftlightError("Git tree returned an invalid blob size");
    entries.set(local, { path: local, mode, blob, size: byteSize });
  }
  return { entries, limited: false };
}
async function worktreeNames(cwd, signal) {
  const { output } = await runGitRead(cwd, "ls-files", ["-z", "--cached", "--others", "--exclude-standard"], signal ? { signal } : {});
  const paths = new Set;
  for (const record of splitGitRecords(output)) {
    if (paths.size === MAX_SOURCE_REVISION_FILES)
      return { paths: [...paths], limited: true };
    paths.add(gitPath(cwd, decodeGitPath(record)));
  }
  return { paths: [...paths], limited: false };
}
async function visibleGitPaths(cwd, paths, signal, includePath) {
  const result = [];
  for (let start = 0;start < paths.length; start += 128) {
    const batch = paths.slice(start, start + 128);
    const { output } = await runGitRead(cwd, "check-ignore", ["--no-index", "-z", "--stdin"], {
      input: Buffer.from(`${batch.map((path) => `./${path}`).join("\x00")}\x00`),
      allowedCodes: [0, 1],
      ...signal ? { signal } : {}
    });
    const ignored = new Set(splitGitRecords(output).map((record) => gitPath(cwd, decodeGitPath(record))));
    for (const path of batch) {
      if (signal?.aborted)
        throw abortError();
      if (!ignored.has(path) && (!includePath || await includePath(path)))
        result.push(path);
    }
  }
  return result;
}
function limitedSource(path, mode, reason) {
  return { path, mode, sourceStatus: "unavailable", reason };
}
async function readGitBlob(cwd, commit, entry, budget, signal) {
  const { path, mode, blob, size } = entry;
  if (mode === "120000" || mode === "160000") {
    return {
      path,
      mode,
      sourceStatus: mode === "120000" ? "symlink" : "submodule",
      reason: "Symlink and submodule contents are not followed"
    };
  }
  if (size > MAX_SOURCE_FILE_BYTES)
    return limitedSource(path, mode, `Source exceeds the ${String(MAX_SOURCE_FILE_BYTES)} byte file limit`);
  if (budget.bytes + size > budget.maxBytes)
    return limitedSource(path, mode, `Source reads exceed the ${String(budget.maxBytes)} byte request limit`);
  const { output } = await runGitRead(cwd, "cat-file", ["blob", blob], {
    maxBytes: size,
    ...signal ? { signal } : {}
  });
  budget.bytes += output.length;
  if (output.length !== size)
    throw new SiftlightError("Git blob size does not match its immutable tree entry");
  const verifiedBlob = createHash(blob.length === 40 ? "sha1" : "sha256").update(`blob ${String(output.length)}\x00`).update(output).digest("hex");
  if (verifiedBlob !== blob)
    throw new SiftlightError("Git blob bytes do not match their immutable object identity");
  return {
    path,
    mode,
    sourceStatus: output.includes(0) ? "binary" : "available",
    ...output.includes(0) ? { reason: "Binary source contains NUL bytes" } : { content: output },
    origin: { kind: "git", commit, blob },
    contentHash: createHash("sha256").update(output).digest("hex")
  };
}
async function readWorktreeSource(cwd, path, budget, signal) {
  const absolute = resolve9(cwd, path);
  if (signal?.aborted)
    throw abortError();
  let discovered = false;
  try {
    const before = await lstat2(absolute);
    discovered = true;
    if (before.isSymbolicLink())
      return {
        path,
        mode: "120000",
        sourceStatus: "symlink",
        reason: "Symlink source is not followed"
      };
    if (!before.isFile())
      return {
        path,
        mode: "160000",
        sourceStatus: before.isDirectory() ? "submodule" : "unavailable",
        reason: "Non-regular source is not read"
      };
    const mode = (before.mode & 73) === 0 ? "100644" : "100755";
    if (before.size > MAX_SOURCE_FILE_BYTES)
      return limitedSource(path, mode, `Source exceeds the ${String(MAX_SOURCE_FILE_BYTES)} byte file limit`);
    if (budget.bytes + before.size > budget.maxBytes)
      return limitedSource(path, mode, `Source reads exceed the ${String(budget.maxBytes)} byte request limit`);
    await assertExistingPathInsideCwd(absolute, cwd);
    const handle = await open2(absolute, constants3.O_RDONLY | (constants3.O_NOFOLLOW ?? 0));
    try {
      if (!sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(await handle.stat())))
        throw new SiftlightError("Working source changed before reading");
      const buffer = Buffer.alloc(before.size + 1);
      let bytes = 0;
      while (bytes < buffer.length) {
        if (signal?.aborted)
          throw abortError();
        const { bytesRead } = await handle.read(buffer, bytes, Math.min(64 * 1024, buffer.length - bytes), null);
        if (bytesRead === 0)
          break;
        bytes += bytesRead;
      }
      budget.bytes += bytes;
      const after = await lstat2(absolute);
      await assertExistingPathInsideCwd(absolute, cwd);
      if (bytes !== before.size || !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(after)) || !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(await handle.stat()))) {
        throw new SiftlightError("Working source changed while reading; Git ranges and source cannot be mixed");
      }
      const content = buffer.subarray(0, bytes);
      return {
        path,
        mode,
        sourceStatus: content.includes(0) ? "binary" : "available",
        ...content.includes(0) ? { reason: "Binary source contains NUL bytes" } : { content },
        origin: {
          kind: "worktree",
          revision: sourceRevisionFromStats(after),
          contentHash: createHash("sha256").update(content).digest("hex")
        },
        contentHash: createHash("sha256").update(content).digest("hex")
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      if (error.code === "ENOENT") {
        if (discovered)
          throw new SiftlightError("Working source disappeared while reading; retry a new search");
        return { path, mode: "000000", sourceStatus: "absent" };
      }
      if (["EACCES", "EPERM", "ELOOP", "ENOTDIR"].includes(String(error.code)))
        return limitedSource(path, "000000", `Source unavailable: ${String(error.code)}`);
    }
    throw error;
  }
}

// src/git-source.ts
import { setImmediate as setImmediate2 } from "node:timers/promises";
function absent(path) {
  return { path, mode: "000000", sourceStatus: "absent" };
}
function sameContents(left, right) {
  return left.contentHash !== undefined && left.contentHash === right.contentHash;
}
function wholeFile(content) {
  const lines = sourceLineCount(content);
  return lines === 0 ? [] : [{ startLine: 1, endLine: lines }];
}
function validateLimit(value, label) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new SiftlightError(`${label} must be a positive integer`);
  return value;
}
function rememberBest(best, pair, score) {
  const previous = best.get(pair);
  if (!previous || score > previous.score)
    best.set(pair, { score, count: 1 });
  else if (score === previous.score)
    previous.count += 1;
}
async function pairRenames(pairs, budget, reasons) {
  const removed = pairs.filter((pair) => pair.new.sourceStatus === "absent" && pair.old.content);
  const added = pairs.filter((pair) => pair.old.sourceStatus === "absent" && pair.new.content);
  const scores = [];
  const bestOld = new Map;
  const bestNew = new Map;
  try {
    for (const oldPair of removed) {
      for (const newPair of added) {
        if (!oldPair.old.content || !newPair.new.content)
          continue;
        if (budget.tick())
          await setImmediate2();
        const score = sameContents(oldPair.old, newPair.new) ? 100 : await sourceSimilarity(oldPair.old.content, newPair.new.content, budget);
        if (score >= 50) {
          scores.push({ oldPair, newPair, score });
          rememberBest(bestOld, oldPair, score);
          rememberBest(bestNew, newPair, score);
        }
      }
    }
  } catch (error) {
    if (!(error instanceof GitDiffLimitError))
      throw error;
    reasons.add(error.message);
    reasons.add("Rename comparison is incomplete; unpaired additions/deletions remain explicit");
    return pairs;
  }
  const consumed = new Set;
  const renamed = [];
  for (const entry of scores) {
    const oldBest = bestOld.get(entry.oldPair);
    const newBest = bestNew.get(entry.newPair);
    if (oldBest?.score !== entry.score || newBest?.score !== entry.score || oldBest.count !== 1 || newBest.count !== 1)
      continue;
    consumed.add(entry.oldPair);
    consumed.add(entry.newPair);
    renamed.push({
      old: entry.oldPair.old,
      new: entry.newPair.new,
      rename: {
        method: entry.score === 100 ? "identical-content" : "line-similarity",
        similarity: entry.score
      }
    });
  }
  if (scores.some((entry) => !consumed.has(entry.oldPair) && !consumed.has(entry.newPair))) {
    reasons.add("Ambiguous rename candidates remain separate additions/deletions");
  }
  return [...pairs.filter((pair) => !consumed.has(pair)), ...renamed];
}
async function renderPair(pair, request, budget, reasons) {
  const selected = request.side === "old" ? pair.old : pair.new;
  const oldExists = pair.old.sourceStatus !== "absent";
  const newExists = pair.new.sourceStatus !== "absent";
  let changedRanges = [];
  let rangeReason;
  if (selected.content) {
    try {
      if (!oldExists || !newExists)
        changedRanges = wholeFile(selected.content);
      else if (pair.old.content && pair.new.content) {
        const diff = await changedLineRanges(pair.old.content, pair.new.content, budget);
        changedRanges = request.side === "old" ? diff.oldRanges : diff.newRanges;
      } else {
        rangeReason = "Changed lines unavailable because the opposite source cannot be compared as raw text";
      }
    } catch (error) {
      if (!(error instanceof GitDiffLimitError))
        throw error;
      rangeReason = error.message;
    }
  }
  if (rangeReason)
    reasons.add(rangeReason);
  for (const source of [pair.old, pair.new]) {
    if (source.sourceStatus === "unavailable")
      reasons.add(source.reason ?? "Source unavailable");
  }
  const unsupported = [pair.old, pair.new].some((source) => ["unavailable", "symlink", "submodule"].includes(source.sourceStatus));
  const change = pair.rename ? "renamed" : !oldExists ? "added" : !newExists ? "deleted" : unsupported ? "unknown" : "modified";
  const reason = selected.reason ?? rangeReason;
  return {
    path: selected.sourceStatus === "absent" ? request.side === "old" ? pair.new.path : pair.old.path : selected.path,
    ...oldExists ? { oldPath: pair.old.path } : {},
    ...newExists ? { newPath: pair.new.path } : {},
    change,
    sourceStatus: selected.sourceStatus,
    ...selected.content ? { content: selected.content } : {},
    ...selected.contentHash ? { contentHash: selected.contentHash } : {},
    ...selected.origin ? { origin: selected.origin } : {},
    changedRanges,
    ranges: request.scope === "files" && selected.content ? wholeFile(selected.content) : changedRanges,
    ...reason ? { reason } : {},
    ...pair.rename ? { rename: pair.rename } : {}
  };
}
async function readGitChanges(cwd, request, signal, options = {}) {
  if (!["files", "lines"].includes(request.scope) || !["new", "old"].includes(request.side))
    throw new SiftlightError("Invalid Git scope or side");
  if (request.target !== undefined && request.base === undefined)
    throw new SiftlightError("Git commit comparison requires an explicit base and target");
  const maxFiles = validateLimit(options.maxFiles ?? MAX_STRUCTURE_FILES, "Git file limit");
  const maxBytes = validateLimit(options.maxBytes ?? MAX_STRUCTURE_BYTES, "Git byte limit");
  const maxDiffWork = validateLimit(options.maxDiffWork ?? MAX_GIT_DIFF_WORK, "Git diff work limit");
  const base = await resolveGitCommit(cwd, request.base ?? "HEAD", signal);
  const target = request.target === undefined ? undefined : await resolveGitCommit(cwd, request.target, signal);
  const oldTree = await readGitTree(cwd, base, signal);
  const newTree = target ? await readGitTree(cwd, target, signal) : undefined;
  const diskNames = target ? undefined : await worktreeNames(cwd, signal);
  const reasons = new Set;
  if (oldTree.limited || newTree?.limited || diskNames?.limited)
    reasons.add("Git candidate metadata limit reached");
  const candidates = [
    ...new Set([...oldTree.entries.keys(), ...newTree?.entries.keys() ?? diskNames?.paths ?? []])
  ].filter((path) => {
    if (!target)
      return true;
    const oldEntry = oldTree.entries.get(path);
    const newEntry = newTree?.entries.get(path);
    return !oldEntry || !newEntry || oldEntry.blob !== newEntry.blob || oldEntry.mode !== newEntry.mode;
  }).toSorted();
  let visible = await visibleGitPaths(cwd, candidates, signal, options.includePath);
  let filterBytes = 0;
  if (options.filterPaths) {
    const allowed = new Set(visible);
    const filtered = await options.filterPaths(visible);
    visible = filtered.paths;
    filterBytes = filtered.bytesRead ?? 0;
    if (!Number.isSafeInteger(filterBytes) || filterBytes < 0 || filterBytes > maxBytes)
      throw new SiftlightError("Git path filtering exceeded its shared source read budget");
    if (visible.some((path) => !allowed.has(path)))
      throw new SiftlightError("Git path filter expanded the authorized candidate set");
    visible = [...new Set(visible)];
  }
  const readBudget = { bytes: filterBytes, maxBytes };
  const diffBudget = new GitDiffBudget(maxDiffWork, signal);
  const pairs = [];
  let filesRead = 0;
  let omittedFiles = 0;
  for (const path of visible) {
    if (signal?.aborted)
      throw abortError();
    const oldEntry = oldTree.entries.get(path);
    const newEntry = newTree?.entries.get(path);
    if (filesRead >= maxFiles || readBudget.bytes >= maxBytes) {
      omittedFiles += 1;
      continue;
    }
    filesRead += 1;
    const oldSource = oldEntry ? await readGitBlob(cwd, base, oldEntry, readBudget, signal) : absent(path);
    const newSource = target ? newEntry ? await readGitBlob(cwd, target, newEntry, readBudget, signal) : absent(path) : await readWorktreeSource(cwd, path, readBudget, signal);
    if (oldSource.sourceStatus === "absent" && newSource.sourceStatus === "absent")
      continue;
    if (sameContents(oldSource, newSource) && (process.platform === "win32" || oldSource.mode === newSource.mode))
      continue;
    pairs.push({ old: oldSource, new: newSource });
  }
  if (omittedFiles > 0)
    reasons.add(`Git read limits omitted ${String(omittedFiles)} candidate files (${String(maxFiles)} files / ${String(maxBytes)} bytes)`);
  const paired = await pairRenames(pairs, diffBudget, reasons);
  const files = [];
  for (const pair of paired)
    files.push(await renderPair(pair, request, diffBudget, reasons));
  for (const pair of paired) {
    if (pair.new.origin?.kind !== "worktree")
      continue;
    await verifyWorktreeRevision(cwd, pair.new.path, pair.new.origin.revision);
  }
  return {
    base,
    target: target ?? "worktree",
    scope: request.scope,
    side: request.side,
    files: files.toSorted((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
    partial: reasons.size > 0,
    reasons: [...reasons],
    filesRead,
    bytesRead: readBudget.bytes,
    diffWork: diffBudget.work,
    omittedFiles
  };
}
async function readGitSource(cwd, identity, signal, options = {}) {
  const path = gitPath(cwd, identity.path);
  if (!(await visibleGitPaths(cwd, [path], signal, options.includePath)).includes(path))
    throw new SiftlightError("Git source is excluded by current workspace privacy or path rules");
  const selected = await filterHistoricalPaths(cwd, [path], { glob: [], exclude: [], hidden: true }, signal);
  if (selected.partial || !selected.paths.includes(path))
    throw new SiftlightError("Git source is excluded or unverified by current .ignore/.rgignore rules");
  const commit = await resolveGitCommit(cwd, identity.commit, signal);
  const tree = await readGitTree(cwd, commit, signal, path);
  const entry = tree.entries.get(path);
  if (!entry)
    throw new SiftlightError("Git source path does not exist in the requested commit");
  if (identity.blob !== undefined && identity.blob !== entry.blob)
    throw new SiftlightError("Git source blob does not match its commit and path");
  return readGitBlob(cwd, commit, entry, { bytes: selected.ignoreBytesRead, maxBytes: options.maxBytes ?? MAX_STRUCTURE_BYTES }, signal);
}

// src/source-document.ts
import { isUtf8 } from "node:buffer";
import { createHash as createHash2 } from "node:crypto";
import { open as open3, realpath as realpath3 } from "node:fs/promises";
import { relative as relative6, resolve as resolve10 } from "node:path";
class SourceDocumentError extends SiftlightError {
  reason;
  constructor(reason, message) {
    super(message);
    this.reason = reason;
    this.name = "SourceDocumentError";
  }
}
function contentHash(bytes) {
  return createHash2("sha256").update(bytes).digest("hex");
}

class SourceDocument {
  reference;
  bytes;
  text;
  utf8;
  lineStarts = [0];
  #byteOffsets;
  constructor(reference, bytes) {
    if (typeof reference !== "object" || reference === null || typeof reference.path !== "string" || reference.path.length === 0 || typeof reference.origin !== "object" || reference.origin === null || !("kind" in reference.origin) || reference.origin.kind !== "git" && reference.origin.kind !== "worktree") {
      throw new SourceDocumentError("source-unavailable", "Source reference is invalid");
    }
    if (!Buffer.isBuffer(bytes)) {
      throw new SourceDocumentError("source-unavailable", "Source bytes are invalid");
    }
    this.reference = reference;
    this.bytes = bytes;
    if (bytes.length > MAX_SOURCE_FILE_BYTES) {
      throw new SourceDocumentError("file-too-large", "Source exceeds the 5 MiB file limit");
    }
    this.utf8 = isUtf8(bytes);
    this.text = bytes.toString("utf8");
    for (let index = bytes.indexOf(10);index >= 0; index = bytes.indexOf(10, index + 1)) {
      this.lineStarts.push(index + 1);
    }
  }
  get path() {
    return this.reference.path;
  }
  toByteOffset(character) {
    this.#requireUtf8();
    if (!Number.isSafeInteger(character) || character < 0 || character > this.text.length) {
      throw new SiftlightError("Source character offset is outside the document");
    }
    const code = this.text.charCodeAt(character);
    if (code >= 56320 && code <= 57343) {
      throw new SiftlightError("Source character offset splits a Unicode character");
    }
    const value = this.#offsets()[character];
    if (value === undefined)
      throw new Error("Missing source offset");
    return value;
  }
  toCharacterOffset(byte) {
    this.#requireUtf8();
    this.checkRange({ start: byte, end: byte });
    const offsets = this.#offsets();
    let low = 0;
    let high = offsets.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const value = offsets[middle];
      if (value === undefined)
        throw new Error("Missing source offset");
      if (value < byte)
        low = middle + 1;
      else
        high = middle;
    }
    if (offsets[low] !== byte) {
      throw new SiftlightError("Source byte offset splits a Unicode character");
    }
    return low;
  }
  lineAt(byte) {
    this.checkRange({ start: byte, end: byte });
    let low = 0;
    let high = this.lineStarts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      const start = this.lineStarts[middle];
      if (start === undefined)
        throw new Error("Missing source line");
      if (start <= byte)
        low = middle;
      else
        high = middle;
    }
    return low + 1;
  }
  positionAt(byte) {
    const line = this.lineAt(byte);
    const start = this.lineStarts[line - 1];
    if (start === undefined)
      throw new Error("Missing source line");
    return {
      line,
      column: this.toCharacterOffset(byte) - this.toCharacterOffset(start) + 1
    };
  }
  lineRange(startLine, endLine = startLine) {
    if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1 || endLine < startLine || startLine > this.lineStarts.length) {
      throw new SiftlightError("Source line range is outside the document");
    }
    const start = this.lineStarts[startLine - 1];
    if (start === undefined)
      throw new Error("Missing source line");
    return { start, end: this.lineStarts[endLine] ?? this.bytes.length };
  }
  slice(range) {
    this.#requireUtf8();
    this.checkRange(range);
    this.toCharacterOffset(range.start);
    this.toCharacterOffset(range.end);
    return this.bytes.subarray(range.start, range.end).toString("utf8");
  }
  checkRange(range) {
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end < range.start || range.end > this.bytes.length) {
      throw new SiftlightError("Source byte range is outside the document");
    }
  }
  #requireUtf8() {
    if (!this.utf8) {
      throw new SourceDocumentError("encoding", "Source is not losslessly representable as UTF-8");
    }
  }
  #offsets() {
    if (this.#byteOffsets)
      return this.#byteOffsets;
    const offsets = new Uint32Array(this.text.length + 1);
    let character = 0;
    let byte = 0;
    for (const point of this.text) {
      offsets[character] = byte;
      if (point.length === 2)
        offsets[character + 1] = byte;
      character += point.length;
      byte += Buffer.byteLength(point);
    }
    offsets[character] = byte;
    this.#byteOffsets = offsets;
    return offsets;
  }
}
async function readWorkspaceDocument(path, cwd, signal, expected, readBudget = MAX_SOURCE_FILE_BYTES) {
  if (signal?.aborted)
    throw abortError();
  if (expected?.kind === "git") {
    throw new SiftlightError("A Git source reference cannot be read from the worktree");
  }
  const absolute = resolve10(cwd, path);
  const [canonical, canonicalCwd] = await Promise.all([
    new SearchPathPolicy(cwd).resolveExistingPath(absolute),
    realpath3(cwd)
  ]);
  if (!canonical)
    throw new SourceDocumentError("source-unavailable", "Source is unavailable");
  const before = await getSourceRevision(absolute);
  if (!before)
    throw new SourceDocumentError("source-unavailable", "Source is unavailable");
  if (expected && !sameSourceRevision(before, expected.revision)) {
    throw new SourceDocumentError("source-changed", "Source changed; start a new inspection");
  }
  if (before.size > Math.min(MAX_SOURCE_FILE_BYTES, readBudget)) {
    throw new SourceDocumentError("file-too-large", "Source exceeds the 5 MiB file limit");
  }
  if (signal?.aborted)
    throw abortError();
  const handle = await open3(canonical, "r");
  let bytes;
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      throw new SourceDocumentError("source-unavailable", "Source must be a regular file");
    }
    if (!sameSourceRevision(before, sourceRevisionFromStats(metadata))) {
      throw new SourceDocumentError("source-changed", "Source was replaced before reading");
    }
    const buffer = Buffer.alloc(before.size);
    let used = 0;
    while (used < buffer.length) {
      if (signal?.aborted)
        throw abortError();
      const read = await handle.read(buffer, used, buffer.length - used, used);
      if (read.bytesRead === 0)
        break;
      used += read.bytesRead;
    }
    if (used !== before.size) {
      throw new SourceDocumentError("source-changed", "Source changed during reading");
    }
    bytes = buffer.subarray(0, used);
  } finally {
    await handle.close();
  }
  const [after, finalPath] = await Promise.all([getSourceRevision(absolute), realpath3(absolute)]);
  if (!after || canonical !== finalPath || !sameSourceRevision(before, after)) {
    throw new SourceDocumentError("source-changed", "Source changed during reading");
  }
  if (signal?.aborted)
    throw abortError();
  const hash = contentHash(bytes);
  if (expected && expected.contentHash !== hash) {
    throw new SourceDocumentError("source-changed", "Source content changed; start a new inspection");
  }
  return new SourceDocument({
    path: isPathInsideCwd(canonical, canonicalCwd) ? relative6(canonicalCwd, canonical).replaceAll("\\", "/") : canonical.replaceAll("\\", "/"),
    origin: { kind: "worktree", revision: after, contentHash: hash }
  }, bytes);
}

// src/syntax.ts
import { dirname as dirname2 } from "node:path";
import { fileURLToPath } from "node:url";

// src/syntax-tree.ts
function syntaxField(analysis, node, field) {
  return analysis.children[node]?.find((child) => analysis.nodes[child]?.field === field);
}
function syntaxFields(analysis, node, field) {
  return analysis.children[node]?.filter((child) => analysis.nodes[child]?.field === field) ?? [];
}
function syntaxText(node, text) {
  return text.slice(node.start, node.end);
}
function syntaxChildren(nodes) {
  const children = Array.from({ length: nodes.length }, () => []);
  for (let i = 0;i < nodes.length; i++) {
    const parent = nodes[i]?.parent;
    if (parent !== null && parent !== undefined)
      children[parent]?.push(i);
  }
  return children;
}

// src/syntax-facts.ts
var IMPLEMENTATIONS = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_expression",
  "generator_function",
  "arrow_function",
  "method_definition",
  "method_declaration",
  "func_literal"
]);
var SIGNATURES = new Set([
  "function_signature",
  "method_signature",
  "abstract_method_signature",
  "construct_signature",
  "call_signature",
  "method_elem"
]);
var CONTAINERS = new Set([
  "class_declaration",
  "abstract_class_declaration",
  "class",
  "interface_declaration"
]);
var TYPE_SYMBOLS = new Set([
  "type_alias_declaration",
  "enum_declaration",
  "type_spec",
  "type_alias"
]);
var BINDING_IDENTIFIERS = new Set([
  "identifier",
  "shorthand_property_identifier_pattern",
  "private_property_identifier",
  "property_identifier",
  "type_identifier",
  "field_identifier"
]);
var STRINGS = new Set([
  "string",
  "interpreted_string_literal",
  "raw_string_literal",
  "rune_literal"
]);
var TYPE_AREAS = new Set([
  "type_annotation",
  "type_arguments",
  "type_parameters",
  "type_identifier",
  "predefined_type",
  "type_alias_declaration",
  "interface_body",
  "extends_type_clause",
  "implements_clause",
  "array_type",
  "conditional_type",
  "constructor_type",
  "existential_type",
  "flow_maybe_type",
  "function_type",
  "generic_type",
  "index_type_query",
  "infer_type",
  "intersection_type",
  "literal_type",
  "lookup_type",
  "nested_type_identifier",
  "object_type",
  "parenthesized_type",
  "readonly_type",
  "template_literal_type",
  "this_type",
  "tuple_type",
  "type_query",
  "union_type"
]);
function mergeIntervals(intervals) {
  const merged = [];
  intervals.sort((a, b) => a.start - b.start || b.end - a.end);
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end)
      previous.end = Math.max(previous.end, interval.end);
    else
      merged.push({ ...interval });
  }
  return merged;
}
function subtract(range, excluded) {
  const results = [];
  let low = 0, high = excluded.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if ((excluded[middle]?.end ?? Infinity) <= range.start)
      low = middle + 1;
    else
      high = middle;
  }
  let start = range.start;
  for (let i = low;i < excluded.length; i++) {
    const gap = excluded[i];
    if (!gap || gap.start >= range.end)
      break;
    if (gap.start > start)
      results.push({ start, end: gap.start });
    start = Math.max(start, gap.end);
  }
  if (start < range.end)
    results.push({ start, end: range.end });
  return results;
}
function containedIntervals(range, sorted) {
  let low = 0, high = sorted.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if ((sorted[middle]?.start ?? Infinity) < range.start)
      low = middle + 1;
    else
      high = middle;
  }
  const contained = [];
  for (let i = low;i < sorted.length; i++) {
    const item = sorted[i];
    if (!item || item.start >= range.end)
      break;
    if (item.end <= range.end)
      contained.push(item);
  }
  return mergeIntervals(contained);
}
function bindingNodes(tree, index) {
  const results = [];
  const stack = [index];
  while (stack.length) {
    const id = stack.pop();
    if (id === undefined)
      break;
    const node = tree.nodes[id];
    if (!node)
      continue;
    if (BINDING_IDENTIFIERS.has(node.kind)) {
      results.push(id);
      continue;
    }
    if (node.kind === "pair_pattern") {
      const value = syntaxField(tree, id, "value");
      if (value !== undefined)
        stack.push(value);
    } else if (node.kind === "assignment_pattern" || node.kind === "object_assignment_pattern") {
      const left = syntaxField(tree, id, "left");
      if (left !== undefined)
        stack.push(left);
    } else {
      for (const child of tree.children[id] ?? []) {
        const value = tree.nodes[child];
        if (value?.named && value.field !== "type" && value.field !== "value")
          stack.push(child);
      }
    }
  }
  return results;
}
function attachedName(tree, index, text) {
  const node = tree.nodes[index];
  if (!node)
    return "<anonymous>";
  const ownName = syntaxField(tree, index, "name");
  const own = ownName === undefined ? undefined : tree.nodes[ownName];
  if (own)
    return syntaxText(own, text);
  const parent = node.parent === null ? undefined : tree.nodes[node.parent];
  if (parent && node.parent !== null) {
    const binding = syntaxField(tree, node.parent, parent.kind === "pair" ? "key" : "name") ?? (parent.kind === "assignment_expression" ? syntaxField(tree, node.parent, "left") : undefined);
    const target = binding === undefined ? undefined : tree.nodes[binding];
    if (target)
      return syntaxText(target, text);
    if (parent.kind === "export_statement")
      return "default";
  }
  return `<anonymous@${node.start}>`;
}
function directlyExported(tree, index) {
  let current = tree.nodes[index]?.parent ?? null;
  while (current !== null) {
    const node = tree.nodes[current];
    if (!node)
      return false;
    if (node.kind === "export_statement")
      return true;
    if (![
      "variable_declarator",
      "lexical_declaration",
      "variable_declaration",
      "ambient_declaration"
    ].includes(node.kind))
      return false;
    current = node.parent;
  }
  return false;
}
function goExported(tree, index, name, inFunction) {
  if (!/^\p{Lu}/u.test(name))
    return false;
  const kind = tree.nodes[index]?.kind;
  if (kind === "method_declaration" || kind === "field_declaration" || kind === "method_elem")
    return true;
  return !inFunction && ["function_declaration", "type_spec", "type_alias", "var_spec", "const_spec"].includes(kind ?? "");
}
function deriveSyntaxFacts(tree, language, text) {
  const { nodes, children } = tree;
  const roles = [];
  const symbols = [];
  const lexical = [];
  const comments = [];
  const nestedCallContent = [];
  const scopes = [];
  const functionScopes = [];
  const semanticCalls = [];
  const semanticImports = [];
  const add = (id, role, subkind, candidate = false) => {
    const node = nodes[id];
    if (!node || node.start === node.end)
      return;
    roles.push({
      start: node.start,
      end: node.end,
      role,
      certainty: candidate ? "candidate" : "syntax",
      node: id,
      ...subkind ? { subkind } : {}
    });
  };
  for (let index = 0;index < nodes.length; index++) {
    const node = nodes[index];
    if (!node)
      continue;
    const parent = node.parent === null ? undefined : nodes[node.parent];
    const outerScope = node.parent === null ? undefined : scopes[node.parent];
    const inFunction = node.parent === null ? false : functionScopes[node.parent] ?? false;
    scopes[index] = outerScope;
    functionScopes[index] = inFunction || IMPLEMENTATIONS.has(node.kind);
    if (node.kind === "comment") {
      add(index, "comment");
      lexical.push(node);
      comments.push(node);
    } else if (node.named && STRINGS.has(node.kind)) {
      add(index, "string", node.kind);
      lexical.push(node);
    } else if (node.kind === "template_string") {
      const substitutions = (children[index] ?? []).map((child) => nodes[child]).filter((child) => child?.kind === "template_substitution");
      for (const range of subtract(node, mergeIntervals(substitutions))) {
        roles.push({
          ...range,
          role: "string",
          certainty: "syntax",
          subkind: "template-static",
          node: index
        });
        lexical.push(range);
      }
    } else if (node.kind === "jsx_text") {
      add(index, "jsx-text");
      lexical.push(node);
    } else if (node.kind === "regex" || node.kind === "regex_pattern") {
      add(index, "unknown", "regex-literal");
      lexical.push(node);
    } else if (language !== "go" && TYPE_AREAS.has(node.kind)) {
      add(index, "unknown", "type");
      lexical.push(node);
    }
    if (node.kind === "as_expression" || node.kind === "satisfies_expression") {
      let afterOperator = false;
      for (const child of children[index] ?? []) {
        const target = nodes[child];
        if (!target)
          continue;
        if (target.kind === "as" || target.kind === "satisfies")
          afterOperator = true;
        else if (afterOperator) {
          add(child, "unknown", "type");
          lexical.push(target);
        }
      }
    }
    if (["arguments", "argument_list", "formal_parameters", "parameter_list"].includes(node.kind)) {
      nestedCallContent.push(node);
    }
    if (IMPLEMENTATIONS.has(node.kind)) {
      const bodyId = syntaxField(tree, index, "body");
      const body = bodyId === undefined ? undefined : nodes[bodyId];
      if (body)
        nestedCallContent.push(body);
    }
    const isImplementation = IMPLEMENTATIONS.has(node.kind);
    const isStructure = node.named && (isImplementation || SIGNATURES.has(node.kind) || CONTAINERS.has(node.kind) || TYPE_SYMBOLS.has(node.kind));
    const isVariable = node.named && ["variable_declarator", "var_spec", "const_spec"].includes(node.kind);
    const isField = node.named && [
      "public_field_definition",
      "field_definition",
      "field_declaration",
      "property_signature"
    ].includes(node.kind);
    if (isStructure || isVariable || isField) {
      const nameIds = syntaxFields(tree, index, "name").flatMap((name) => bindingNodes(tree, name));
      for (const id of nameIds) {
        if (syntaxText(nodes[id], text) !== "_") {
          add(id, "declaration", node.kind);
          const name = syntaxText(nodes[id], text);
          if (language === "go" ? goExported(tree, index, name, inFunction) : directlyExported(tree, index)) {
            add(id, "export", language === "go" ? "exported-identifier" : "exported-declaration");
          }
        }
      }
      const valueId = syntaxField(tree, index, "value");
      const value = valueId === undefined ? undefined : nodes[valueId];
      const variableHasOwnImplementation = value && IMPLEMENTATIONS.has(value.kind);
      if (isStructure || isVariable && !inFunction && !variableHasOwnImplementation || isField) {
        const name = attachedName(tree, index, text);
        const bodyId = syntaxField(tree, index, "body");
        const body = bodyId === undefined ? undefined : nodes[bodyId];
        const hasBody = isImplementation && body !== undefined;
        const symbol = {
          name,
          kind: node.kind,
          start: node.start,
          end: node.end,
          hasBody,
          exported: language === "go" ? goExported(tree, index, name, inFunction) : directlyExported(tree, index),
          node: index,
          ...outerScope ? { scope: outerScope } : {},
          ...hasBody && body ? { bodyStart: body.start, bodyEnd: body.end } : {}
        };
        symbols.push(symbol);
        if (isImplementation || CONTAINERS.has(node.kind))
          scopes[index] = name;
      }
    } else if (node.kind === "object" && parent?.kind === "variable_declarator") {
      scopes[index] = attachedName(tree, index, text);
    } else if (language === "go" && node.kind === "short_var_declaration") {
      const left = syntaxField(tree, index, "left");
      if (left !== undefined) {
        for (const id of bindingNodes(tree, left)) {
          if (syntaxText(nodes[id], text) !== "_")
            add(id, "declaration", "short-variable-candidate", true);
        }
      }
    }
    if (node.kind === "call_expression" || node.kind === "new_expression") {
      const field = node.kind === "new_expression" ? "constructor" : "function";
      const calleeId = syntaxField(tree, index, field);
      const callee = calleeId === undefined ? undefined : nodes[calleeId];
      if (callee) {
        const optional = (children[index] ?? []).some((child) => nodes[child]?.kind === "optional_chain");
        semanticCalls.push({
          node: index,
          range: callee,
          subkind: language === "go" ? callee.kind === "func_literal" ? "call" : "call-or-conversion" : node.kind === "new_expression" ? "constructor" : optional ? "optional-call" : "call",
          candidate: language === "go" && callee.kind !== "func_literal"
        });
      }
    }
    if (["import_statement", "import_spec", "export_statement"].includes(node.kind)) {
      const role = node.kind === "export_statement" ? "export" : "import";
      for (const child of children[index] ?? []) {
        const target = nodes[child];
        if (target && (["source", "path", "name"].includes(target.field ?? "") || ["import_clause", "export_clause", "import", "export", "default"].includes(target.kind)))
          semanticImports.push({ node: child, range: target, role });
      }
    }
    if (language === "go" && node.kind === "import")
      add(index, "import", "import-keyword");
  }
  const excluded = mergeIntervals(lexical);
  nestedCallContent.sort((a, b) => a.start - b.start);
  const commentExcluded = mergeIntervals(comments);
  for (const call of semanticCalls) {
    const callExcluded = containedIntervals(call.range, nestedCallContent);
    for (const lexicalRange of subtract(call.range, excluded)) {
      for (const range of subtract(lexicalRange, callExcluded)) {
        roles.push({
          ...range,
          role: "call",
          certainty: call.candidate ? "candidate" : "syntax",
          subkind: call.subkind,
          node: call.node
        });
      }
    }
  }
  for (const item of semanticImports) {
    for (const range of subtract(item.range, commentExcluded)) {
      roles.push({ ...range, role: item.role, certainty: "syntax", node: item.node });
    }
  }
  for (const range of subtract({ start: 0, end: text.length }, excluded)) {
    roles.push({ ...range, role: "code", certainty: "syntax", node: 0 });
  }
  roles.sort((a, b) => a.start - b.start || a.end - b.end || a.role.localeCompare(b.role));
  return { symbols, roles };
}

// src/syntax.ts
function syntaxLanguage(path) {
  switch (languageForPath(DEFAULT_LANGUAGE_CAPABILITIES, path)) {
    case "javascript":
      return "javascript";
    case "typescript":
      return "typescript";
    case "tsx":
      return "tsx";
    case "go":
      return "go";
    default:
      return;
  }
}
function emptyAnalysis(status, language) {
  return {
    status,
    ...language ? { language } : {},
    nodes: [],
    children: [],
    symbols: [],
    roles: [],
    diagnostics: [],
    limited: status === "limit"
  };
}
function invalidProtocol() {
  throw new SiftlightError("Invalid syntax parser protocol");
}
function readNode(value, index, nodes, length) {
  if (!value || typeof value !== "object")
    return invalidProtocol();
  if (!("kind" in value) || typeof value.kind !== "string" || value.kind.length === 0 || !("start" in value) || typeof value.start !== "number" || !Number.isSafeInteger(value.start) || !("end" in value) || typeof value.end !== "number" || !Number.isSafeInteger(value.end) || value.start < 0 || value.end < value.start || value.end > length || !("named" in value) || typeof value.named !== "boolean" || !("parent" in value))
    return invalidProtocol();
  const parent = value.parent;
  if (index === 0 ? parent !== null : typeof parent !== "number" || !Number.isSafeInteger(parent) || parent < 0 || parent >= index) {
    return invalidProtocol();
  }
  if (typeof parent === "number") {
    const owner = nodes[parent];
    if (!owner || owner.start > value.start || owner.end < value.end)
      return invalidProtocol();
  }
  if ("field" in value && typeof value.field !== "string")
    return invalidProtocol();
  return {
    kind: value.kind,
    start: value.start,
    end: value.end,
    parent: typeof parent === "number" ? parent : null,
    named: value.named,
    ..."field" in value && typeof value.field === "string" ? { field: value.field } : {}
  };
}
function readResult(output, length) {
  let result;
  try {
    result = JSON.parse(output);
  } catch {
    return invalidProtocol();
  }
  if (!result || typeof result !== "object" || !("status" in result) || !("nodes" in result) || !["ok", "parse-error", "limit"].includes(String(result.status)) || !Array.isArray(result.nodes) || result.nodes.length === 0 || result.nodes.length > MAX_SYNTAX_NODES) {
    return invalidProtocol();
  }
  const nodes = [];
  for (const value of result.nodes)
    nodes.push(readNode(value, nodes.length, nodes, length));
  if (result.status !== "ok" && result.status !== "parse-error" && result.status !== "limit")
    return invalidProtocol();
  const patternMatches = [];
  if ("patternMatches" in result) {
    if (!Array.isArray(result.patternMatches) || result.patternMatches.length > MAX_SYNTAX_NODES)
      return invalidProtocol();
    for (const match of result.patternMatches) {
      if (!match || typeof match !== "object" || !("start" in match) || !("end" in match) || typeof match.start !== "number" || typeof match.end !== "number" || !Number.isSafeInteger(match.start) || !Number.isSafeInteger(match.end) || match.start < 0 || match.end < match.start || match.end > length)
        return invalidProtocol();
      patternMatches.push({ start: match.start, end: match.end });
    }
  }
  return { status: result.status, nodes, patternMatches };
}
async function parseSyntax(path, text, signal, pattern) {
  if (signal?.aborted)
    throw abortError();
  const language = syntaxLanguage(path);
  if (!language)
    return emptyAnalysis("unsupported");
  if (Buffer.byteLength(text) > MAX_SOURCE_FILE_BYTES)
    return emptyAnalysis("limit", language);
  if (!text.isWellFormed()) {
    return {
      ...emptyAnalysis("parse-error", language),
      diagnostics: [{ kind: "invalid-unicode", start: 0, end: text.length }]
    };
  }
  const worker = fileURLToPath(new URL("./syntax-worker.mjs", import.meta.url));
  const config = fileURLToPath(new URL("./syntax-worker.toml", import.meta.url));
  const args = process.versions.bun ? [`--config=${config}`, "--no-env-file", "--no-macros", "--no-install", worker] : [worker];
  const env = scriptRuntimeEnvironment();
  const controller = new AbortController;
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted)
    controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, MAX_PARSE_TIME_MS);
  const chunks = [];
  let bytes = 0;
  try {
    const result = await runOwnedProcess({
      executable: process.execPath,
      args,
      cwd: dirname2(worker),
      env,
      signal: controller.signal,
      input: Buffer.from(JSON.stringify({ language, text, pattern }))
    }, async (stdout) => {
      for await (const chunk of stdout) {
        bytes += chunk.byteLength;
        if (bytes > MAX_STRUCTURE_BYTES)
          throw new SiftlightError("Syntax parser output exceeds protocol limit");
        chunks.push(Buffer.from(chunk));
      }
    });
    if (signal?.aborted)
      throw abortError();
    if (result.code !== 0) {
      throw new SiftlightError(`Syntax parser process failed (${String(result.code)}): ${result.stderr.trim()}`);
    }
    const parsed = readResult(Buffer.concat(chunks).toString("utf8"), text.length);
    const children = syntaxChildren(parsed.nodes);
    const diagnostics = parsed.nodes.flatMap((node, index) => node.kind === "ERROR" || index > 0 && node.start === node.end ? [
      {
        kind: node.kind === "ERROR" ? "syntax-error" : "missing-token",
        start: node.start,
        end: node.end
      }
    ] : []);
    const facts = parsed.status === "ok" ? deriveSyntaxFacts({ nodes: parsed.nodes, children }, language, text) : { symbols: [], roles: [] };
    if (signal?.aborted)
      throw abortError();
    return {
      language,
      status: parsed.status,
      nodes: parsed.nodes,
      children,
      ...parsed.patternMatches ? { patternMatches: parsed.patternMatches } : {},
      ...facts,
      diagnostics,
      limited: parsed.status === "limit"
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    if (aborted && signal?.aborted)
      throw abortError();
    if (aborted && timedOut)
      return emptyAnalysis("timeout", language);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

// src/source-access.ts
function noop() {}

class SyntaxQueue {
  #tail = Promise.resolve();
  #generation = new AbortController;
  #cache = new Map;
  #cachedNodes = 0;
  async parse(document, signal) {
    return (await this.parseWithMetrics(document, signal)).analysis;
  }
  async parseWithMetrics(document, signal, pattern) {
    const combined = signal ? AbortSignal.any([signal, this.#generation.signal]) : this.#generation.signal;
    if (combined.aborted)
      throw abortError();
    const predecessor = this.#tail;
    let release = noop;
    this.#tail = new Promise((done) => {
      release = done;
    });
    try {
      await predecessor;
      if (combined.aborted)
        throw abortError();
      if (!document.utf8)
        throw new SourceDocumentError("encoding", "Syntax requires lossless UTF-8 source");
      const origin = document.reference.origin;
      const revision = origin.kind === "worktree" ? origin.contentHash : origin.blob;
      const key = `${extname2(document.path).toLowerCase()}\x00${revision}\x00${pattern ?? ""}`;
      const cached = this.#cache.get(key);
      if (cached) {
        this.#cache.delete(key);
        this.#cache.set(key, cached);
        return { analysis: cached.analysis, cacheHit: true };
      }
      const analysis = await parseSyntax(document.path, document.text, combined, pattern);
      const entry = { analysis, nodes: analysis.nodes.length };
      this.#cache.set(key, entry);
      this.#cachedNodes += entry.nodes;
      while (this.#cache.size > MAX_SYNTAX_CACHE_ENTRIES || this.#cachedNodes > MAX_SYNTAX_CACHE_NODES) {
        const oldest = this.#cache.entries().next().value;
        if (!oldest)
          break;
        this.#cache.delete(oldest[0]);
        this.#cachedNodes -= oldest[1].nodes;
      }
      return { analysis, cacheHit: false };
    } finally {
      release();
    }
  }
  clear() {
    this.#generation.abort();
    this.#generation = new AbortController;
    this.#cache.clear();
    this.#cachedNodes = 0;
  }
  async shutdown() {
    this.clear();
    await this.#tail;
  }
}

class SourceBudgetError extends SiftlightError {
  reason = "structural-read-budget-exhausted";
}

class SourceAccess {
  cwd;
  signal;
  #queue;
  #maxFiles;
  #documents = new Map;
  #syntax = new Map;
  #maxVerificationBytes;
  #bytes = 0;
  #verificationBytes = 0;
  #syntaxParses = 0;
  #syntaxCacheHits = 0;
  #readTail = Promise.resolve();
  constructor(cwd, queue, signal, options = {}) {
    this.cwd = cwd;
    this.#queue = queue;
    this.signal = signal;
    this.#maxFiles = options.maxFiles ?? MAX_STRUCTURE_FILES;
    this.#maxVerificationBytes = options.maxVerificationBytes ?? MAX_STRUCTURE_BYTES;
  }
  get filesRead() {
    return this.#documents.size;
  }
  get bytesRead() {
    return this.#bytes;
  }
  get maxFiles() {
    return this.#maxFiles;
  }
  get syntaxParses() {
    return this.#syntaxParses;
  }
  get syntaxCacheHits() {
    return this.#syntaxCacheHits;
  }
  withSignal(signal) {
    return new SourceAccess(this.cwd, this.#queue, signal, {
      maxFiles: this.#maxFiles,
      maxVerificationBytes: this.#maxVerificationBytes
    });
  }
  async load(path, expected) {
    if (this.signal?.aborted)
      throw abortError();
    if (expected && resolve11(this.cwd, expected.path) !== resolve11(this.cwd, path)) {
      throw new SiftlightError("Source reference path does not match the requested file");
    }
    const key = JSON.stringify([resolve11(this.cwd, path), expected?.origin]);
    const existing = this.#documents.get(key);
    if (existing)
      return existing;
    if (this.#documents.size >= this.#maxFiles) {
      throw new SourceBudgetError(`Structural scan reached the ${String(this.#maxFiles)}-file limit`);
    }
    const pending = this.#read(path, expected, false);
    this.#documents.set(key, pending);
    return pending;
  }
  async#read(path, expected, verification) {
    const predecessor = this.#readTail;
    let release = noop;
    this.#readTail = new Promise((done) => {
      release = done;
    });
    try {
      await predecessor;
      return await this.#readOnce(path, expected, verification);
    } finally {
      release();
    }
  }
  async#readOnce(path, expected, verification) {
    let document;
    const consumed = verification ? this.#verificationBytes : this.#bytes - this.#verificationBytes;
    const budget = verification ? this.#maxVerificationBytes : MAX_STRUCTURE_BYTES;
    const remaining = budget - consumed;
    if (remaining <= 0)
      throw new SourceBudgetError("Structural scan reached the 32 MiB read limit");
    if (expected?.origin.kind !== "git") {
      const metadata = await getSourceRevision(resolve11(this.cwd, path));
      if (metadata && metadata.size > remaining)
        throw new SourceBudgetError("Next source exceeds the remaining 32 MiB structural read budget");
    }
    if (expected?.origin.kind === "git") {
      const origin = expected.origin;
      const raw = await readGitSource(this.cwd, { path, commit: origin.commit, blob: origin.blob }, this.signal, { maxBytes: remaining });
      if (!raw.content || !raw.origin) {
        throw new SourceDocumentError("source-unavailable", raw.reason ?? `Git source is ${raw.sourceStatus}`);
      }
      document = new SourceDocument({ path, origin: raw.origin }, raw.content);
    } else {
      document = await readWorkspaceDocument(path, this.cwd, this.signal, expected?.origin, remaining);
    }
    this.#bytes += document.bytes.length;
    if (verification)
      this.#verificationBytes += document.bytes.length;
    else if (this.#bytes - this.#verificationBytes > MAX_STRUCTURE_BYTES)
      throw new SourceBudgetError("Structural scan reached the 32 MiB read limit");
    return document;
  }
  syntax(document) {
    let pending = this.#syntax.get(document);
    if (!pending) {
      pending = this.#queue.parseWithMetrics(document, this.signal).then((parsed) => {
        if (parsed.cacheHit)
          this.#syntaxCacheHits += 1;
        else
          this.#syntaxParses += 1;
        return parsed.analysis;
      });
      this.#syntax.set(document, pending);
    }
    return pending;
  }
  async pattern(document, pattern) {
    return (await this.#queue.parseWithMetrics(document, this.signal, pattern)).analysis;
  }
  releaseSyntax(document) {
    this.#syntax.delete(document);
  }
  refresh(path, expected) {
    return this.#read(path, expected, true);
  }
}

// src/concept-source-generation.ts
class ConceptSourceChangedError extends SiftlightError {
  constructor(message = "Concept source changed while evidence was being computed") {
    super(message);
    this.name = "ConceptSourceChangedError";
  }
}
function isSourceMissing(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function options(filters) {
  return {
    ...filters.path ? { path: filters.path } : {},
    glob: filters.glob,
    exclude: filters.exclude,
    hidden: filters.hidden
  };
}
async function createConceptSourceGeneration(access, filters) {
  const files = await listWorkspaceFiles(access.cwd, access.signal, options(filters));
  const startedAt = Date.now();
  const inventory = [];
  const documents = [];
  const reasons = [...files.reasons];
  let filesSkippedEmpty = 0;
  let filesSkippedBinary = 0;
  let filesUnavailable = 0;
  let budgetError;
  for (const path of files.paths) {
    if (budgetError) {
      inventory.push({ path, status: "unavailable", reason: budgetError.message });
      filesUnavailable += 1;
      continue;
    }
    try {
      const document = await access.load(path);
      if (document.bytes.includes(0)) {
        inventory.push({
          path,
          status: "binary",
          reference: document.reference,
          ...document.reference.origin.kind === "worktree" ? { contentHash: document.reference.origin.contentHash } : {},
          reason: "Binary source contains NUL bytes"
        });
        filesSkippedBinary += 1;
        continue;
      }
      if (!document.utf8)
        throw new SourceDocumentError("encoding", "Not lossless UTF-8");
      if (!document.text.trim()) {
        inventory.push({
          path,
          status: "empty",
          reference: document.reference,
          ...document.reference.origin.kind === "worktree" ? { contentHash: document.reference.origin.contentHash } : {}
        });
        filesSkippedEmpty += 1;
        continue;
      }
      inventory.push({
        path,
        status: "admitted",
        reference: document.reference,
        ...document.reference.origin.kind === "worktree" ? { contentHash: document.reference.origin.contentHash } : {}
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
      if (!(error instanceof SourceDocumentError))
        throw error;
      if (error.reason === "source-changed")
        throw new ConceptSourceChangedError(`${path}: ${error.message}`);
      inventory.push({ path, status: "unavailable", reason: error.message });
      filesUnavailable += 1;
      reasons.push(`${path}: ${error.message}`);
    }
  }
  const inventoryHash = createHash3("sha256").update(JSON.stringify(inventory)).digest("hex").slice(0, 32);
  return {
    cwd: access.cwd,
    filters: {
      ...filters.path ? { path: filters.path } : {},
      glob: [...filters.glob],
      exclude: [...filters.exclude],
      hidden: filters.hidden
    },
    files,
    inventory,
    documents,
    partial: files.partial || filesUnavailable > 0,
    reasons,
    filesSkippedEmpty,
    filesSkippedBinary,
    filesUnavailable,
    startedAt,
    inventoryHash
  };
}
function conceptSourceSummary(generation) {
  return {
    inventoryHash: generation.inventoryHash,
    verification: generation.verifiedAt === undefined ? "unverified" : "verified-during-interval",
    startedAt: generation.startedAt,
    ...generation.verifiedAt === undefined ? {} : { verifiedAt: generation.verifiedAt },
    filesEnumerated: generation.files.paths.length,
    filesAdmitted: generation.documents.length,
    filesSkippedEmpty: generation.filesSkippedEmpty,
    filesSkippedBinary: generation.filesSkippedBinary,
    filesUnavailable: generation.filesUnavailable
  };
}
function samePathSet(left, right) {
  if (left.length !== right.length)
    return false;
  return left.every((path, index) => path === right[index]);
}
async function verifyConceptSourceGeneration(generation, access) {
  const current = await listWorkspaceFiles(access.cwd, access.signal, options(generation.filters));
  if (current.coverageIssue !== undefined && current.coverageIssue !== generation.files.coverageIssue) {
    throw new SiftlightError(current.reasons.join("; "));
  }
  if (current.partial !== generation.files.partial || !samePathSet(current.paths, generation.files.paths)) {
    throw new ConceptSourceChangedError("Concept source inventory changed while evidence was being computed");
  }
  for (const entry of generation.inventory) {
    if (!entry.reference)
      continue;
    try {
      const document = await access.refresh(entry.path, entry.reference);
      const hash = document.reference.origin.kind === "worktree" ? document.reference.origin.contentHash : undefined;
      if (entry.contentHash !== hash)
        throw new ConceptSourceChangedError(`${entry.path}: source content changed`);
    } catch (error) {
      if (error instanceof ConceptSourceChangedError)
        throw error;
      if (isSourceMissing(error))
        throw new ConceptSourceChangedError(`${entry.path}: source disappeared during verification`);
      if (error instanceof SourceDocumentError)
        throw new ConceptSourceChangedError(`${entry.path}: ${error.message}`);
      throw error;
    }
  }
  generation.verifiedAt = Date.now();
}

// src/concept-search.ts
var inferenceQueue = new OwnedTaskQueue;
var MAX_CONCEPT_FILES_WARN = 500;
function conciseWorkerError(stderr) {
  const errorLine = stderr.split(/\r?\n/).map((line) => line.trim()).find((line) => /^(?:[A-Za-z_$][\w$]*Error|Error|error):\s*\S/i.test(line));
  if (errorLine)
    return errorLine.replace(/^[^:]+(?:Error|error):\s*/i, "").slice(0, 512);
  const diagnostic = stderr.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (diagnostic)
    return diagnostic.slice(0, 512);
  return "worker returned no concise diagnostic";
}

class ConceptWorkerExitError extends SiftlightError {
  exitCode;
  constructor(exitCode, diagnostic) {
    super(`Local concept worker exited unexpectedly (${String(exitCode)}): ${diagnostic}`);
    this.name = "ConceptWorkerExitError";
    this.exitCode = exitCode;
  }
}
function scoreProfile(scores) {
  const ordered = scores.toSorted((a, b) => b - a);
  const count = ordered.length;
  const top = ordered[0];
  const min = ordered.at(-1);
  if (top === undefined || min === undefined || count === 0)
    throw new Error("Concept score profile requires at least one score");
  const middle = Math.floor(count / 2);
  const middleValue = ordered[middle] ?? top;
  const median = count % 2 === 1 ? middleValue : ((ordered[middle - 1] ?? top) + middleValue) / 2;
  const second = ordered[1];
  return {
    count,
    top,
    ...second !== undefined ? { second, topMargin: top - second } : {},
    median: median ?? top,
    min,
    spread: top - min
  };
}
function passage(document, start) {
  let end = Math.min(document.text.length, start + MAX_CONCEPT_CHARS);
  if (end < document.text.length) {
    const newline = document.text.lastIndexOf(`
`, end);
    if (newline > start + MAX_CONCEPT_CHARS / 2)
      end = newline + 1;
    const code = document.text.charCodeAt(end);
    if (code >= 56320 && code <= 57343)
      end -= 1;
  }
  const range = { start: document.toByteOffset(start), end: document.toByteOffset(end) };
  let next = end;
  if (end < document.text.length) {
    next = Math.max(start + 1, end - CONCEPT_PASSAGE_OVERLAP_CHARS);
    const code = document.text.charCodeAt(next);
    if (code >= 56320 && code <= 57343)
      next += 1;
  }
  return {
    value: {
      document,
      range,
      text: document.text.slice(start, end)
    },
    next
  };
}
async function similarities(query, passages, parent, onProgress) {
  const worker = fileURLToPath2(new URL("./concept-worker.mjs", import.meta.url));
  const config = fileURLToPath2(new URL("./syntax-worker.toml", import.meta.url));
  const env = scriptRuntimeEnvironment();
  const stagingRoot = join4(conceptCacheDirectory(), ".staging", randomUUID());
  await mkdir2(stagingRoot, { recursive: true });
  let bytes = 0;
  let lineBuffer = "";
  let finalValue;
  let sawFinal = false;
  const decoder = new StringDecoder("utf8");
  try {
    const processResult = await runOwnedProcess({
      executable: process.execPath,
      args: process.versions.bun ? [
        `--config=${config}`,
        "--no-env-file",
        "--no-macros",
        "--no-install",
        worker,
        "--infer"
      ] : [worker, "--infer"],
      cwd: dirname3(worker),
      env: { ...env, SIFTLIGHT_CONCEPT_CACHE_STAGING_DIR: stagingRoot },
      ...parent ? { signal: parent } : {},
      input: Buffer.from(JSON.stringify({
        query,
        encodedPassages: passages.map((item) => Buffer.from(item.text).toString("base64"))
      }))
    }, async (stdout) => {
      for await (const chunk of stdout) {
        bytes += chunk.byteLength;
        if (bytes > MAX_CONCEPT_WORKER_OUTPUT_BYTES)
          throw new SiftlightError("Concept worker exceeded its 4 MiB response budget");
        lineBuffer += decoder.write(Buffer.from(chunk));
        let newline = lineBuffer.indexOf(`
`);
        while (newline >= 0) {
          const line = lineBuffer.slice(0, newline).trim();
          lineBuffer = lineBuffer.slice(newline + 1);
          newline = lineBuffer.indexOf(`
`);
          if (!line)
            continue;
          const parsed = JSON.parse(line);
          if (!isRecordValue(parsed) || typeof parsed.type !== "string")
            throw new SiftlightError("Invalid concept worker progress response");
          if (parsed.type === "progress") {
            if (sawFinal)
              throw new SiftlightError("Concept worker emitted progress after its result");
            if (typeof parsed.phase !== "string" || parsed.completed !== undefined && (typeof parsed.completed !== "number" || !Number.isSafeInteger(parsed.completed) || parsed.completed < 0) || parsed.total !== undefined && (typeof parsed.total !== "number" || !Number.isSafeInteger(parsed.total) || parsed.total < 0))
              throw new SiftlightError("Invalid concept worker progress response");
            const progress = { phase: parsed.phase };
            if (typeof parsed.completed === "number")
              progress.completed = parsed.completed;
            if (typeof parsed.total === "number")
              progress.total = parsed.total;
            if (typeof parsed.uniqueEmbeddings === "number" && typeof parsed.passages === "number")
              progress.detail = `unique embeddings ${String(parsed.uniqueEmbeddings)}, passages ${String(parsed.passages)}`;
            onProgress?.(progress);
          } else if (parsed.type === "result") {
            if (sawFinal)
              throw new SiftlightError("Concept worker emitted more than one result");
            sawFinal = true;
            finalValue = parsed;
          } else {
            throw new SiftlightError("Invalid concept worker response type");
          }
        }
      }
    });
    if (processResult.code === null)
      throw new ConceptWorkerExitError(processResult.code, conciseWorkerError(processResult.stderr));
    if (processResult.code !== 0)
      throw new ConceptUnavailableError(`Local concept inference failed (${String(processResult.code)}): ${conciseWorkerError(processResult.stderr)}`);
    lineBuffer += decoder.end();
    if (lineBuffer.trim()) {
      const parsed = JSON.parse(lineBuffer.trim());
      if (!isRecordValue(parsed) || parsed.type !== "result")
        throw new SiftlightError("Concept worker did not return a result record");
      if (sawFinal)
        throw new SiftlightError("Concept worker emitted more than one result");
      finalValue = parsed;
      sawFinal = true;
    }
    const value = finalValue;
    if (!isRecordValue(value) || !Array.isArray(value.scores) || value.scores.length !== passages.length || value.scores.some((score) => typeof score !== "number" || !Number.isFinite(score)) || typeof value.cacheHits !== "number" || !Number.isSafeInteger(value.cacheHits) || value.cacheHits < 0 || typeof value.cacheMisses !== "number" || !Number.isSafeInteger(value.cacheMisses) || value.cacheMisses < 0 || typeof value.cacheMaxBytes !== "number" || !Number.isSafeInteger(value.cacheMaxBytes) || value.cacheMaxBytes <= 0 || value.cacheBytes !== undefined && (typeof value.cacheBytes !== "number" || !Number.isSafeInteger(value.cacheBytes) || value.cacheBytes < 0) || typeof value.windowsRanked !== "number" || !Number.isSafeInteger(value.windowsRanked) || value.windowsRanked < passages.length || !Array.isArray(value.warnings) || value.warnings.some((warning) => typeof warning !== "string") || typeof value.peakRssBytes !== "number" || !Number.isFinite(value.peakRssBytes) || value.peakRssBytes < 0)
      throw new SiftlightError("Invalid concept inference response");
    return {
      scores: value.scores.filter((score) => typeof score === "number"),
      cacheHits: value.cacheHits,
      cacheMisses: value.cacheMisses,
      cacheMaxBytes: value.cacheMaxBytes,
      ...typeof value.cacheBytes === "number" ? { cacheBytes: value.cacheBytes } : {},
      windowsRanked: value.windowsRanked,
      warnings: value.warnings.filter((warning) => typeof warning === "string"),
      peakRssBytes: value.peakRssBytes
    };
  } catch (error) {
    if (parent?.aborted)
      throw abortError();
    if (error instanceof ConceptWorkerExitError)
      throw error;
    if (error instanceof ConceptUnavailableError)
      throw error;
    const message = error instanceof Error ? error.message : "unknown provider failure";
    throw new ConceptUnavailableError(`Local concept inference failed: ${message}`, {
      cause: error
    });
  } finally {
    try {
      await rm2(stagingRoot, { recursive: true, force: true });
    } catch (error) {
      throw new ConceptUnavailableError("Unable to clean up concept worker staging files", {
        cause: error
      });
    }
  }
}
function validateConceptQuery(query) {
  if (!query?.trim() || query.length > 256 || !query.isWellFormed() || /[\r\n\0]/.test(query))
    throw new SiftlightError("Concept query requires nonempty, single-line well-formed text of at most 256 characters");
  return query;
}
async function runConceptSearch(input, access, infer, onProgress) {
  const query = validateConceptQuery(input.query);
  const started = performance.now();
  const request = normalizeRequest({ ...input, pattern: "" });
  const sourceGeneration = await createConceptSourceGeneration(access, {
    ...request.path ? { path: request.path } : {},
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden
  });
  onProgress?.({
    phase: "source-generation",
    completed: sourceGeneration.files.paths.length,
    total: sourceGeneration.files.paths.length,
    detail: `generation ${sourceGeneration.inventoryHash}; admitted ${String(sourceGeneration.documents.length)}, unavailable ${String(sourceGeneration.filesUnavailable)}`
  });
  const files = sourceGeneration.files;
  const result = {
    kind: "concept",
    unit: "evidence-items",
    items: [],
    partial: sourceGeneration.partial,
    reasons: [...sourceGeneration.reasons],
    redact: input.redact ?? false
  };
  const documents = [];
  for (const document of sourceGeneration.documents)
    documents.push({ document, next: 0 });
  const passages = [];
  while (documents.some((item) => item.next < item.document.text.length)) {
    for (const item of documents) {
      if (item.next >= item.document.text.length)
        continue;
      const chunk = passage(item.document, item.next);
      passages.push(chunk.value);
      item.next = chunk.next;
    }
  }
  onProgress?.({ phase: "passage-queue", completed: passages.length, total: passages.length });
  const filesAdmitted = documents.length;
  const filesSkippedEmpty = sourceGeneration.filesSkippedEmpty;
  const filesSkippedBinary = sourceGeneration.filesSkippedBinary;
  const filesUnavailable = sourceGeneration.filesUnavailable;
  if (files.paths.length > MAX_CONCEPT_FILES_WARN) {
    result.reasons.push(`Concept enumerated ${String(files.paths.length)} files; narrow path or glob for faster interactive retrieval`);
  }
  result.counts = {
    filesEnumerated: files.paths.length,
    filesAdmitted,
    filesSkippedEmpty,
    filesSkippedBinary,
    filesUnavailable,
    passagesQueued: passages.length
  };
  if (passages.length) {
    const inferred = await infer(query, passages, access.signal, onProgress);
    result.reasons.push(...inferred.warnings);
    result.items = passages.map((item, index) => {
      const similarity = inferred.scores[index];
      if (similarity === undefined)
        throw new Error("Missing concept similarity");
      const evidence = rangeEvidence(item.document, item.range);
      return {
        path: item.document.path,
        line: item.document.lineAt(item.range.start),
        source: item.document.reference,
        range: item.range,
        label: `Concept candidate (cosine ${similarity.toFixed(4)})`,
        excerpt: evidence.excerpt,
        details: {
          kind: "concept-candidate",
          certainty: "candidate",
          score: similarity,
          rankingReason: "local multilingual E5 cosine similarity; relevance candidate, no binding or execution claim",
          model: CONCEPT_MODEL,
          revision: CONCEPT_REVISION,
          tokenTruncated: false,
          excerptRange: evidence.excerptRange,
          excerptTruncated: evidence.excerptTruncated
        }
      };
    }).toSorted((a, b) => b.details.score - a.details.score || a.path.localeCompare(b.path) || a.line - b.line);
    result.stats = {
      inferencePeakRssBytes: inferred.peakRssBytes,
      passagesRanked: passages.length,
      conceptWindowsRanked: inferred.windowsRanked,
      conceptCacheHits: inferred.cacheHits,
      conceptCacheMisses: inferred.cacheMisses,
      conceptCacheMaxBytes: inferred.cacheMaxBytes,
      ...inferred.cacheBytes === undefined ? {} : { conceptCacheBytes: inferred.cacheBytes },
      scoreProfile: scoreProfile(inferred.scores)
    };
  }
  result.filesRead = access.filesRead;
  result.bytesRead = access.bytesRead;
  result.stats = {
    ...result.stats,
    elapsedMs: Math.round(performance.now() - started),
    filesEnumerated: files.paths.length,
    filesAdmitted
  };
  result.coverage = {
    conceptCandidates: result.partial ? "partial" : "complete",
    admissionPlan: result.partial ? "partial" : "complete",
    compilerBindings: "not-applicable"
  };
  result.scope = {
    path: request.path ?? ".",
    requestedPath: request.path ?? ".",
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden,
    ignorePolicy: request.ignorePolicy ?? "respect",
    expandedToProjectRoot: false,
    assertion: request.path && request.path !== "." ? "requested-scope" : "project-wide"
  };
  await verifyConceptSourceGeneration(sourceGeneration, access);
  result.sourceGeneration = conceptSourceSummary(sourceGeneration);
  return { analysis: result, sourceGeneration };
}
function conceptSearch(input, access, onProgress) {
  return runConceptSearchQueued(input, access, similarities, onProgress);
}
async function runConceptSearchQueued(input, access, infer, onProgress) {
  return inferenceQueue.run(() => runConceptSearch(input, access, infer, onProgress), access.signal).catch((error) => {
    if (access.signal?.aborted)
      throw abortError();
    throw error;
  });
}

// src/structural-search.ts
async function structuralSearch(input, access) {
  if (!input.pattern?.trim() || Buffer.byteLength(input.pattern) > 4096 || !input.pattern.isWellFormed())
    throw new SiftlightError("Structural pattern must be nonempty, well-formed and at most 4 KiB; ast-grep $NAME/$$$ARGS metavariables are supported");
  const request = normalizeRequest({ ...input, pattern: "" });
  const files = await listWorkspaceFiles(access.cwd, access.signal, {
    ...request.path ? { path: request.path } : {},
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden
  });
  const result = {
    kind: "structure",
    unit: "occurrences",
    items: [],
    partial: files.partial,
    reasons: [...files.reasons],
    redact: input.redact ?? false
  };
  let retainedBytes = 0;
  const supported = files.paths.filter((path) => syntaxLanguage(path));
  if (files.paths.length && !supported.length)
    throw new SiftlightError("Structural patterns require admitted JS/TS/TSX/Go source; no supported source files were found");
  result.stats = {
    filesEnumerated: files.paths.length,
    filesSkipped: files.paths.length - supported.length
  };
  for (const path of files.paths) {
    if (!syntaxLanguage(path))
      continue;
    try {
      const document = await access.load(path);
      const syntax = await access.pattern(document, input.pattern);
      if (syntax.status !== "ok") {
        result.partial = true;
        result.reasons.push(`${path}: syntax ${syntax.status}; structural matches withheld`);
        continue;
      }
      for (const match of syntax.patternMatches ?? []) {
        const range = {
          start: document.toByteOffset(match.start),
          end: document.toByteOffset(match.end)
        };
        const evidence = rangeEvidence(document, range);
        const item = {
          path: document.path,
          line: document.lineAt(range.start),
          source: document.reference,
          range,
          label: "AST pattern match",
          excerpt: evidence.excerpt,
          details: {
            kind: "structural-match",
            certainty: "syntax",
            score: 90,
            rankingReason: "AST structure and repeated metavariable equality",
            excerptRange: evidence.excerptRange,
            excerptTruncated: evidence.excerptTruncated
          }
        };
        const bytes = Buffer.byteLength(JSON.stringify(item));
        if (result.items.length >= MAX_ANALYSIS_RESULTS || retainedBytes + bytes > MAX_ANALYSIS_STORAGE_BYTES - 65536) {
          result.partial = true;
          result.reasons.push("Structural evidence storage limit reached: 50,000 items / 32 MiB");
          break;
        }
        result.items.push(item);
        retainedBytes += bytes;
      }
      if (result.items.length >= MAX_ANALYSIS_RESULTS || result.reasons.at(-1)?.startsWith("Structural evidence storage"))
        break;
    } catch (error) {
      if (error instanceof SourceBudgetError) {
        result.partial = true;
        result.reasons.push(error.message);
        break;
      }
      if (!(error instanceof SourceDocumentError))
        throw error;
      result.partial = true;
      result.reasons.push(`${path}: ${error.message}`);
    }
  }
  result.filesRead = access.filesRead;
  result.bytesRead = access.bytesRead;
  result.coverage = { astPatterns: result.partial ? "partial" : "complete" };
  result.scope = {
    path: request.path ?? ".",
    requestedPath: request.path ?? ".",
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden,
    ignorePolicy: request.ignorePolicy ?? "respect",
    expandedToProjectRoot: false,
    assertion: request.path && request.path !== "." ? "requested-scope" : "project-wide"
  };
  return result;
}

// src/evidence-service.ts
import { dirname as dirname4, extname as extname3, resolve as resolve20 } from "node:path";

// src/analysis-store.ts
import { randomUUID as randomUUID2 } from "node:crypto";

// src/analysis-types.ts
var SEMANTIC_JUDGE_CLASSIFICATIONS = [
  "implementation-candidate",
  "caller-candidate",
  "mention-only",
  "documentation",
  "test-only",
  "irrelevant",
  "uncertain"
];
var SEMANTIC_JUDGE_NON_PROOF_CLAIM = "semantic classification only; local static and runtime verification is not asserted";

// src/analysis-term-pages.ts
var MAX_INLINE_TERM_COUNT_BYTES = 8 * 1024;
function termCountRequest(id, offset, redact = false) {
  return {
    cursor: `${id}.analysis-terms.${offset.toString(36)}`,
    ...redact ? { redact: true } : {}
  };
}
function analysisTermPage(result, id, offset) {
  const all = result.termCounts ?? [];
  const terms = [];
  const rows = [];
  let bytes = 0;
  for (let index = offset;index < all.length; index++) {
    const term = all[index];
    if (!term)
      throw new Error("Term inventory index unavailable");
    const label = `condition #${String(index + 1)}`;
    const row = `${label}: ${String(term.retainedOccurrences)} retained occurrences`;
    const size = Buffer.byteLength(row) + 2;
    if (bytes + size > MAX_INLINE_TERM_COUNT_BYTES)
      break;
    rows.push(row);
    terms.push({ term: label, retainedOccurrences: term.retainedOccurrences });
    bytes += size;
  }
  const nextOffset = offset + terms.length;
  const nextRequest = nextOffset < all.length ? termCountRequest(id, nextOffset, result.redact) : undefined;
  const matchesRequest = { cursor: `${id}.analysis.0`, ...result.redact ? { redact: true } : {} };
  return {
    text: [
      `Condition inventory ${String(offset + 1)}-${String(nextOffset)} of ${String(all.length)} (${result.partial ? "PARTIAL evidence" : "complete evidence"}). Counts refer to retained occurrences.`,
      ...rows,
      ...nextRequest ? [`Next request: ${JSON.stringify(nextRequest)}`] : [],
      `Match metadata request: ${JSON.stringify(matchesRequest)}`
    ].join(`

`),
    details: {
      version: 1,
      mode: "matches",
      status: result.partial ? "partial" : "complete",
      snapshotComplete: !result.partial,
      totalMatches: result.items.length,
      storedMatches: result.items.length,
      returnedMatches: 0,
      totalFiles: new Set(result.items.map((item) => item.path)).size,
      cursor: nextRequest?.cursor ?? matchesRequest.cursor,
      ...nextRequest ? { nextRequest } : {},
      ...result.redact ? { redactionRequested: true } : {},
      analysis: {
        kind: result.kind,
        unit: result.unit,
        totalItems: result.items.length,
        returnedItems: 0,
        items: [],
        reasons: result.reasons,
        termCounts: terms,
        termCountsOffset: offset,
        totalTerms: all.length,
        ...nextRequest ? { termCountsNextRequest: nextRequest } : {},
        matchesRequest,
        ...result.coverage ? { coverage: result.coverage } : {}
      }
    }
  };
}

// src/analysis-store.ts
function boundedReasons(reasons) {
  const unsupportedSuffix = ": syntax unsupported; this source remains unclassified";
  const unsupported = reasons.filter((reason) => reason.endsWith(unsupportedSuffix)).map((reason) => reason.slice(0, -unsupportedSuffix.length));
  const unique = [
    ...new Set(reasons.filter((reason) => !reason.endsWith(unsupportedSuffix))),
    ...unsupported.length ? [
      `${String(unsupported.length)} matching file(s) skipped because syntax is unsupported${unsupported.length ? `; examples: ${unsupported.slice(0, 3).join(", ")}` : ""}`
    ] : []
  ];
  const retained = [];
  let bytes = 2;
  let omitted = 0;
  for (const reason of unique) {
    const reasonBytes = Buffer.byteLength(JSON.stringify(reason)) + 1;
    if (retained.length >= MAX_ANALYSIS_REASONS || bytes + reasonBytes > MAX_ANALYSIS_REASON_BYTES) {
      omitted += 1;
      continue;
    }
    retained.push(reason);
    bytes += reasonBytes;
  }
  if (omitted === 0)
    return retained;
  let notice = `${String(omitted)} additional analysis reasons omitted within the ${String(MAX_ANALYSIS_REASONS)}-reason / ${String(MAX_ANALYSIS_REASON_BYTES)}-byte diagnostic limit`;
  while (retained.length > 0 && bytes + Buffer.byteLength(JSON.stringify(notice)) + 1 > MAX_ANALYSIS_REASON_BYTES) {
    const removed = retained.pop();
    if (removed === undefined)
      break;
    bytes -= Buffer.byteLength(JSON.stringify(removed)) + 1;
    omitted += 1;
    notice = `${String(omitted)} additional analysis reasons omitted within the ${String(MAX_ANALYSIS_REASONS)}-reason / ${String(MAX_ANALYSIS_REASON_BYTES)}-byte diagnostic limit`;
  }
  retained.push(notice);
  return retained;
}
function publicAnalysisLabel(result) {
  switch (result.kind) {
    case "files":
      return "file metadata";
    case "outline":
      return "symbol metadata";
    case "imports":
      return "import relationship metadata";
    case "tests":
      return "test candidate metadata";
    case "structure":
      return "structure match metadata";
    case "roles":
      return "role match metadata";
    case "function-and":
      return "function match metadata";
    case "file-and":
      return "file match metadata";
    case "changes":
      return "change metadata";
    case "concept":
      return "semantic candidate metadata";
    case "hybrid":
      return "combined evidence metadata";
    case "any-of":
      return "condition match metadata";
    case "validate":
      return "validation metadata";
  }
  throw new Error("Unknown analysis result kind");
}
function publicStringArray(value) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string"))
    return;
  return value;
}
function publicStructureDetails(item) {
  if (item.details?.kind !== "symbol")
    return;
  const details = item.details;
  const scope = publicStringArray(details.scope);
  return {
    kind: "symbol",
    ...typeof details.language === "string" ? { language: details.language } : {},
    ...typeof details.name === "string" ? { name: details.name } : {},
    ...scope ? { scope } : {},
    ...typeof details.hasBody === "boolean" ? { hasBody: details.hasBody } : {},
    ...typeof details.exported === "boolean" ? { exported: details.exported } : {},
    ...typeof details.syntax === "string" ? { syntax: details.syntax } : {},
    ...typeof details.signatureTruncated === "boolean" ? { signatureTruncated: details.signatureTruncated } : {}
  };
}
function publicSemanticJudgeDetails(item) {
  const value = item.details?.semanticJudge;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return;
  const classification = Reflect.get(value, "classification");
  const probability = Reflect.get(value, "probability");
  const confidence = Reflect.get(value, "confidence");
  const model = Reflect.get(value, "model");
  const claim = Reflect.get(value, "claim");
  if (typeof classification !== "string" || !SEMANTIC_JUDGE_CLASSIFICATIONS.some((candidate) => candidate === classification) || typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1 || confidence !== undefined && (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) || typeof model !== "string" || model.length === 0 || model.length > 128 || /[\r\n\0]/u.test(model) || claim !== SEMANTIC_JUDGE_NON_PROOF_CLAIM)
    return;
  return {
    classification,
    probability,
    ...confidence === undefined ? {} : { confidence },
    model,
    claim
  };
}
function publicItemDetails(item) {
  const structure = publicStructureDetails(item);
  const semanticJudge = publicSemanticJudgeDetails(item);
  const source = item.details?.source === "literal" || item.details?.source === "concept" ? item.details.source : undefined;
  if (!structure && !semanticJudge && !source)
    return;
  return {
    ...structure,
    ...source ? { source } : {},
    ...semanticJudge ? { semanticJudge } : {}
  };
}
function publicAnalysisItem(result, item, index, storedId, modelOutput) {
  const inspect = item.source && item.range ? {
    mode: "inspect",
    cursor: `${storedId}.analysis.0`,
    matchIndex: index + 1,
    ...result.redact ? { redact: true } : {}
  } : undefined;
  const publicDetails = publicItemDetails(item);
  return {
    path: item.path,
    line: item.line,
    label: result.kind === "outline" && modelOutput ? item.label : publicAnalysisLabel(result),
    index: index + 1,
    ...inspect ? { inspect } : {},
    ...publicDetails ? { details: publicDetails } : {}
  };
}
function safeTermCounts(termCounts) {
  return termCounts?.map((entry, index) => ({
    term: `condition #${String(index + 1)}`,
    retainedOccurrences: entry.retainedOccurrences
  }));
}
function hybridPreviewIndices(items) {
  const literal = [];
  const concept = [];
  for (const [index, item] of items.entries()) {
    if (item.details?.source === "literal" && literal.length < 3)
      literal.push(index);
    if (item.details?.source === "concept")
      concept.push(index);
  }
  return [...literal, ...concept];
}

class AnalysisStore {
  #items = new Map;
  #expired = new Set;
  #now;
  constructor(now = Date.now) {
    this.#now = now;
  }
  clear() {
    for (const id of this.#items.keys())
      this.#rememberExpired(id);
    this.#items.clear();
  }
  create(result, summarize) {
    this.#expire();
    const bounded = {
      ...result,
      reasons: boundedReasons(result.reasons),
      items: [],
      coverage: { ...result.coverage, retention: "complete" }
    };
    let bytes = Buffer.byteLength(JSON.stringify(bounded));
    const candidates = result.items.map((item, index) => ({ item, index }));
    const retainedIndices = [];
    const rebuildItems = () => {
      const retained = new Set(retainedIndices);
      bounded.items = result.items.filter((_item, index) => retained.has(index)).map((item) => structuredClone(item));
    };
    for (const candidate of candidates) {
      const { item } = candidate;
      const itemBytes = Buffer.byteLength(JSON.stringify(item)) + 1;
      if (retainedIndices.length >= MAX_ANALYSIS_RESULTS || bytes + itemBytes > MAX_ANALYSIS_STORAGE_BYTES - ANALYSIS_METADATA_RESERVE_BYTES) {
        bounded.partial = true;
        if (bounded.coverage)
          bounded.coverage.retention = "partial";
        bounded.reasons.push("Analysis storage limit: 50,000 items / 32 MiB; narrow the query");
        break;
      }
      retainedIndices.push(candidate.index);
      bytes += itemBytes;
    }
    rebuildItems();
    if (summarize)
      Object.assign(bounded, summarize(bounded.items));
    bytes = Buffer.byteLength(JSON.stringify(bounded));
    while (bytes > MAX_ANALYSIS_STORAGE_BYTES - 1024 && bounded.items.length > 0) {
      retainedIndices.pop();
      rebuildItems();
      bounded.partial = true;
      if (bounded.coverage)
        bounded.coverage.retention = "partial";
      if (!bounded.reasons.includes("Analysis storage limit: 50,000 items / 32 MiB; narrow the query"))
        bounded.reasons.push("Analysis storage limit: 50,000 items / 32 MiB; narrow the query");
      if (summarize)
        Object.assign(bounded, summarize(bounded.items));
      bytes = Buffer.byteLength(JSON.stringify(bounded));
    }
    bounded.reasons = boundedReasons(bounded.reasons);
    bytes = Buffer.byteLength(JSON.stringify(bounded));
    if (bytes > MAX_ANALYSIS_STORAGE_BYTES - 1024)
      throw new SiftlightError("Analysis metadata exceeds the storage budget");
    while (this.#items.size >= MAX_ANALYSIS_SNAPSHOTS || this.#totalBytes() + bytes > MAX_ANALYSIS_STORAGE_BYTES || this.#totalItems() + bounded.items.length > MAX_ANALYSIS_RESULTS) {
      const oldest = [...this.#items.values()].toSorted((a, b) => a.touched - b.touched)[0];
      if (!oldest)
        throw new SiftlightError("Analysis metadata exceeds the storage budget");
      this.#items.delete(oldest.id);
      this.#rememberExpired(oldest.id);
    }
    const id = randomUUID2();
    this.#items.set(id, { id, result: bounded, bytes, touched: this.#now() });
    return `${id}.${result.kind === "hybrid" ? "analysis-hybrid" : "analysis"}.0`;
  }
  resolve(cursor) {
    this.#expire();
    const match = /^([a-f0-9-]+)\.(analysis|analysis-hybrid|analysis-terms)\.([0-9a-z]+)$/.exec(cursor);
    if (!match)
      throw new CursorError("Invalid analysis cursor");
    const id = match[1];
    const kind = match[2];
    const rawOffset = match[3];
    if (kind !== "analysis" && kind !== "analysis-hybrid" && kind !== "analysis-terms")
      throw new CursorError("Invalid analysis cursor");
    if (!id || !rawOffset)
      throw new CursorError("Invalid analysis cursor");
    const offset = Number.parseInt(rawOffset, 36);
    const stored = this.#items.get(id);
    if (!stored)
      throw new CursorError(this.#expired.has(id) ? "Analysis cursor expired or was evicted; run the query again" : "Analysis cursor was not found; run the query again", this.#expired.has(id) ? "E_CURSOR_EXPIRED" : "E_CURSOR_NOT_FOUND");
    if (!Number.isSafeInteger(offset) || offset < 0 || offset.toString(36) !== rawOffset || (kind === "analysis" ? offset > stored.result.items.length : kind === "analysis-hybrid" ? offset !== 0 || stored.result.kind !== "hybrid" : offset >= (stored.result.termCounts?.length ?? 0)))
      throw new CursorError("Invalid analysis offset", "E_CURSOR_OFFSET_INVALID");
    stored.touched = this.#now();
    return { stored, offset, kind };
  }
  item(cursor, index) {
    const { stored, kind } = this.resolve(cursor);
    if (kind !== "analysis")
      throw new CursorError("Term inventories do not contain source items", "E_CURSOR_WRONG_KIND");
    if (!Number.isSafeInteger(index) || index < 1)
      throw new CursorError("matchIndex must be a positive analysis item index");
    const item = stored.result.items[index - 1];
    if (!item)
      throw new CursorError("Analysis item is outside the retained result");
    return structuredClone(item);
  }
  page(cursor, modelOutput = false) {
    const { stored, offset, kind } = this.resolve(cursor);
    const { result } = stored;
    if (kind === "analysis-terms")
      return analysisTermPage(result, stored.id, offset);
    const hybridPreview = kind === "analysis-hybrid";
    const hybridMatchesRequest = hybridPreview ? { cursor: `${stored.id}.analysis.0`, ...result.redact ? { redact: true } : {} } : undefined;
    const pagedTerms = result.termCounts && Buffer.byteLength(JSON.stringify(result.termCounts)) > MAX_INLINE_TERM_COUNT_BYTES;
    const inlineTerms = pagedTerms ? undefined : safeTermCounts(result.termCounts);
    const termsRequest = pagedTerms ? termCountRequest(stored.id, 0, result.redact) : undefined;
    const items = [];
    const sources = [];
    const sourceIds = new Map;
    const hybridInspectCursor = result.kind === "hybrid" ? `${stored.id}.analysis.0` : undefined;
    const statistics = statisticsForItems(result.items, result.items.length, result.unit, analysisExtraGroups(result.counts, result.termCounts, result.items));
    const scope = result.scope ? ` Scope: ${result.scope.assertion === "project-wide" ? "project root" : "requested path"} ${JSON.stringify(result.scope.path)}${result.scope.expandedToProjectRoot ? `, expanded after ${JSON.stringify(result.scope.requestedPath)} had no matches` : ""}.${modificationTimeBoundsText(result.scope.modifiedAfterMs, result.scope.modifiedBeforeMs)}` : "";
    const coverage = result.coverage ? ` Coverage: ${JSON.stringify(result.coverage)}.` : "";
    const stats = result.stats ? ` Stats: ${JSON.stringify(result.stats)}.` : "";
    const semanticJudge = result.semanticJudge ? ` Semantic judge: ${result.semanticJudge.status}; provider=${result.semanticJudge.provider}; judged ${String(result.semanticJudge.judgedCandidates)} of ${String(result.semanticJudge.candidatesConsidered)} candidates.` : "";
    const hasItemDetails = result.items.some((item) => publicItemDetails(item) !== undefined);
    const header = `${result.kind}: ${result.items.length} retained ${result.unit} (${result.partial ? "PARTIAL" : "complete"}). ${publicAnalysisLabel(result)}. ${result.counts ? `Counts: ${JSON.stringify(result.counts)}. ` : ""}${inlineTerms ? `Term counts: ${JSON.stringify(inlineTerms)}. ` : ""}${termsRequest ? `Term counts are paginated: ${JSON.stringify(termsRequest)}. ` : ""}Counts use ${result.unit}; they are not ordinary matching-line counts.${hasItemDetails ? " Structured output retains per-item evidence details." : ""}${semanticJudge}${scope}${coverage}${stats}`;
    const notice = result.reasons.length ? `
${result.reasons.map((reason) => `[${reason}]`).join(`
`)}` : "";
    const rows = [];
    let bytes = Buffer.byteLength(header + notice) + 1200;
    let next = offset;
    const appendItem = (index) => {
      const item = result.items[index];
      if (!item)
        throw new Error("Analysis item unavailable");
      const publicItem = publicAnalysisItem(result, item, index, stored.id, modelOutput);
      const inspect = publicItem.inspect;
      const exposeExcerpt = result.kind === "concept" || result.kind === "hybrid" && item.details?.source === "concept";
      const row = `#${index + 1} ${item.path}:${item.line} ${publicItem.label}${exposeExcerpt && item.excerpt ? `
${item.excerpt}` : ""}${inspect && !hybridInspectCursor ? `
Inspect: ${JSON.stringify(inspect)}` : ""}`;
      const rowBytes = Buffer.byteLength(row) + 2;
      if (bytes + rowBytes > MAX_RESULT_BYTES) {
        if (items.length === 0)
          throw new SiftlightError("Analysis item exceeds the response limit; narrow its source");
        return false;
      }
      rows.push(row);
      bytes += rowBytes;
      if (hybridInspectCursor) {
        const { inspect: _inspect, ...sharedPublicItem } = publicItem;
        const publicHybridItem = {
          ...sharedPublicItem,
          ...item.excerpt ? { excerpt: item.excerpt } : {}
        };
        if (item.source) {
          const sourceKey = JSON.stringify(item.source);
          let sourceId = sourceIds.get(sourceKey);
          if (sourceId === undefined) {
            sourceId = sources.length;
            sources.push(item.source);
            sourceIds.set(sourceKey, sourceId);
          }
          items.push({ ...publicHybridItem, sourceId });
        } else {
          items.push(publicHybridItem);
        }
      } else {
        items.push({
          ...item,
          label: publicItem.label,
          index: index + 1,
          ...inspect ? { inspect } : {}
        });
      }
      if (!hybridPreview)
        next = index + 1;
      return true;
    };
    if (hybridPreview) {
      for (const index of hybridPreviewIndices(result.items)) {
        if (items.length >= 30 || !appendItem(index))
          break;
      }
    } else {
      for (let index = offset;index < result.items.length && items.length < 30; index += 1) {
        if (!appendItem(index))
          break;
      }
    }
    const nextRequest = hybridMatchesRequest ?? (next < result.items.length ? {
      cursor: `${stored.id}.analysis.${next.toString(36)}`,
      ...result.redact ? { redact: true } : {}
    } : undefined);
    const text = [
      header + notice,
      ...rows,
      ...hybridInspectCursor ? [
        `Inspect item #N: ${JSON.stringify({ mode: "inspect", cursor: hybridInspectCursor, matchIndex: "N" })}`
      ] : [],
      ...nextRequest ? [`Next request: ${JSON.stringify(nextRequest)}`] : []
    ].join(`

`);
    if (Buffer.byteLength(text) > MAX_RESULT_BYTES)
      throw new SiftlightError("Analysis metadata exceeds the output limit");
    return {
      text,
      details: {
        version: 1,
        mode: result.kind === "concept" || result.kind === "hybrid" || result.kind === "structure" || result.kind === "files" || result.kind === "outline" || result.kind === "imports" || result.kind === "tests" ? result.kind : "matches",
        status: result.partial ? "partial" : "complete",
        snapshotComplete: !result.partial,
        totalMatches: result.items.length,
        storedMatches: result.items.length,
        returnedMatches: items.length,
        totalFiles: statistics.files,
        statistics,
        cursor: nextRequest?.cursor ?? `${stored.id}.analysis.0`,
        ...nextRequest ? { nextRequest } : {},
        analysis: {
          kind: result.kind,
          unit: result.unit,
          totalItems: result.items.length,
          returnedItems: items.length,
          ...modelOutput ? { modelOutput: true } : {},
          statistics,
          items,
          ...sources.length ? { sources } : {},
          reasons: result.reasons,
          ...result.semanticJudge ? { semanticJudge: result.semanticJudge } : {},
          ...result.filesRead !== undefined ? { filesRead: result.filesRead } : {},
          ...result.bytesRead !== undefined ? { bytesRead: result.bytesRead } : {},
          ...result.changes ? { changes: result.changes } : {},
          ...result.counts ? { counts: result.counts } : {},
          ...inlineTerms ? { termCounts: inlineTerms } : {},
          ...termsRequest ? { totalTerms: result.termCounts?.length ?? 0, termCountsNextRequest: termsRequest } : {},
          ...result.scope ? { scope: result.scope } : {},
          ...result.chunks !== undefined ? { chunks: result.chunks } : {},
          ...result.coverage ? { coverage: result.coverage } : {},
          ...result.stats ? { stats: result.stats } : {},
          ...result.sourceGeneration ? { sourceGeneration: result.sourceGeneration } : {},
          ...hybridMatchesRequest ? { matchesRequest: hybridMatchesRequest } : {},
          ...hybridInspectCursor ? { inspectCursor: hybridInspectCursor } : {}
        },
        ...result.scope ? { scope: result.scope } : {},
        ...result.redact ? { redactionRequested: true } : {}
      }
    };
  }
  #expire() {
    for (const [id, item] of this.#items)
      if (this.#now() - item.touched >= ANALYSIS_TTL_MS) {
        this.#items.delete(id);
        this.#rememberExpired(id);
      }
  }
  #totalBytes() {
    return [...this.#items.values()].reduce((n, item) => n + item.bytes, 0);
  }
  #totalItems() {
    return [...this.#items.values()].reduce((n, item) => n + item.result.items.length, 0);
  }
  #rememberExpired(id) {
    this.#expired.add(id);
    while (this.#expired.size > MAX_ANALYSIS_SNAPSHOTS * 4) {
      const oldest = this.#expired.values().next().value;
      if (oldest === undefined)
        break;
      this.#expired.delete(oldest);
    }
  }
}

// src/inspect.ts
import { resolve as resolve12 } from "node:path";
function resolveInspectionTarget(input, cwd, snapshots) {
  let path = input.path?.replace(/^@/, "");
  let line = input.line;
  let retainedMatch;
  if (input.matchIndex !== undefined) {
    if (!input.cursor)
      throw new SiftlightError("matchIndex requires a cursor when mode=inspect");
    if (input.path !== undefined || input.line !== undefined) {
      throw new SiftlightError("matchIndex replaces path and line when mode=inspect");
    }
    if (!Number.isSafeInteger(input.matchIndex) || input.matchIndex < 1) {
      throw new SiftlightError("matchIndex must be a positive integer when mode=inspect");
    }
    const { snapshot } = snapshots.resolve(input.cursor);
    retainedMatch = snapshot.matches[input.matchIndex - 1];
    if (!retainedMatch) {
      throw new CursorError(`matchIndex is ${snapshot.snapshotComplete ? "outside this snapshot" : "not retained in this partial snapshot"}.`);
    }
    path = retainedMatch.displayPath;
    line = retainedMatch.lineNumber;
  }
  if (!path)
    throw new SiftlightError("path is required when mode=inspect");
  if (line === undefined || !Number.isSafeInteger(line) || line < 1) {
    throw new SiftlightError("line must be a positive integer when mode=inspect");
  }
  const absolutePath = retainedMatch?.absolutePath ?? resolve12(cwd, path);
  new SearchPathPolicy(cwd).assertPath(absolutePath);
  let expectedRevision;
  if (input.cursor) {
    const { snapshot } = snapshots.resolve(input.cursor);
    retainedMatch ??= snapshot.matches.find((match) => match.absolutePath === absolutePath && match.lineNumber === line);
    if (!retainedMatch) {
      throw new CursorError("The requested line is not a retained match in this snapshot.");
    }
    expectedRevision = snapshot.sourceRevisions.get(absolutePath);
  }
  return {
    path,
    absolutePath,
    line,
    unverified: input.cursor !== undefined && expectedRevision === undefined,
    ...retainedMatch ? { retainedMatch } : {},
    ...expectedRevision ? { expectedRevision } : {}
  };
}

// src/evidence-candidates.ts
import { resolve as resolve13 } from "node:path";
class CandidateLimit extends SiftlightError {
}
function record2(value) {
  return typeof value === "object" && value !== null;
}
function integer(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function eventBytes(value) {
  if (record2(value) && typeof value.text === "string")
    return Buffer.from(value.text);
  if (record2(value) && typeof value.bytes === "string")
    return Buffer.from(value.bytes, "base64");
  throw new SiftlightError("Raw ripgrep event omitted source bytes");
}
function occurrenceInsideRanges(range, allowed, document) {
  return allowed.some((outer) => range.start >= outer.start && range.end <= outer.end && (range.end > range.start || range.start < outer.end || outer.end === document.bytes.length && document.bytes.at(-1) !== 10));
}
async function searchRawSource(cwd, document, request, budget, allowed, signal) {
  const occurrences = [];
  try {
    const result = await runOwnedProcess({
      executable: await resolveRipgrepExecutable(),
      args: [
        "--no-config",
        "--encoding",
        "none",
        "--json",
        "--line-number",
        "--color=never",
        ...patternArguments(request),
        "--",
        request.pattern,
        "-"
      ],
      cwd,
      input: document.bytes,
      ...signal ? { signal } : {}
    }, (stdout) => consumeCappedLines(stdout, (line) => {
      budget.protocolBytes += Buffer.byteLength(line);
      if (budget.protocolBytes > MAX_STRUCTURE_BYTES)
        throw new CandidateLimit("Raw candidate matching reached the 32 MiB protocol budget");
      let event;
      try {
        event = JSON.parse(line);
      } catch (error) {
        throw new SiftlightError("Invalid raw ripgrep JSON", { cause: error });
      }
      if (!record2(event) || event.type !== "match")
        return;
      const data = event.data;
      if (!record2(data) || !integer(data.absolute_offset) || !integer(data.line_number) || data.line_number < 1 || !Array.isArray(data.submatches))
        throw new SiftlightError("Invalid raw ripgrep match event");
      const start = data.absolute_offset;
      const bytes = eventBytes(data.lines);
      if (document.lineStarts[data.line_number - 1] !== start || start + bytes.length > document.bytes.length || !document.bytes.subarray(start, start + bytes.length).equals(bytes))
        throw new SiftlightError("Raw ripgrep evidence does not match its source version and line offset");
      for (const submatch of data.submatches) {
        if (!record2(submatch) || !integer(submatch.start) || !integer(submatch.end) || submatch.end < submatch.start || submatch.end > bytes.length || !bytes.subarray(submatch.start, submatch.end).equals(eventBytes(submatch.match)))
          throw new SiftlightError("Invalid raw ripgrep occurrence bounds or bytes");
        const range = { start: start + submatch.start, end: start + submatch.end };
        if (allowed && !occurrenceInsideRanges(range, allowed, document))
          continue;
        if (budget.retained >= MAX_ANALYSIS_RESULTS)
          throw new CandidateLimit(`Candidate matching reached the ${String(MAX_ANALYSIS_RESULTS)} occurrence limit`);
        budget.retained += 1;
        occurrences.push(range);
      }
    }, { maxLineBytes: MAX_PROTOCOL_LINE_BYTES }));
    if (result.code !== 0 && result.code !== 1)
      throw new SiftlightError(result.stderr.trim() || `Raw ripgrep exited ${String(result.code)}`);
  } catch (error) {
    if (!(error instanceof CandidateLimit))
      throw error;
    return { occurrences, reason: error.message };
  }
  return { occurrences };
}
async function ordinaryCandidates(options) {
  const scan = await options.runRipgrep(options.request, options.cwd, options.signal);
  if (options.signal?.aborted)
    throw abortError();
  const reasons = new Set;
  if (!scan.snapshotComplete) {
    reasons.add("Search retention is partial; only retained matching files can be analyzed");
    for (const reason of scan.retention?.reasons ?? [])
      reasons.add(reason);
  }
  const grouped = new Map;
  for (const match of scan.matches) {
    const existing = grouped.get(match.absolutePath);
    if (existing)
      existing.push(match);
    else
      grouped.set(match.absolutePath, [match]);
  }
  const files = [];
  let filesRead = 0;
  let bytesRead = 0;
  let retained = 0;
  const maxFiles = options.maxFiles ?? MAX_STRUCTURE_FILES;
  for (const [absolute, matches] of grouped) {
    if (options.signal?.aborted)
      throw abortError();
    const revision = scan.sourceRevisions.get(absolute);
    if (!revision) {
      reasons.add("Some matching files lack a verified search revision");
      continue;
    }
    if (filesRead >= maxFiles || bytesRead + revision.size > MAX_STRUCTURE_BYTES) {
      reasons.add(`Candidate analysis reached the ${String(maxFiles)}-file / 32 MiB source limit`);
      continue;
    }
    filesRead += 1;
    let document;
    try {
      document = await options.access.load(absolute);
    } catch (error) {
      if (error instanceof SourceDocumentError || error instanceof SourceBudgetError) {
        reasons.add(error.message);
        continue;
      }
      throw error;
    }
    bytesRead += document.bytes.length;
    if (document.reference.origin.kind !== "worktree" || !sameSourceRevision(revision, document.reference.origin.revision)) {
      reasons.add(`Source changed since search: ${document.path}`);
      continue;
    }
    if (document.bytes[0] === 255 && document.bytes[1] === 254 || document.bytes[0] === 254 && document.bytes[1] === 255) {
      reasons.add(`Transcoded search offsets cannot be bound to raw UTF-16 source: ${document.path}`);
      continue;
    }
    const utf8Bom = document.bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]));
    const occurrences = [];
    for (const match of matches) {
      const lineStart = document.lineStarts[match.lineNumber - 1];
      if (lineStart === undefined)
        throw new SiftlightError("Retained match line is outside its verified source");
      const base = lineStart + (utf8Bom && match.lineNumber === 1 ? 3 : 0);
      const lineEnd = document.lineStarts[match.lineNumber] ?? document.bytes.length;
      if (match.occurrences.length === 0)
        reasons.add("Some retained matches have no exact occurrence ranges");
      for (const occurrence of match.occurrences) {
        const range = { start: base + occurrence.byteStart, end: base + occurrence.byteEnd };
        document.checkRange(range);
        if (range.end > lineEnd)
          throw new SiftlightError("Retained occurrence extends beyond its verified source line");
        if (retained >= MAX_ANALYSIS_RESULTS) {
          reasons.add(`Candidate matching reached the ${String(MAX_ANALYSIS_RESULTS)} occurrence limit`);
          break;
        }
        retained += 1;
        occurrences.push(range);
      }
    }
    if (occurrences.length > 0)
      files.push({ document, occurrences });
  }
  return { files, partial: reasons.size > 0, reasons: [...reasons], filesRead, bytesRead };
}
async function collectEvidenceCandidates(options) {
  if (!options.changes)
    return ordinaryCandidates(options);
  if (options.request.path && !isPathInsideCwd(resolve13(options.cwd, options.request.path), options.cwd)) {
    throw new SiftlightError("Git changes for paths outside cwd are not supported; relaunch Pi from that repository or a common parent");
  }
  const reasons = new Set;
  const result = await readGitChanges(options.cwd, options.changes, options.signal, {
    filterPaths: async (paths) => {
      const selected = await filterHistoricalPaths(options.cwd, paths, options.request, options.signal);
      for (const reason of selected.reasons)
        reasons.add(reason);
      return { paths: selected.paths, bytesRead: selected.ignoreBytesRead };
    }
  });
  if (options.signal?.aborted)
    throw abortError();
  for (const reason of result.reasons)
    reasons.add(reason);
  const files = [];
  const budget = { retained: 0, protocolBytes: 0 };
  for (const file of result.files) {
    if (options.signal?.aborted)
      throw abortError();
    if (!file.content || !file.origin) {
      if (file.sourceStatus !== "absent")
        reasons.add(`${file.path}: ${file.reason ?? file.sourceStatus}`);
      continue;
    }
    const document = new SourceDocument({ path: file.path, origin: file.origin }, file.content);
    const changedRanges = file.changedRanges.map((range) => document.lineRange(range.startLine, range.endLine));
    if (options.changes.scope === "lines" && changedRanges.length === 0)
      continue;
    const matched = await searchRawSource(options.cwd, document, options.request, budget, options.changes.scope === "lines" ? changedRanges : undefined, options.signal);
    if (matched.reason)
      reasons.add(matched.reason);
    if (matched.occurrences.length > 0)
      files.push({
        document,
        occurrences: matched.occurrences,
        changedRanges,
        change: file.change
      });
    if (matched.reason) {
      reasons.add("Remaining Git candidate files were not searched after the matching limit");
      break;
    }
  }
  return {
    files,
    partial: reasons.size > 0,
    reasons: [...reasons],
    filesRead: result.filesRead,
    bytesRead: result.bytesRead,
    changes: { base: result.base, target: result.target, scope: result.scope, side: result.side }
  };
}

// src/import-model.ts
import { posix } from "node:path";
import { realpath as realpath4 } from "node:fs/promises";
import { relative as relative7, resolve as resolve14 } from "node:path";
class NavigationFailure extends Error {
  reason;
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}
function navigationPath(path) {
  const normalized = posix.normalize(path.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new SiftlightError("Navigation paths must stay inside the workspace");
  }
  return normalized.replace(/^\.\//, "");
}
function nodeText(facts, node) {
  const value = node === undefined ? undefined : facts.syntax.nodes[node] ?? facts.locations.get(node);
  return value ? facts.document.text.slice(value.start, value.end) : undefined;
}
function literalText(raw) {
  if (!raw || raw.length < 2)
    return;
  const quote = raw[0];
  if (quote !== "'" && quote !== '"' && quote !== "`" || raw.at(-1) !== quote || quote === "`" && raw.includes("${"))
    return;
  const body = raw.slice(1, -1);
  let result = "";
  for (let index = 0;index < body.length; index++) {
    const character = body[index];
    if (character !== "\\") {
      result += character;
      continue;
    }
    const escaped = body[++index];
    if (escaped === undefined)
      return;
    if (escaped === `
`)
      continue;
    if (escaped === "\r") {
      if (body[index + 1] === `
`)
        index++;
      continue;
    }
    const simple = {
      n: `
`,
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      v: "\v",
      "0": "\x00"
    };
    if (escaped in simple) {
      if (escaped === "0" && /[0-9]/.test(body[index + 1] ?? ""))
        return;
      result += simple[escaped];
      continue;
    }
    if (escaped === "x" || escaped === "u") {
      const brace = escaped === "u" && body[index + 1] === "{";
      const end = brace ? body.indexOf("}", index + 2) : index + (escaped === "x" ? 2 : 4) + 1;
      if (end < 0)
        return;
      const digits = body.slice(index + (brace ? 2 : 1), end);
      if (!/^[\da-fA-F]+$/.test(digits) || !brace && digits.length !== (escaped === "x" ? 2 : 4))
        return;
      const point = Number.parseInt(digits, 16);
      if (point > 1114111)
        return;
      result += String.fromCodePoint(point);
      index = brace ? end : end - 1;
      continue;
    }
    if (/[1-9]/.test(escaped))
      return;
    result += escaped;
  }
  return result;
}
function moduleRange(facts, node) {
  const value = facts.syntax.nodes[node] ?? facts.locations.get(node);
  if (!value)
    throw new Error("Missing syntax node");
  return {
    start: facts.document.toByteOffset(value.start),
    end: facts.document.toByteOffset(value.end)
  };
}
function nodeLine(facts, node) {
  return facts.document.lineAt(moduleRange(facts, node).start);
}
function descendants(syntax, node, kind) {
  const result = [];
  const pending = [...syntax.children[node] ?? []];
  while (pending.length) {
    const current = pending.pop();
    if (current === undefined)
      break;
    if (syntax.nodes[current]?.kind === kind)
      result.push(current);
    else
      pending.push(...syntax.children[current] ?? []);
  }
  return result.toSorted((a, b) => a - b);
}
function topLevel(syntax, node) {
  let parent = syntax.nodes[node]?.parent;
  while (parent !== null && parent !== undefined) {
    const kind = syntax.nodes[parent]?.kind;
    if (kind === "program")
      return true;
    if (kind !== "export_statement" && kind !== "lexical_declaration" && kind !== "variable_declaration" && kind !== "ambient_declaration")
      return false;
    parent = syntax.nodes[parent]?.parent;
  }
  return false;
}
function declaredNames(facts, root) {
  const names = [];
  const pending = [root];
  while (pending.length) {
    const id = pending.pop();
    if (id === undefined)
      break;
    const node = facts.syntax.nodes[id];
    if (!node || node.field === "type" || node.field === "right" || node.field === "key")
      continue;
    if (node.kind === "identifier" || node.kind === "shorthand_property_identifier_pattern") {
      const name = nodeText(facts, id);
      if (name)
        names.push(name);
    } else
      pending.push(...facts.syntax.children[id] ?? []);
  }
  return names;
}
function collectModuleFacts(document, syntax) {
  const facts = {
    document,
    syntax,
    imports: [],
    exports: [],
    declarations: new Map,
    locations: new Map
  };
  for (const symbol of syntax.symbols) {
    if (!topLevel(syntax, symbol.node))
      continue;
    if ([
      "arrow_function",
      "function_expression",
      "generator_function",
      "class",
      "variable_declarator"
    ].includes(symbol.kind))
      continue;
    const existing = facts.declarations.get(symbol.name) ?? [];
    if (!existing.includes(symbol.node))
      existing.push(symbol.node);
    facts.declarations.set(symbol.name, existing);
  }
  for (let id = 0;id < syntax.nodes.length; id++) {
    if (syntax.nodes[id]?.kind !== "variable_declarator" || !topLevel(syntax, id))
      continue;
    const binding = syntaxField(syntax, id, "name");
    if (binding === undefined)
      continue;
    for (const name of declaredNames(facts, binding)) {
      const existing = facts.declarations.get(name) ?? [];
      if (!existing.includes(id))
        existing.push(id);
      facts.declarations.set(name, existing);
    }
  }
  for (const [name, declarations] of facts.declarations) {
    const implementations = declarations.filter((id) => ["function_declaration", "generator_function_declaration"].includes(syntax.nodes[id]?.kind ?? ""));
    if (implementations.length === 1 && declarations.every((id) => id === implementations[0] || syntax.nodes[id]?.kind === "function_signature"))
      facts.declarations.set(name, implementations);
  }
  for (const statement of syntax.children[0] ?? []) {
    const node = syntax.nodes[statement];
    if (!node)
      continue;
    const source = literalText(nodeText(facts, syntaxField(syntax, statement, "source")));
    const children = syntax.children[statement] ?? [];
    if (node.kind === "import_statement") {
      const clause = children.find((child) => syntax.nodes[child]?.kind === "import_clause");
      const typeOnly = children.some((child) => syntax.nodes[child]?.kind === "type");
      if (clause === undefined) {
        facts.imports.push({
          statement,
          node: statement,
          source,
          imported: "*",
          kind: "side-effect",
          typeOnly
        });
        continue;
      }
      for (const child of syntax.children[clause] ?? []) {
        const kind = syntax.nodes[child]?.kind;
        if (kind === "identifier")
          facts.imports.push({
            statement,
            node: child,
            source,
            local: nodeText(facts, child) ?? "",
            imported: "default",
            kind: "default",
            typeOnly
          });
        if (kind === "namespace_import") {
          const local = (syntax.children[child] ?? []).find((part) => syntax.nodes[part]?.kind === "identifier");
          facts.imports.push({
            statement,
            node: child,
            source,
            local: nodeText(facts, local) ?? "",
            imported: "*",
            kind: "namespace",
            typeOnly
          });
        }
      }
      for (const specifier of descendants(syntax, clause, "import_specifier")) {
        const name = nodeText(facts, syntaxField(syntax, specifier, "name"));
        const imported = literalText(name) ?? name;
        if (imported === undefined)
          continue;
        const local = nodeText(facts, syntaxField(syntax, specifier, "alias")) ?? imported;
        facts.imports.push({
          statement,
          node: specifier,
          source,
          imported,
          local,
          kind: "named",
          typeOnly: typeOnly || (syntax.children[specifier] ?? []).some((part) => syntax.nodes[part]?.kind === "type")
        });
      }
    }
    if (node.kind !== "export_statement")
      continue;
    const isDefault = children.some((child) => syntax.nodes[child]?.kind === "default");
    const declaration = syntaxField(syntax, statement, "declaration");
    const value = syntaxField(syntax, statement, "value");
    if (isDefault && (declaration !== undefined || value !== undefined)) {
      const definition = declaration ?? value;
      if (definition !== undefined)
        facts.exports.push({
          statement,
          node: statement,
          exported: "default",
          definition,
          kind: "default"
        });
    } else if (declaration !== undefined) {
      for (const [name, declarations] of facts.declarations) {
        for (const definition of declarations) {
          const current = syntax.nodes[definition];
          const container = syntax.nodes[declaration];
          if (current && container && current.start >= container.start && current.end <= container.end)
            facts.exports.push({
              statement,
              node: definition,
              exported: name,
              local: name,
              definition,
              kind: "named"
            });
        }
      }
    }
    for (const specifier of descendants(syntax, statement, "export_specifier")) {
      const raw = nodeText(facts, syntaxField(syntax, specifier, "name"));
      const local = literalText(raw) ?? raw;
      if (local === undefined)
        continue;
      const alias = nodeText(facts, syntaxField(syntax, specifier, "alias"));
      const exported = literalText(alias) ?? alias ?? local;
      facts.exports.push({
        statement,
        node: specifier,
        exported,
        local,
        ...source !== undefined ? { source } : {},
        kind: "named"
      });
    }
    const namespace = children.find((child) => syntax.nodes[child]?.kind === "namespace_export");
    if (namespace !== undefined) {
      const name = (syntax.children[namespace] ?? []).find((child) => syntax.nodes[child]?.kind === "identifier");
      facts.exports.push({
        statement,
        node: namespace,
        exported: nodeText(facts, name) ?? "*",
        ...source !== undefined ? { source } : {},
        kind: "namespace"
      });
    } else if (children.some((child) => syntax.nodes[child]?.kind === "*")) {
      facts.exports.push({
        statement,
        node: statement,
        exported: "*",
        ...source !== undefined ? { source } : {},
        kind: "star"
      });
    }
  }
  const retained = new Set([
    0,
    ...syntax.symbols.map((symbol) => symbol.node),
    ...[...facts.declarations.values()].flat(),
    ...facts.imports.flatMap((binding) => [binding.node, binding.statement]),
    ...facts.exports.flatMap((binding) => [
      binding.node,
      binding.statement,
      ...binding.definition === undefined ? [] : [binding.definition]
    ])
  ]);
  for (const id of retained) {
    const node = syntax.nodes[id];
    if (node)
      facts.locations.set(id, { start: node.start, end: node.end, kind: node.kind });
  }
  return facts;
}
function navigationError(error) {
  if (typeof error === "object" && error !== null && "reason" in error && error.reason === "structural-read-budget-exhausted")
    return error.reason;
  if (error instanceof NavigationFailure)
    return error.reason;
  if (error instanceof SourceDocumentError)
    return error.reason;
  if (typeof error === "object" && error !== null && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EISDIR" || error.code === "EACCES"))
    return "source-unavailable";
  return;
}

class NavigationContext {
  host;
  modules = new Map;
  documents = new Map;
  reasons = new Set;
  bytesRead = 0;
  #files;
  #pathAliases = new Map;
  #fileLimit;
  #failures = new Map;
  #attempted = new Set;
  constructor(host, fileLimit = host.maxFilesToParse ?? MAX_STRUCTURE_FILES) {
    this.host = host;
    this.#fileLimit = fileLimit;
  }
  checkAbort() {
    if (this.host.signal?.aborted)
      throw abortError();
  }
  normalizePath(path) {
    const normalized = this.host.normalizePath?.(path) ?? navigationPath(path);
    return this.#pathAliases.get(normalized) ?? normalized;
  }
  async files() {
    this.checkAbort();
    if (this.#files)
      return this.#files;
    const listed = await this.host.listFiles();
    if (!Array.isArray(listed) && listed.partial)
      for (const reason of listed.reasons)
        this.reasons.add(reason);
    const paths = new Set;
    const canonicalCwd = await realpath4(this.host.cwd).catch(() => {
      return;
    });
    const normalizedPaths = (Array.isArray(listed) ? listed : listed.paths).map((path) => this.host.normalizePath?.(path) ?? navigationPath(path));
    const canonicalPaths = await Promise.all(normalizedPaths.map(async (normalized) => {
      try {
        const target = await realpath4(resolve14(this.host.cwd, normalized));
        const canonical = canonicalCwd !== undefined && isPathInsideRoot(target, canonicalCwd) ? relative7(canonicalCwd, target).replaceAll("\\", "/") : target.replaceAll("\\", "/");
        return [normalized, canonical];
      } catch {
        return [normalized, normalized];
      }
    }));
    for (const [normalized, canonical] of canonicalPaths) {
      this.#pathAliases.set(normalized, canonical);
      this.#pathAliases.set(canonical, canonical);
      paths.add(canonical);
    }
    this.#files = paths;
    return this.#files;
  }
  async module(path, retainSyntax = false) {
    this.checkAbort();
    path = this.normalizePath(path);
    const cached = this.modules.get(path);
    if (cached) {
      if (retainSyntax && cached.syntax.nodes.length === 0) {
        let retained = false;
        try {
          cached.syntax = await this.host.syntax(cached.document);
          if (cached.syntax.status !== "ok")
            throw new NavigationFailure(`syntax-${cached.syntax.status}`);
          retained = true;
        } finally {
          if (!retained)
            this.release(cached);
        }
      }
      return cached;
    }
    const failed = this.#failures.get(path);
    if (failed)
      throw new NavigationFailure(failed);
    if (!this.#attempted.has(path) && this.#attempted.size >= this.#fileLimit)
      throw new NavigationFailure("file-budget-exhausted");
    this.#attempted.add(path);
    const document = await this.host.load(path);
    this.documents.set(path, document);
    let facts;
    let retained = false;
    try {
      if (document.reference.origin.kind !== "worktree")
        throw new NavigationFailure("historical-navigation-unsupported");
      if (!document.utf8)
        throw new NavigationFailure("encoding");
      if (this.bytesRead + document.bytes.length > MAX_STRUCTURE_BYTES)
        throw new NavigationFailure("byte-budget-exhausted");
      this.bytesRead += document.bytes.length;
      const syntax = await this.host.syntax(document);
      if (syntax.language === "go" || syntax.status !== "ok") {
        const reason = syntax.language === "go" ? "language-unsupported" : `syntax-${syntax.status}`;
        this.#failures.set(path, reason);
        throw new NavigationFailure(reason);
      }
      facts = collectModuleFacts(document, syntax);
      this.modules.set(path, facts);
      retained = retainSyntax;
      return facts;
    } finally {
      if (!retained) {
        if (facts)
          this.release(facts);
        else
          this.host.releaseSyntax?.(document);
      }
    }
  }
  release(facts) {
    this.host.releaseSyntax?.(facts.document);
    const { language, status, limited } = facts.syntax;
    facts.syntax = {
      ...language ? { language } : {},
      status,
      limited,
      nodes: [],
      children: [],
      symbols: [],
      roles: [],
      diagnostics: []
    };
  }
  async verify() {
    const invalid = new Map;
    let exhausted = false;
    for (const [path, document] of this.documents) {
      this.checkAbort();
      if (exhausted) {
        invalid.set(path, "structural-read-budget-exhausted");
        continue;
      }
      try {
        await this.host.load(path, document.reference);
      } catch (error) {
        const reason = navigationError(error);
        if (!reason)
          throw error;
        invalid.set(path, reason);
        this.reasons.add(`${path}: ${reason}`);
        exhausted = reason === "structural-read-budget-exhausted";
      }
    }
    return invalid;
  }
  result(items) {
    return {
      items,
      partial: this.reasons.size > 0,
      reasons: [...this.reasons],
      filesRead: this.#attempted.size,
      bytesRead: this.bytesRead
    };
  }
}

// src/import-resolution.ts
import { posix as posix2 } from "node:path";
var EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
var STATIC_MODULE_RESOLUTION = "Exact relative path; extensionless source and index candidates (.ts/.tsx/.js/.jsx/.mts/.cts/.mjs/.cjs); .js→.ts/.tsx, .jsx→.tsx, .mjs→.mts, .cjs→.cts source candidates. Every existing candidate is considered; multiple candidates are ambiguous. No configuration is executed.";
async function resolveStaticModule(context, from, specifier) {
  context.checkAbort();
  from = context.normalizePath(from);
  if (specifier === undefined)
    return { reason: "nonliteral-module-specifier" };
  if (!specifier.startsWith("./") && !specifier.startsWith("../"))
    return { reason: "external-package-or-path-alias-unsupported" };
  if (specifier.includes("\\") || specifier.includes("\x00") || /[?#]/.test(specifier))
    return { reason: "module-specifier-unsupported" };
  const joined = posix2.normalize(posix2.join(posix2.dirname(from), specifier));
  let path;
  try {
    path = context.normalizePath(joined);
  } catch (error) {
    if (error instanceof SiftlightError)
      return { reason: "outside-workspace" };
    throw error;
  }
  const candidates = new Set([path]);
  const extension = posix2.extname(path);
  if (!extension) {
    for (const suffix of EXTENSIONS) {
      candidates.add(context.normalizePath(`${path}${suffix}`));
      candidates.add(context.normalizePath(posix2.join(path, `index${suffix}`)));
    }
  } else {
    const mappings = {
      ".js": [".ts", ".tsx"],
      ".jsx": [".tsx"],
      ".mjs": [".mts"],
      ".cjs": [".cts"]
    };
    for (const suffix of mappings[extension] ?? [])
      candidates.add(context.normalizePath(path.slice(0, -extension.length) + suffix));
  }
  const files = await context.files();
  const existing = [...candidates].filter((candidate) => files.has(candidate)).toSorted();
  if (existing.length === 0)
    return { reason: "missing-or-excluded-module", candidates: [...candidates] };
  if (existing.length > 1)
    return { reason: "ambiguous-module-candidates", candidates: existing };
  const unique = existing[0];
  if (unique === undefined)
    throw new Error("Missing unique module candidate");
  return { path: unique };
}
function declaration(facts, node, name) {
  return {
    source: facts.document.reference,
    line: nodeLine(facts, node),
    range: moduleRange(facts, node),
    name,
    kind: facts.locations.get(node)?.kind ?? "unknown"
  };
}
async function traceImport(context, initial, binding) {
  const chain = [];
  const visited = new Set;
  const paths = new Set([initial.document.path]);
  let hops = 0;
  const unresolved = (reason, candidates) => ({
    status: "unresolved",
    reason,
    chain,
    ...candidates ? { candidates } : {}
  });
  const visit = (facts, name) => {
    const key = JSON.stringify([facts.document.path, name]);
    if (visited.has(key))
      throw new NavigationFailure("circular-re-export");
    visited.add(key);
  };
  const followModule = async (facts, source, step) => {
    if (hops >= MAX_IMPORT_HOPS)
      return unresolved("hop-budget-exhausted");
    hops++;
    chain.push(step);
    const resolved = await resolveStaticModule(context, facts.document.path, source);
    if (!resolved.path)
      return unresolved(resolved.reason ?? "module-unresolved", resolved.candidates);
    paths.add(resolved.path);
    if (paths.size > MAX_IMPORT_FILES)
      return unresolved("file-budget-exhausted");
    const next = await context.module(resolved.path);
    step.to = next.document.reference;
    step.resolution = "static-source-candidates";
    return next;
  };
  const followImport = async (facts, current) => {
    const next = await followModule(facts, current.source, {
      from: facts.document.reference,
      line: nodeLine(facts, current.statement),
      range: moduleRange(facts, current.statement),
      kind: "import",
      ...current.source !== undefined ? { specifier: current.source } : {},
      imported: current.imported,
      ...current.local !== undefined ? { local: current.local } : {}
    });
    if (!("document" in next))
      return next;
    if (current.kind === "namespace" || current.kind === "side-effect")
      return { status: "module", chain, module: next.document.reference };
    return followExportName(next, current.imported);
  };
  const followLocal = async (facts, name) => {
    const imported = facts.imports.filter((current) => current.local === name);
    const declared = facts.declarations.get(name) ?? [];
    if (imported.length + declared.length > 1)
      return unresolved("ambiguous-local-binding");
    if (imported[0])
      return followImport(facts, imported[0]);
    if (declared[0] !== undefined)
      return { status: "resolved", chain, destination: declaration(facts, declared[0], name) };
    return unresolved("local-binding-unresolved");
  };
  const followExport = async (facts, current) => {
    if (current.kind === "star")
      return unresolved("export-star-unsupported");
    if (current.definition !== undefined)
      return {
        status: "resolved",
        chain,
        destination: declaration(facts, current.definition, current.exported)
      };
    const step = {
      from: facts.document.reference,
      line: nodeLine(facts, current.statement),
      range: moduleRange(facts, current.statement),
      kind: current.source !== undefined ? "re-export" : "local-export",
      exported: current.exported,
      ...current.local !== undefined ? { local: current.local, imported: current.local } : {},
      ...current.source !== undefined ? { specifier: current.source } : {}
    };
    if (current.source !== undefined) {
      const next = await followModule(facts, current.source, step);
      if (!("document" in next))
        return next;
      if (current.kind === "namespace")
        return { status: "module", chain, module: next.document.reference };
      if (current.local === undefined)
        return unresolved("export-binding-unresolved");
      return followExportName(next, current.local);
    }
    chain.push(step);
    if (current.local === undefined)
      return unresolved("export-binding-unresolved");
    return followLocal(facts, current.local);
  };
  const followExportName = async (facts, name) => {
    visit(facts, name);
    const exported = facts.exports.filter((current) => current.exported === name && current.kind !== "star");
    if (exported.length > 1)
      return unresolved("ambiguous-export-binding");
    if (!exported[0])
      return unresolved(facts.exports.some((current) => current.kind === "star") ? "export-star-unsupported" : "export-not-found");
    return followExport(facts, exported[0]);
  };
  try {
    if ("imported" in binding)
      return await followImport(initial, binding);
    visit(initial, binding.exported);
    return await followExport(initial, binding);
  } catch (error) {
    const reason = navigationError(error);
    if (!reason)
      throw error;
    return unresolved(reason);
  }
}
function tracePaths(trace) {
  const paths = trace.chain.flatMap((step) => [step.from.path, ...step.to ? [step.to.path] : []]);
  if (trace.destination)
    paths.push(trace.destination.source.path);
  if (trace.module)
    paths.push(trace.module.path);
  return [...new Set(paths)];
}
function importStatementExcerpt(facts, statement) {
  const text = nodeText(facts, statement) ?? "";
  return text.length > 500 ? `${text.slice(0, 500)}… [statement excerpt truncated]` : text;
}

// src/import-navigation.ts
async function navigateImports(host, input) {
  if (input.line !== undefined && (!Number.isSafeInteger(input.line) || input.line < 1))
    throw new SiftlightError("Navigation line must be a positive integer");
  if (input.symbol !== undefined && input.symbol.trim().length === 0)
    throw new SiftlightError("Navigation symbol must be nonempty");
  const context = new NavigationContext(host, MAX_IMPORT_FILES);
  let facts;
  try {
    facts = await context.module(input.path);
  } catch (error) {
    const reason = navigationError(error);
    if (!reason)
      throw error;
    context.reasons.add(reason);
    return context.result([]);
  }
  const entries = [...facts.imports, ...facts.exports].filter((binding) => {
    if (input.line !== undefined) {
      const range = moduleRange(facts, binding.statement);
      if (input.line < facts.document.lineAt(range.start) || input.line > facts.document.lineAt(Math.max(range.start, range.end - 1)))
        return false;
    }
    return input.symbol === undefined || binding.local === input.symbol || ("imported" in binding ? binding.imported === input.symbol : binding.exported === input.symbol);
  });
  const items = [];
  const affected = [];
  for (const binding of entries) {
    context.checkAbort();
    const trace = await traceImport(context, facts, binding);
    const name = "imported" in binding ? binding.local ?? binding.imported : binding.exported;
    items.push({
      path: facts.document.path,
      line: nodeLine(facts, binding.statement),
      source: facts.document.reference,
      range: moduleRange(facts, binding.statement),
      excerpt: importStatementExcerpt(facts, binding.statement),
      label: `Static import/re-export path: ${name} (${trace.status}${trace.reason ? `: ${trace.reason}` : ""})`,
      details: { kind: "import", ...trace, resolutionPolicy: STATIC_MODULE_RESOLUTION }
    });
    affected.push([facts.document.path, ...tracePaths(trace)]);
    if (trace.status === "unresolved")
      context.reasons.add(trace.reason ?? "import-unresolved");
  }
  if (entries.length === 0)
    context.reasons.add("no-static-import-export-at-target");
  const invalid = await context.verify();
  for (let index = 0;index < items.length; index++) {
    const item = items[index];
    const reason = affected[index]?.map((path) => invalid.get(path)).find((value) => value !== undefined);
    if (!item || reason === undefined)
      continue;
    item.label = `Static import/re-export path invalidated: ${reason}`;
    item.details = {
      ...item.details,
      status: "unresolved",
      reason,
      destination: undefined,
      module: undefined
    };
  }
  return context.result(items);
}

// src/test-navigation.ts
import { posix as posix3 } from "node:path";

// src/test-navigation-facts.ts
var FUNCTIONS = new Set([
  "function_declaration",
  "function_expression",
  "generator_function_declaration",
  "generator_function",
  "arrow_function",
  "method_definition"
]);
var SCOPES = new Set([
  ...FUNCTIONS,
  "program",
  "statement_block",
  "catch_clause",
  "for_statement",
  "for_in_statement",
  "class_body"
]);
var TEST_NAMES = new Set(["test", "it", "describe"]);
var FRAMEWORKS = new Map([
  ["node:test", "node:test"],
  ["bun:test", "bun:test"],
  ["vitest", "Vitest"],
  ["@jest/globals", "Jest"]
]);
function nearestScope(facts, node, functionOnly = false) {
  let current = node;
  while (current !== null && current !== undefined) {
    const value = facts.syntax.nodes[current];
    if (!value)
      break;
    if (functionOnly ? FUNCTIONS.has(value.kind) || value.kind === "program" : SCOPES.has(value.kind))
      return current;
    current = value.parent;
  }
  return 0;
}
function patternIdentifiers(facts, root) {
  if (root === undefined)
    return [];
  const output = [];
  const pending = [root];
  while (pending.length) {
    const id = pending.pop();
    if (id === undefined)
      break;
    const node = facts.syntax.nodes[id];
    if (!node || node.field === "type" || node.field === "value" && facts.syntax.nodes[node.parent ?? -1]?.kind !== "pair_pattern" || node.field === "right" || node.field === "key" || node.kind === "type_annotation")
      continue;
    if (node.kind === "identifier" || node.kind === "shorthand_property_identifier_pattern")
      output.push(id);
    else
      pending.push(...facts.syntax.children[id] ?? []);
  }
  return output;
}

class TestBindings {
  facts;
  #bindings = new Map;
  #declarations = new Set;
  constructor(facts) {
    this.facts = facts;
    const add = (ids, scope) => {
      for (const node of ids) {
        this.#declarations.add(node);
        const name = nodeText(facts, node) ?? "";
        const values = this.#bindings.get(name) ?? [];
        values.push({ name, node, scope });
        this.#bindings.set(name, values);
      }
    };
    for (let id = 0;id < facts.syntax.nodes.length; id++) {
      const node = facts.syntax.nodes[id];
      if (!node)
        continue;
      if (node.kind === "variable_declarator") {
        const parent = node.parent === null ? undefined : facts.syntax.nodes[node.parent];
        add(patternIdentifiers(facts, syntaxField(facts.syntax, id, "name")), nearestScope(facts, node.parent, parent?.kind === "variable_declaration"));
      }
      if (FUNCTIONS.has(node.kind)) {
        add(patternIdentifiers(facts, syntaxField(facts.syntax, id, "parameters") ?? syntaxField(facts.syntax, id, "parameter")), id);
        const name = syntaxField(facts.syntax, id, "name");
        if (name !== undefined && node.kind !== "method_definition")
          add([name], node.kind.endsWith("declaration") ? nearestScope(facts, node.parent) : id);
      }
      if (node.kind === "class_declaration" || node.kind === "class") {
        const name = syntaxField(facts.syntax, id, "name");
        if (name !== undefined)
          add([name], node.kind === "class_declaration" ? nearestScope(facts, node.parent) : id);
      }
      if (node.kind === "catch_clause")
        add(patternIdentifiers(facts, syntaxField(facts.syntax, id, "parameter")), id);
    }
  }
  shadowed(name, occurrence) {
    const local = this.#bindings.get(name);
    if (!local?.length)
      return false;
    const ancestors = new Set;
    let current = occurrence;
    while (current !== null) {
      ancestors.add(current);
      current = this.facts.syntax.nodes[current]?.parent ?? null;
    }
    return local.some((binding) => ancestors.has(binding.scope));
  }
  isReference(node) {
    const value = this.facts.syntax.nodes[node];
    if (!value || this.#declarations.has(node) || !["identifier", "shorthand_property_identifier"].includes(value.kind))
      return false;
    let current = value.parent;
    while (current !== null) {
      const ancestor = this.facts.syntax.nodes[current];
      if (!ancestor)
        break;
      if ([
        "import_statement",
        "export_statement",
        "type_annotation",
        "type_arguments",
        "type_parameters",
        "type_alias_declaration",
        "interface_declaration"
      ].includes(ancestor.kind))
        return false;
      current = ancestor.parent;
    }
    return true;
  }
}
function callee(facts, node) {
  if (node === undefined)
    return;
  const value = facts.syntax.nodes[node];
  if (!value)
    return;
  if (value.kind === "identifier")
    return { root: nodeText(facts, node) ?? "", rootNode: node, properties: [] };
  if (value.kind !== "member_expression")
    return;
  const object = callee(facts, syntaxField(facts.syntax, node, "object"));
  const property = syntaxField(facts.syntax, node, "property");
  if (!object || property === undefined || facts.syntax.nodes[property]?.kind !== "property_identifier")
    return;
  return { ...object, properties: [...object.properties, nodeText(facts, property) ?? ""] };
}
function collectTestCases(facts, bindings) {
  const cases = [];
  for (let id = 0;id < facts.syntax.nodes.length; id++) {
    if (facts.syntax.nodes[id]?.kind !== "call_expression")
      continue;
    const call = callee(facts, syntaxField(facts.syntax, id, "function"));
    if (!call)
      continue;
    const imported = facts.imports.find((binding) => binding.local === call.root);
    const properties = [...call.properties];
    let kind = call.root;
    let framework;
    const notes = [];
    if (imported && !imported.typeOnly && !bindings.shadowed(call.root, call.rootNode)) {
      framework = FRAMEWORKS.get(imported.source ?? "");
      if (imported.kind === "namespace")
        kind = properties.shift() ?? "";
      else if (imported.kind === "default" && imported.source === "node:test")
        kind = "test";
      else
        kind = imported.imported;
    } else if (imported)
      notes.push("test-binding-shadowed-or-type-only");
    if (!TEST_NAMES.has(kind))
      continue;
    if (!framework)
      notes.push("framework-binding-unresolved");
    const modifiers = properties.filter((property) => property === "skip" || property === "only");
    if (modifiers.length !== properties.length || modifiers.length > 1)
      notes.push("parameterized-or-custom-test-wrapper-unsupported");
    const argumentsNode = syntaxField(facts.syntax, id, "arguments");
    const argumentsList = argumentsNode === undefined ? [] : (facts.syntax.children[argumentsNode] ?? []).filter((child) => facts.syntax.nodes[child]?.named && facts.syntax.nodes[child]?.kind !== "comment");
    const nameNode = argumentsList[0];
    const nameKind = nameNode === undefined ? undefined : facts.syntax.nodes[nameNode]?.kind;
    const name = nameKind === "string" || nameKind === "template_string" ? literalText(nodeText(facts, nameNode)) : undefined;
    if (name === undefined)
      notes.push("dynamic-or-missing-test-name");
    const last = argumentsList.at(-1);
    const callback = last !== undefined && ["arrow_function", "function_expression", "generator_function"].includes(facts.syntax.nodes[last]?.kind ?? "") ? last : undefined;
    if (callback === undefined)
      notes.push("explicit-test-callback-unavailable");
    const supportedArguments = argumentsList.length === 2 || argumentsList.length === 3 && facts.syntax.nodes[argumentsList[1] ?? -1]?.kind === "object";
    if (!supportedArguments)
      notes.push("test-arguments-unsupported");
    cases.push({
      node: id,
      ...name !== undefined ? { name } : {},
      ...callback !== undefined ? { callback } : {},
      ...framework !== undefined ? { framework } : {},
      testKind: kind,
      modifiers,
      status: notes.length === 0 ? "recognized" : "syntax-candidate",
      notes
    });
  }
  return cases;
}

// src/test-navigation.ts
var SOURCE_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
var TEST_FILENAME = /(?:^|\/)(?:__tests__|tests?)(?:\/|$)|(?:^|\/)[^/]+\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/i;
var TEST_DISCOVERY_PATTERN = String.raw`\b(?:describe|it|test)\s*\(|\b(?:from\s*|require\s*\(\s*)["'](?:node:test|bun:test|vitest|@jest/globals)["']`;
function isLikelyTestPath(path) {
  return TEST_FILENAME.test(path);
}
function basenameStem(path) {
  return posix3.basename(path).replace(SOURCE_EXTENSION, "").replace(/\.(?:test|spec)$/i, "");
}
function targetSymbol(facts, input) {
  if (input.line === undefined && input.symbol === undefined)
    return;
  const symbols = facts.syntax.symbols.filter((symbol) => {
    if (!symbol.hasBody)
      return false;
    if (input.symbol !== undefined && symbol.name !== input.symbol)
      return false;
    const start = facts.document.lineAt(facts.document.toByteOffset(symbol.start));
    const end = facts.document.lineAt(Math.max(facts.document.toByteOffset(symbol.start), facts.document.toByteOffset(symbol.end) - 1));
    return input.line === undefined || start <= input.line && input.line <= end;
  }).toSorted((a, b) => a.end - a.start - (b.end - b.start));
  if (symbols.length === 0)
    throw new SiftlightError("Test navigation target does not identify an implemented function/method");
  if (input.line === undefined && symbols.length > 1)
    throw new SiftlightError("Test navigation symbol is ambiguous; include its source line");
  const symbol = symbols[0];
  if (!symbol)
    throw new Error("Missing selected test target symbol");
  let carrier = symbol.node;
  let parent = facts.syntax.nodes[carrier]?.parent;
  while (parent !== null && parent !== undefined && [
    "parenthesized_expression",
    "as_expression",
    "satisfies_expression",
    "type_assertion",
    "non_null_expression"
  ].includes(facts.syntax.nodes[parent]?.kind ?? "")) {
    carrier = parent;
    parent = facts.syntax.nodes[carrier]?.parent;
  }
  const directBinding = parent !== null && parent !== undefined && facts.syntax.nodes[parent]?.kind === "variable_declarator" && syntaxField(facts.syntax, parent, "value") === carrier ? moduleRange(facts, parent) : undefined;
  return { ...symbol, ...directBinding ? { directBinding } : {} };
}
function traceTargetsSymbol(context, trace, target, symbol) {
  if (!symbol)
    return trace.status === "resolved" || trace.status === "module";
  const destination = trace.destination;
  if (trace.status !== "resolved" || !destination || context.normalizePath(destination.source.path) !== context.normalizePath(target.document.path))
    return false;
  const start = target.document.toByteOffset(symbol.start);
  const end = target.document.toByteOffset(symbol.end);
  return destination.range.start === start && destination.range.end === end || destination.kind === "variable_declarator" && symbol.directBinding !== undefined && destination.range.start === symbol.directBinding.start && destination.range.end === symbol.directBinding.end;
}
async function relations(context, test, target, symbol) {
  const output = [];
  for (const binding of test.imports) {
    if (!binding.source?.startsWith("."))
      continue;
    const resolved = await resolveStaticModule(context, test.document.path, binding.source);
    const targetPath = context.normalizePath(target.document.path);
    const direct = resolved.path === targetPath;
    const trace = await traceImport(context, test, binding);
    if (trace.reason === "structural-read-budget-exhausted") {
      context.reasons.add(trace.reason);
      break;
    }
    const paths = tracePaths(trace).map((path) => context.normalizePath(path));
    const indirect = !direct && paths.includes(targetPath) && trace.status !== "unresolved";
    if (!direct && !indirect) {
      if (trace.reason && [
        "hop-budget-exhausted",
        "file-budget-exhausted",
        "byte-budget-exhausted",
        "source-changed",
        "syntax-timeout",
        "syntax-limit"
      ].includes(trace.reason))
        context.reasons.add(`${test.document.path}: ${trace.reason}`);
      continue;
    }
    output.push({
      association: direct ? "direct" : "indirect",
      binding,
      trace,
      reason: direct ? "static-import-target-module" : "static-import-re-export-path-to-target",
      targetBinding: !binding.typeOnly && traceTargetsSymbol(context, trace, target, symbol),
      paths: [...new Set([context.normalizePath(test.document.path), targetPath, ...paths])]
    });
  }
  if (output.length)
    return output;
  const stem = basenameStem(target.document.path);
  const nameSimilar = basenameStem(test.document.path) === stem;
  const textSimilar = symbol ? test.document.text.includes(symbol.name) : stem.length > 0 && test.document.text.includes(stem);
  if (nameSimilar || textSimilar)
    output.push({
      association: "weak",
      reason: nameSimilar ? "filename-similarity-only" : "source-text-similarity-only",
      targetBinding: false,
      paths: [
        context.normalizePath(test.document.path),
        context.normalizePath(target.document.path)
      ]
    });
  return output;
}
function usesInCases(facts, bindings, cases, related) {
  const names = new Set(related.filter((relation) => relation.targetBinding && relation.binding?.local).map((relation) => relation.binding?.local));
  const uses = new Map;
  const callbacks = new Map(cases.flatMap((test) => test.callback === undefined ? [] : [[test.callback, test]]));
  const owners = [];
  for (let id = 0;id < facts.syntax.nodes.length; id++) {
    const node = facts.syntax.nodes[id];
    if (!node)
      continue;
    const test = callbacks.get(id) ?? (node.parent === null ? undefined : owners[node.parent]);
    owners[id] = test;
    const callback = test?.callback === undefined ? undefined : facts.syntax.nodes[test.callback];
    if (!test || !callback)
      continue;
    const name = nodeText(facts, id);
    if (!name || !names.has(name) || !bindings.isReference(id) || bindings.shadowed(name, id))
      continue;
    let excerptNode = id;
    let parent = node.parent;
    while (parent !== null) {
      const value = facts.syntax.nodes[parent];
      if (!value || value.start < callback.start || value.end > callback.end)
        break;
      excerptNode = parent;
      if (value.kind === "expression_statement" || value.kind === "return_statement" || value.kind === "variable_declarator")
        break;
      parent = value.parent;
    }
    const text = nodeText(facts, excerptNode) ?? name;
    const evidence = uses.get(test.node) ?? [];
    evidence.push({
      path: facts.document.path,
      line: nodeLine(facts, id),
      range: moduleRange(facts, id),
      binding: name,
      excerpt: text.length > 500 ? `${text.slice(0, 500)}…` : text,
      excerptTruncated: text.length > 500
    });
    uses.set(test.node, evidence);
  }
  return uses;
}
function relationDetails(facts, relation) {
  return {
    association: relation.association,
    reason: relation.reason,
    ...relation.binding ? {
      imported: relation.binding.imported,
      local: relation.binding.local,
      typeOnly: relation.binding.typeOnly,
      importLine: nodeLine(facts, relation.binding.statement),
      importRange: moduleRange(facts, relation.binding.statement),
      importExcerpt: importStatementExcerpt(facts, relation.binding.statement)
    } : {},
    ...relation.trace ? {
      chain: relation.trace.chain,
      importStatus: relation.trace.status,
      importReason: relation.trace.reason
    } : {},
    targetBindingProven: relation.targetBinding
  };
}
async function findRelatedTests(host, input, options = {}) {
  const started = performance.now();
  if (input.line !== undefined && (!Number.isSafeInteger(input.line) || input.line < 1))
    throw new SiftlightError("Test target line must be a positive integer");
  if (input.symbol !== undefined && input.symbol.trim().length === 0)
    throw new SiftlightError("Test target symbol must be nonempty");
  const context = new NavigationContext(host);
  let target;
  try {
    target = await context.module(input.path, true);
  } catch (error) {
    const reason = navigationError(error);
    if (!reason)
      throw error;
    context.reasons.add(reason);
    return context.result([]);
  }
  let symbol;
  try {
    symbol = targetSymbol(target, input);
  } finally {
    context.release(target);
  }
  const allFiles = [...await context.files()];
  const selectedEntries = options.entryPaths ? new Set(options.entryPaths.map((path) => context.normalizePath(path))) : undefined;
  const targetPath = context.normalizePath(target.document.path);
  const eligibleEntries = allFiles.filter((path) => path !== targetPath && SOURCE_EXTENSION.test(path));
  const files = allFiles.filter((path) => path !== targetPath && SOURCE_EXTENSION.test(path) && (!selectedEntries || selectedEntries.has(path))).toSorted((a, b) => Number(TEST_FILENAME.test(b)) - Number(TEST_FILENAME.test(a)) || a.localeCompare(b));
  const items = [];
  const affected = [];
  let serializedBytes = 0;
  const append = (item, dependencies) => {
    const bytes = Buffer.byteLength(JSON.stringify(item));
    if (serializedBytes + bytes > MAX_ANALYSIS_STORAGE_BYTES || items.length >= MAX_ANALYSIS_RESULTS) {
      context.reasons.add(serializedBytes + bytes > MAX_ANALYSIS_STORAGE_BYTES ? "serialized-result-budget-exhausted" : "result-item-budget-exhausted");
      return false;
    }
    serializedBytes += bytes;
    items.push(item);
    affected.push(dependencies);
    return true;
  };
  for (const path of files) {
    context.checkAbort();
    let facts;
    try {
      facts = await context.module(path, true);
    } catch (error) {
      const reason = navigationError(error);
      if (!reason)
        throw error;
      context.reasons.add(`${path}: ${reason}`);
      if (reason === "file-budget-exhausted" || reason === "byte-budget-exhausted" || reason === "structural-read-budget-exhausted")
        break;
      continue;
    }
    try {
      const bindings = new TestBindings(facts);
      const cases = collectTestCases(facts, bindings);
      const filename = TEST_FILENAME.test(path);
      const frameworkImport = facts.imports.some((binding) => ["node:test", "bun:test", "vitest", "@jest/globals"].includes(binding.source ?? ""));
      if (!filename && !frameworkImport && cases.length === 0)
        continue;
      const related = await relations(context, facts, target, symbol);
      if (context.reasons.has("structural-read-budget-exhausted"))
        break;
      if (!related.length)
        continue;
      const association = related.some((relation) => relation.association === "direct") ? "direct" : related.some((relation) => relation.association === "indirect") ? "indirect" : "weak";
      const dependencies = [...new Set(related.flatMap((relation) => relation.paths))];
      const usesByCase = usesInCases(facts, bindings, cases, related);
      const relationIndices = [];
      for (const relation of related) {
        const node = relation.binding?.statement ?? 0;
        const item = {
          path,
          line: nodeLine(facts, node),
          label: `${relation.association} related test module: ${relation.reason}`,
          source: facts.document.reference,
          range: moduleRange(facts, node),
          ...relation.binding ? { excerpt: importStatementExcerpt(facts, relation.binding.statement) } : {},
          details: {
            kind: "test-relation",
            target: target.document.reference,
            ...relationDetails(facts, relation),
            execution: "not-run",
            assertionCoverage: "not-evaluated"
          }
        };
        if (!append(item, dependencies))
          break;
        relationIndices.push(items.length);
      }
      if (context.reasons.has("result-item-budget-exhausted") || context.reasons.has("serialized-result-budget-exhausted"))
        break;
      const selections = cases.length ? cases : [undefined];
      for (const test of selections) {
        if (items.length >= MAX_ANALYSIS_RESULTS) {
          context.reasons.add("result-item-budget-exhausted");
          break;
        }
        const uses = test ? usesByCase.get(test.node) ?? [] : [];
        const notes = [
          ...test?.notes ?? ["no-statically-readable-test-case"],
          ...uses.length === 0 ? ["no-target-binding-use-in-case"] : []
        ];
        const node = test?.node ?? related.find((relation) => relation.binding)?.binding?.statement ?? 0;
        const range = moduleRange(facts, node);
        const testName = test?.name;
        const label = `${association} related test candidate: ${testName ?? (test ? "<dynamic or unavailable name>" : path)}`;
        const caseId = JSON.stringify([path, range.start]);
        const item = {
          path,
          line: nodeLine(facts, node),
          label,
          source: facts.document.reference,
          range,
          ...uses[0] ? { excerpt: uses[0].excerpt } : {},
          details: {
            kind: "test-case",
            caseId,
            association,
            status: test?.status ?? "syntax-candidate",
            target: target.document.reference,
            ...symbol ? { targetSymbol: { name: symbol.name, range: moduleRange(target, symbol.node) } } : {},
            ...test ? {
              test: {
                ...testName !== undefined ? { name: testName } : {},
                framework: test.framework,
                kind: test.testKind,
                modifiers: test.modifiers,
                range
              }
            } : {},
            relationItems: {
              first: relationIndices[0],
              last: relationIndices.at(-1),
              count: relationIndices.length
            },
            useCount: uses.length,
            notes,
            assertionCoverage: "not-evaluated",
            execution: "not-run"
          }
        };
        if (!append(item, dependencies))
          break;
        const caseIndex = items.length;
        for (const use of uses) {
          const evidence = {
            path,
            line: use.line,
            label: `Static binding use in test candidate: ${testName ?? "<dynamic or unavailable name>"}`,
            source: facts.document.reference,
            range: use.range,
            excerpt: use.excerpt,
            details: {
              kind: "test-use",
              caseId,
              caseIndex,
              association,
              target: target.document.reference,
              binding: use.binding,
              excerptTruncated: use.excerptTruncated,
              execution: "not-run",
              assertionCoverage: "not-evaluated"
            }
          };
          if (!append(evidence, dependencies))
            break;
        }
        if (context.reasons.has("result-item-budget-exhausted") || context.reasons.has("serialized-result-budget-exhausted"))
          break;
      }
      if (context.reasons.has("result-item-budget-exhausted") || context.reasons.has("serialized-result-budget-exhausted"))
        break;
    } finally {
      context.release(facts);
    }
  }
  const invalid = await context.verify();
  for (let index = 0;index < items.length; index++) {
    const item = items[index];
    const reason = affected[index]?.map((path) => invalid.get(path)).find((value) => value !== undefined);
    if (!item || reason === undefined)
      continue;
    item.label = `Related test candidate invalidated: ${reason}`;
    item.details = {
      ...item.details,
      status: "invalidated",
      reason,
      association: "unresolved",
      uses: []
    };
  }
  return {
    ...context.result(items),
    counts: {
      candidateFiles: new Set(items.map((item) => item.path)).size,
      testCases: items.filter((item) => item.details.kind === "test-case").length,
      useSites: items.filter((item) => item.details.kind === "test-use").length,
      moduleRelations: items.filter((item) => item.details.kind === "test-relation").length
    },
    stats: {
      filesParsed: context.modules.size,
      filesSkipped: Math.max(0, eligibleEntries.length - files.length),
      parseMs: Math.round(performance.now() - started),
      budgetExhausted: [...context.reasons].some((reason) => reason.includes("budget-exhausted"))
    }
  };
}

// src/literal-search.ts
function escapeRegexLiteral(term) {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function literalOccurrences(document, term, allowed) {
  const needle = Buffer.from(term);
  const found = [];
  for (let start = document.bytes.indexOf(needle);start >= 0; start = document.bytes.indexOf(needle, start + Math.max(1, needle.length))) {
    const range = { start, end: start + needle.length };
    if (!allowed || allowed.some((part) => part.start <= range.start && range.end <= part.end))
      found.push(range);
  }
  return found;
}

// src/multi-term-search.ts
function validateAnyOf(value) {
  if (value === undefined)
    return;
  if (!Array.isArray(value) || value.length < MIN_ANY_OF_TERMS || value.length > MAX_ANY_OF_TOTAL_TERMS || value.some((term) => typeof term !== "string" || term.length === 0 || !term.isWellFormed() || /[\r\n\0]/.test(term) || Buffer.byteLength(term) > MAX_LITERAL_TERM_BYTES) || new Set(value).size !== value.length) {
    throw new SiftlightError(`anyOf requires ${String(MIN_ANY_OF_TERMS)}–${String(MAX_ANY_OF_TOTAL_TERMS)} distinct, nonempty, well-formed, single-line literal terms of at most ${String(MAX_LITERAL_TERM_BYTES)} UTF-8 bytes; requests above ${String(MAX_ANY_OF_TERMS)} terms are safely chunked`);
  }
  return value;
}
function expandMultiTermCandidates(files, terms, changedLinesOnly) {
  const items = [];
  const reasons = new Set;
  const orderedFiles = files.toSorted((left, right) => left.document.path.localeCompare(right.document.path));
  for (const file of orderedFiles) {
    if (!file.document.utf8) {
      reasons.add(`${file.document.path}: exact multi-term evidence requires lossless UTF-8 source`);
    }
  }
  let serializedBytes = 0;
  let exhausted = false;
  for (let termIndex = 0;termIndex < terms.length && !exhausted; termIndex++) {
    const term = terms[termIndex];
    if (term === undefined)
      throw new Error("Missing validated anyOf term");
    for (const file of orderedFiles) {
      if (!file.document.utf8)
        continue;
      const allowed = changedLinesOnly ? file.changedRanges : undefined;
      for (const range of literalOccurrences(file.document, term, allowed)) {
        const match = sourceEvidence(file.document, range);
        const item = {
          path: file.document.path,
          line: match.line,
          label: `Exact literal occurrence for ${JSON.stringify(term)}`,
          excerpt: match.excerpt,
          source: file.document.reference,
          range,
          details: {
            kind: "literal-term",
            term,
            termIndex,
            excerptRange: match.excerptRange,
            excerptTruncated: match.excerptTruncated
          },
          termIndex
        };
        const itemBytes = Buffer.byteLength(JSON.stringify(item)) + 1;
        if (items.length >= MAX_ANALYSIS_RESULTS || serializedBytes + itemBytes >= MAX_ANALYSIS_STORAGE_BYTES - ANALYSIS_METADATA_RESERVE_BYTES) {
          reasons.add("Exact multi-term retention reached the 50,000-item / 32 MiB analysis limit");
          exhausted = true;
          break;
        }
        items.push(item);
        serializedBytes += itemBytes;
      }
      if (exhausted)
        break;
    }
  }
  return {
    items: items.map(({ termIndex: _termIndex, ...item }) => item),
    partial: reasons.size > 0,
    reasons: [...reasons]
  };
}
function retainedTermCounts(terms, items) {
  const counts = new Map(terms.map((term) => [term, 0]));
  for (const item of items) {
    const term = item.details?.term;
    if (typeof term === "string" && counts.has(term))
      counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return terms.map((term) => ({ term, retainedOccurrences: counts.get(term) ?? 0 }));
}

// src/owned-parallel.ts
async function runOwnedParallel(start, parent) {
  const controller = new AbortController;
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  const operations = start(signal).map(async (operation) => {
    try {
      return await operation;
    } catch (error) {
      controller.abort();
      throw error;
    }
  });
  try {
    return await Promise.all(operations);
  } catch (error) {
    await Promise.allSettled(operations);
    throw error;
  }
}

// src/file-discovery.ts
import { basename as platformBasename, posix as posix4, relative as relative8, resolve as resolve16, sep as sep4 } from "node:path";

// src/file-metadata-filter.ts
import { resolve as resolve15 } from "node:path";
async function filterPathsByModificationTime(cwd, paths, modifiedAfterMs, modifiedBeforeMs, signal) {
  if (modifiedAfterMs === undefined && modifiedBeforeMs === undefined)
    return { paths: [...paths], partial: false, reasons: [] };
  const retained = [];
  const reasons = new Set;
  for (let offset = 0;offset < paths.length; offset += MAX_SOURCE_REVISION_CONCURRENCY) {
    if (signal?.aborted)
      throw abortError();
    const batch = paths.slice(offset, offset + MAX_SOURCE_REVISION_CONCURRENCY);
    const revisions = await Promise.all(batch.map(async (path) => {
      const revision = await getSourceRevision(resolve15(cwd, path));
      return revision ? { path, revision } : { path };
    }));
    for (const { path, revision } of revisions) {
      if (!revision) {
        reasons.add(`Modification time unavailable for ${path}; it was excluded from the filtered set`);
        continue;
      }
      if (matchesModificationTime(revision, modifiedAfterMs, modifiedBeforeMs))
        retained.push(path);
    }
  }
  return { paths: retained, partial: reasons.size > 0, reasons: [...reasons] };
}

// src/file-discovery.ts
var graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
var FILE_QUERY_GLOB_WILDCARD = /[*?]/u;
function subsequenceScore(text, query) {
  const characters = Array.from(graphemes.segment(text), (item) => item.segment);
  const queryCharacters = Array.from(graphemes.segment(query), (item) => item.segment);
  let next = 0;
  let first = -1;
  let last = 0;
  for (const character of queryCharacters) {
    const index = characters.indexOf(character, next);
    if (index < 0)
      return;
    if (first < 0)
      first = index;
    last = index;
    next = index + 1;
  }
  return Math.round(40 * queryCharacters.length / Math.max(1, last - first + 1));
}
function scoreFilePath(path, query) {
  if (!query)
    return { score: 0, reason: "all admitted files" };
  const normalized = path.toLowerCase();
  const needle = query.toLowerCase();
  const basename = posix4.basename(normalized);
  if (basename === needle)
    return { score: 100, reason: "exact filename" };
  if (basename.slice(0, basename.length - posix4.extname(basename).length) === needle)
    return { score: 95, reason: "exact filename stem" };
  if (basename.includes(needle))
    return { score: 85, reason: "filename substring" };
  if (normalized.includes(needle))
    return { score: 70, reason: "path substring" };
  const terms = needle.trim().split(/\s+/);
  if (terms.length > 1) {
    return terms.every((term) => normalized.includes(term)) ? { score: 60, reason: "all query words occur literally in the path" } : undefined;
  }
  const scores = terms.map((term) => subsequenceScore(normalized, term));
  if (scores.some((score) => score === undefined))
    return;
  return {
    score: Math.min(...scores.map((score) => score ?? 0)),
    reason: "ordered fuzzy path characters; candidate, not an exact filename"
  };
}
function pathRelativeToDiscoveryRoot(cwd, root, path) {
  const absoluteRoot = resolve16(cwd, root);
  const absolutePath = resolve16(cwd, path);
  const scoped = relative8(absoluteRoot, absolutePath).split(sep4).join("/");
  return scoped || platformBasename(absolutePath);
}
async function discoverFiles(input, cwd, signal) {
  const query = input.query ?? "";
  if (query.length > 256 || !query.isWellFormed() || /[\r\n\0]/.test(query))
    throw new SiftlightError("File query must be well-formed single-line text of at most 256 characters");
  if (FILE_QUERY_GLOB_WILDCARD.test(query))
    throw new SiftlightError(`File query ${JSON.stringify(query)} uses glob wildcards; mode=files matches filename and path text, not glob patterns. Omit query to retain every file under path, or use glob to filter by name pattern.`);
  const request = normalizeRequest({ ...input, pattern: "" });
  const policy = new SearchPathPolicy(cwd);
  const discoveryRoot = request.path ?? ".";
  const scoringRoot = await policy.resolveSearchTarget(discoveryRoot);
  const files = await listWorkspaceFiles(cwd, signal, {
    path: scoringRoot,
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden
  });
  const filtered = await filterPathsByModificationTime(cwd, files.paths, request.modifiedAfterMs, request.modifiedBeforeMs, signal);
  const selected = filtered.paths.flatMap((path) => {
    const rank = scoreFilePath(pathRelativeToDiscoveryRoot(cwd, scoringRoot, path), query);
    return rank ? [{ path, ...rank }] : [];
  }).toSorted((left, right) => right.score - left.score || left.path.localeCompare(right.path));
  for (let offset = 0;offset < selected.length; offset += 16) {
    await Promise.all(selected.slice(offset, offset + 16).map((item) => policy.assertExistingPath(item.path)));
    signal?.throwIfAborted();
  }
  return {
    kind: "files",
    unit: "files",
    partial: files.partial || filtered.partial,
    reasons: [...new Set([...files.reasons, ...filtered.reasons])],
    items: selected.map((item) => ({
      path: item.path,
      line: 1,
      label: `File candidate (${item.reason})`,
      details: {
        kind: "file",
        score: item.score,
        rankingReason: item.reason,
        inspect: { mode: "inspect", path: item.path, line: 1 }
      }
    })),
    coverage: { fileEnumeration: files.partial || filtered.partial ? "partial" : "complete" },
    stats: { filesEnumerated: files.paths.length },
    scope: {
      path: request.path ?? ".",
      requestedPath: request.path ?? ".",
      glob: request.glob,
      exclude: request.exclude,
      hidden: request.hidden,
      ignorePolicy: request.ignorePolicy ?? "respect",
      expandedToProjectRoot: false,
      assertion: request.path && request.path !== "." ? "requested-scope" : "project-wide",
      ...request.modifiedAfterMs !== undefined ? { modifiedAfterMs: request.modifiedAfterMs } : {},
      ...request.modifiedBeforeMs !== undefined ? { modifiedBeforeMs: request.modifiedBeforeMs } : {}
    },
    redact: input.redact ?? false
  };
}

// src/source-continuations.ts
import { randomUUID as randomUUID3 } from "node:crypto";

// src/source-pages.ts
function mergeByteRanges(ranges) {
  const merged = [];
  for (const range of ranges.toSorted((a, b) => a.start - b.start || a.end - b.end)) {
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end < range.start) {
      throw new SiftlightError("Invalid source range");
    }
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end)
      previous.end = Math.max(previous.end, range.end);
    else
      merged.push({ start: range.start, end: range.end });
  }
  return merged;
}
function subtractByteRange(ranges, returned) {
  const remaining = [];
  for (const range of ranges) {
    if (returned.end <= range.start || returned.start >= range.end) {
      remaining.push({ start: range.start, end: range.end });
      continue;
    }
    if (range.start < returned.start)
      remaining.push({ start: range.start, end: returned.start });
    if (returned.end < range.end)
      remaining.push({ start: returned.end, end: range.end });
  }
  return remaining;
}
function utf8Boundary(document, offset, direction) {
  let byte = Math.max(0, Math.min(document.bytes.length, offset));
  while (byte > 0 && byte < document.bytes.length) {
    const value = document.bytes[byte];
    if (value === undefined || (value & 192) !== 128)
      break;
    byte += direction;
  }
  return byte;
}
function renderSourceFragment(fragment) {
  const header = `[source bytes ${String(fragment.start)}..${String(fragment.end)}; ${String(fragment.startPosition.line)}:${String(fragment.startPosition.column)}–${String(fragment.endPosition.line)}:${String(fragment.endPosition.column)}; UTF-8, end exclusive]`;
  const lines = fragment.text.split(`
`);
  return [
    header,
    ...lines.map((text, index) => `${String(fragment.startPosition.line + index)}: ${text}`)
  ].join(`
`);
}
function sourcePage(document, ranges, maxBytes, focus) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 256) {
    throw new SiftlightError("Source page budget must allow at least 256 bytes");
  }
  const gaps = mergeByteRanges(ranges);
  const range = gaps.find((item) => focus !== undefined && item.start <= focus && focus < item.end) ?? gaps[0];
  if (!range)
    throw new SiftlightError("Source range is already complete");
  document.checkRange(range);
  document.toCharacterOffset(range.start);
  document.toCharacterOffset(range.end);
  const target = Math.max(range.start, Math.min(range.end, focus ?? range.start));
  let available = Math.max(4, maxBytes - 160);
  for (;; ) {
    let start = range.start;
    if (range.end - range.start > available && target - range.start > available / 2) {
      start = utf8Boundary(document, Math.floor(target - available / 2), 1);
    }
    start = Math.max(range.start, start);
    let end = utf8Boundary(document, Math.min(range.end, start + available), -1);
    if (end <= start && range.end > range.start)
      end = utf8Boundary(document, start + 1, 1);
    const fragment = {
      start,
      end,
      text: document.slice({ start, end }),
      startPosition: document.positionAt(start),
      endPosition: document.positionAt(end)
    };
    const text = renderSourceFragment(fragment);
    if (Buffer.byteLength(text) <= maxBytes) {
      return {
        fragment,
        remaining: subtractByteRange(gaps, fragment).filter((gap) => gap.start < gap.end),
        text
      };
    }
    if (available <= 4)
      throw new SiftlightError("Source metadata exceeds the page budget");
    available = Math.max(4, Math.floor(available * 0.75));
  }
}

// src/source-continuations.ts
class SourceContinuations {
  #items = new Map;
  #now;
  constructor(now = Date.now) {
    this.#now = now;
  }
  create(source, target, gaps, boundary) {
    this.#sweep();
    const item = {
      id: randomUUID3(),
      source: structuredClone(source),
      target: mergeByteRanges(target),
      gaps: mergeByteRanges(gaps),
      ...boundary ? { boundary } : {},
      accessed: this.#now(),
      issued: new Set([0])
    };
    if (item.gaps.length === 0 || item.gaps.some((gap) => gap.start === gap.end || !item.target.some((range) => range.start <= gap.start && gap.end <= range.end))) {
      throw new CursorError("Source continuation requires missing ranges inside its target");
    }
    this.#items.set(item.id, item);
    while (this.#items.size > MAX_SOURCE_CONTINUATIONS || Buffer.byteLength(JSON.stringify([...this.#items.values()].map((continuation) => Object.assign({
      id: continuation.id,
      source: continuation.source,
      target: continuation.target,
      gaps: continuation.gaps,
      accessed: continuation.accessed,
      issued: [...continuation.issued]
    }, continuation.boundary ? { boundary: continuation.boundary } : {})))) > MAX_SOURCE_CONTINUATION_BYTES) {
      let oldest;
      for (const candidate of this.#items.values()) {
        if (!oldest || candidate.accessed < oldest.accessed)
          oldest = candidate;
      }
      if (!oldest)
        break;
      this.#items.delete(oldest.id);
    }
    if (!this.#items.has(item.id))
      throw new CursorError("Source continuation metadata exceeds its limit");
    return `${item.id}.source.0`;
  }
  resolve(cursor) {
    const { item, consumed } = this.#resolve(cursor);
    return {
      source: structuredClone(item.source),
      target: item.target.map((range) => ({ ...range })),
      remaining: this.#remaining(item, consumed),
      ...item.boundary ? { boundary: item.boundary } : {}
    };
  }
  advance(cursor, returned) {
    const { item, consumed } = this.#resolve(cursor);
    const remaining = this.#remaining(item, consumed);
    const first = remaining[0];
    if (!first || returned.start !== first.start || returned.end <= returned.start || returned.end > first.end) {
      throw new CursorError("Source continuation must advance along its next missing range");
    }
    const next = consumed + returned.end - returned.start;
    item.issued.add(next);
    return this.#remaining(item, next).length > 0 ? `${item.id}.source.${next.toString(36)}` : undefined;
  }
  clear() {
    this.#items.clear();
  }
  #resolve(cursor) {
    this.#sweep();
    const match = /^([0-9a-f-]+)\.source\.([0-9a-z]+)$/.exec(cursor);
    if (!match?.[1] || !match[2])
      throw new CursorError("Invalid source continuation cursor");
    const item = this.#items.get(match[1]);
    if (!item)
      throw new CursorError("Source continuation expired or was evicted; inspect again");
    const consumed = Number.parseInt(match[2], 36);
    const length = item.gaps.reduce((sum, range) => sum + range.end - range.start, 0);
    if (!Number.isSafeInteger(consumed) || consumed < 0 || consumed >= length || !item.issued.has(consumed)) {
      throw new CursorError("Source continuation offset is outside its missing ranges");
    }
    item.accessed = this.#now();
    return { item, consumed };
  }
  #remaining(item, consumed) {
    let left = consumed;
    let ranges = item.gaps.map((range) => ({ ...range }));
    for (const range of item.gaps) {
      if (left === 0)
        break;
      const take = Math.min(left, range.end - range.start);
      ranges = subtractByteRange(ranges, { start: range.start, end: range.start + take });
      left -= take;
    }
    return ranges;
  }
  #sweep() {
    const cutoff = this.#now() - ANALYSIS_TTL_MS;
    for (const item of this.#items.values())
      if (item.accessed < cutoff)
        this.#items.delete(item.id);
  }
}

// src/source-inspection.ts
import { resolve as resolve17 } from "node:path";
function usesDocumentLineWindow(path) {
  return /\.(?:md|markdown)$/iu.test(path);
}
function hasBareCarriageReturn(bytes) {
  for (let index = 0;index < bytes.length; index += 1)
    if (bytes[index] === 13 && bytes[index + 1] !== 10)
      return true;
  return false;
}
function matchInspectionTarget(target) {
  return {
    path: target.path,
    line: target.line,
    unverified: target.unverified,
    ...target.expectedRevision ? { expectedRevision: target.expectedRevision } : {},
    ...target.retainedMatch?.occurrences[0] ? { focus: target.retainedMatch.occurrences[0].byteStart } : {}
  };
}
function errorStatus(error) {
  if (error instanceof SourceDocumentError)
    return error.reason === "encoding" ? "source-unavailable" : error.reason;
  if (error instanceof Error && "code" in error && ["ENOENT", "EACCES", "EPERM", "EISDIR", "ENOTDIR"].includes(String(error.code)))
    return "source-unavailable";
  return;
}
async function prepare(target, access, structure) {
  if (target.unverified)
    throw new SourceDocumentError("source-unavailable", "Snapshot source revision is unverified; refresh the search");
  const document = await access.load(target.path, target.reference);
  if (target.expectedRevision && (document.reference.origin.kind !== "worktree" || !sameSourceRevision(target.expectedRevision, document.reference.origin.revision)))
    throw new SourceDocumentError("source-changed", "Source changed; refresh the search");
  if (target.line > document.lineStarts.length)
    throw new SourceDocumentError("source-unavailable", `Source line ${target.line} is beyond the end of the file`);
  const lineRange = document.lineRange(target.line);
  const focus = target.range?.start ?? target.absoluteFocus ?? Math.min(lineRange.end, lineRange.start + (target.focus ?? 0));
  let range = target.range;
  let details = { status: "no-symbol" };
  const language = syntaxLanguage(document.path);
  if (document.utf8 && language && language !== "go") {
    const syntax = await access.syntax(document);
    details = {
      status: syntax.status === "ok" ? "no-symbol" : syntax.status === "unsupported" ? "provider-unavailable" : "parse-error",
      provider: "tree-sitter",
      language
    };
    if (syntax.status === "ok") {
      const character = document.toCharacterOffset(focus);
      const symbols = syntax.symbols.filter((symbol) => symbol.hasBody && symbol.start <= character && character < symbol.end).toSorted((a, b) => a.end - a.start - (b.end - b.start));
      const symbol = symbols[0] ?? syntax.symbols.find((item) => item.hasBody && document.lineAt(document.toByteOffset(item.start)) === target.line);
      if (symbol && !target.range) {
        range = {
          start: document.toByteOffset(symbol.start),
          end: document.toByteOffset(symbol.end)
        };
        const lines = {
          startLine: document.lineAt(range.start),
          endLine: document.lineAt(Math.max(range.start, range.end - 1))
        };
        details = {
          status: "available",
          provider: "tree-sitter",
          language,
          range: lines,
          symbol: {
            name: symbol.name,
            kind: symbol.kind,
            scope: symbol.scope ? [symbol.scope] : [],
            range: lines
          }
        };
      }
    }
  } else if (document.utf8 && structure && document.reference.origin.kind === "worktree" && !target.range && !usesDocumentLineWindow(document.path)) {
    const result = await structure.inspect({
      absolutePath: resolve17(access.cwd, target.path),
      cwd: access.cwd,
      line: target.line,
      expectedRevision: document.reference.origin.revision
    }, access.signal);
    details = result.details;
    if (["source-changed", "source-unavailable", "file-too-large"].includes(details.status))
      throw new SourceDocumentError(details.status === "source-changed" ? "source-changed" : "source-unavailable", `Source inspection: ${details.status}`);
    if (details.range)
      range = document.lineRange(details.range.startLine, Math.min(details.range.endLine, document.lineStarts.length));
  } else if (usesDocumentLineWindow(document.path)) {
    details = { status: "no-symbol" };
  } else {
    details = { status: "provider-unavailable", ...language ? { language } : {} };
  }
  range ??= document.lineRange(Math.max(1, target.line - 10), Math.min(document.lineStarts.length, target.line + 10));
  const boundary = target.range ? "requested-range" : details.status === "available" && details.range ? "syntax" : "line-window";
  document.checkRange(range);
  return { target, document, range, structure: details, boundary, focus };
}
function boundaryNote(block) {
  if (block.boundary === "line-window" || block.boundary === "mixed") {
    const fallback = block.prepared.find((prepared) => prepared.boundary === "line-window");
    const status = fallback?.structure.status;
    const provider = fallback?.structure.provider;
    const diagnostic = status === "no-symbol" && provider === undefined ? "" : status ? " (" + status + (provider ? " via " + provider : "") + ")" : "";
    return "; syntax boundary unavailable" + diagnostic + "; bounded line window";
  }
  return block.boundary === "requested-range" ? "; requested range; syntax boundary not inferred" : "";
}
function blockDetails(block) {
  const starts = block.fragments.map((fragment) => fragment.start);
  const ends = block.fragments.map((fragment) => fragment.end);
  const start = starts.length > 0 ? Math.min(...starts) : block.ranges[0]?.start ?? 0;
  const end = ends.length > 0 ? Math.max(...ends) : start;
  const nextRequest = block.continuation ? { mode: "inspect", sourceCursor: block.continuation } : undefined;
  return {
    range: {
      startLine: block.document.lineAt(start),
      endLine: block.document.lineAt(Math.max(start, end - 1))
    },
    omittedBefore: block.remaining.filter((range) => range.end <= start).reduce((n, range) => n + block.document.lineAt(range.end) - block.document.lineAt(range.start), 0),
    omittedAfter: block.remaining.filter((range) => range.start >= end).reduce((n, range) => n + block.document.lineAt(range.end) - block.document.lineAt(range.start), 0),
    truncatedLines: [],
    reference: block.document.reference,
    targetRanges: block.ranges,
    fragments: block.fragments,
    remainingRanges: block.remaining,
    complete: block.document.utf8 && block.remaining.length === 0,
    ...block.boundary ? { boundary: block.boundary } : {},
    ...nextRequest ? { nextRequest } : {}
  };
}
function render(items, blocks, single) {
  const rows = items.map((item) => `Target #${item.inputIndex} ${item.path ?? ""}:${item.line ?? ""}: ${item.status}${item.block ? `; Block #${item.block}` : ""}${item.structure && !(item.structure.status === "no-symbol" && item.structure.provider === undefined) ? ` [structure: ${item.structure.status}${item.structure.provider ? ` via ${item.structure.provider}` : ""}${item.structure.reason ? `; ${item.structure.reason}` : ""}]` : ""}${item.structure?.symbol ? ` ${item.structure.symbol.name} (${item.structure.symbol.kind}) lines ${item.structure.symbol.range.startLine}-${item.structure.symbol.range.endLine}` : ""}${item.error ? `; ${item.error}` : ""}${item.retry ? `
Retry: ${JSON.stringify(item.retry)}` : ""}`);
  const sourceRows = blocks.map((block, index) => {
    const origin = block.document.reference.origin.kind === "git" ? "commit " + block.document.reference.origin.commit + "; blob " + block.document.reference.origin.blob : "source sha256 " + block.document.reference.origin.contentHash;
    const completeness = block.remaining.length ? "PARTIAL; missing byte ranges " + JSON.stringify(block.remaining) : "complete for selected range";
    const next = block.continuation ? `
Next request: ` + JSON.stringify({ mode: "inspect", sourceCursor: block.continuation }) : "";
    return "[Block #" + String(index + 1) + "] " + block.document.path + "; " + origin + `
` + block.text.join(`
`) + `
[source ` + completeness + boundaryNote(block) + "; shared 16384-byte output limit]" + next;
  });
  return [
    single ? "Source inspection (Inspection metadata)" : `Batch inspection (Inspection metadata): ${items.filter((item) => item.status === "returned").length} of ${items.length} targets returned; overlapping ranges merged before the shared 16384-byte budget.`,
    ...rows,
    ...sourceRows
  ].join(`

`);
}
function blockBoundary(block) {
  const boundaries = [...new Set(block.prepared.map((prepared) => prepared.boundary))];
  if (boundaries.length === 1)
    return boundaries[0];
  return boundaries.length > 1 ? "mixed" : undefined;
}
function fallbackContinuationRange(document, ranges) {
  const last = ranges.at(-1);
  if (!last || last.end >= document.bytes.length)
    return;
  const nextStartLine = document.lineAt(last.end);
  const nextFocusLine = Math.min(document.lineStarts.length, nextStartLine + 10);
  if (nextFocusLine <= nextStartLine)
    return;
  return document.lineRange(nextStartLine, Math.min(document.lineStarts.length, nextFocusLine + 10));
}
function metadataStructure(details) {
  return {
    status: details.status,
    ...details.provider ? { provider: details.provider } : {},
    ...details.language ? { language: details.language } : {},
    ...details.range ? { range: details.range } : {}
  };
}
async function sourceDocumentIsCurrent(document, access) {
  if (document.reference.origin.kind !== "worktree")
    return true;
  const current = await getSourceRevision(resolve17(access.cwd, document.path));
  return current !== undefined && sameSourceRevision(current, document.reference.origin.revision);
}
async function inspectDocumentsMetadata(targets, access, structure) {
  const items = [];
  const paths = new Set;
  const preparedTargets = [];
  for (const [index, target] of targets.entries()) {
    try {
      const prepared = await prepare(target, access, structure);
      paths.add(prepared.document.path);
      preparedTargets.push({ itemIndex: items.length, document: prepared.document });
      items.push({
        inputIndex: index + 1,
        path: target.path,
        line: target.line,
        status: "returned",
        ...target.matchIndex !== undefined ? { matchIndex: target.matchIndex } : {},
        structure: metadataStructure(prepared.structure)
      });
    } catch (error) {
      if (access.signal?.aborted || error instanceof Error && error.name === "AbortError")
        throw abortError();
      const status = errorStatus(error);
      if (!status)
        throw error;
      items.push({
        inputIndex: index + 1,
        path: target.path,
        line: target.line,
        status: "error",
        structure: { status },
        error: error instanceof Error ? error.message : `inspection unavailable (${status})`
      });
    }
  }
  const preparedByPath = new Map;
  for (const prepared of preparedTargets) {
    const entries = preparedByPath.get(prepared.document.path) ?? [];
    entries.push(prepared);
    preparedByPath.set(prepared.document.path, entries);
  }
  for (const entries of preparedByPath.values()) {
    const first = entries[0];
    if (!first)
      continue;
    const firstOrigin = first.document.reference.origin;
    const revisionsDiffer = firstOrigin.kind === "worktree" && entries.some(({ document }) => {
      const origin = document.reference.origin;
      return origin.kind !== "worktree" || !sameSourceRevision(origin.revision, firstOrigin.revision);
    });
    const changed = revisionsDiffer || !await sourceDocumentIsCurrent(first.document, access);
    if (!changed)
      continue;
    for (const { itemIndex } of entries) {
      const item = items[itemIndex];
      if (!item)
        continue;
      item.status = "error";
      item.structure = { status: "source-changed" };
      item.error = "Source changed during inspection; refresh the source";
    }
  }
  const complete = items.every((item) => item.status === "returned");
  const lines = [
    `Inspection metadata (${complete ? "complete" : "PARTIAL"}; ${String(targets.length)} target(s); ${String(paths.size)} file(s)).`,
    ...items.map((item) => `#${String(item.inputIndex)} ${item.path ?? "[unknown path]"}:${String(item.line ?? "?")} — ${item.status}${item.structure?.status ? `; structure=${item.structure.status}` : ""}${item.structure?.language ? `; language=${item.structure.language}` : ""}${item.error ? `; ${item.error}` : ""}`)
  ];
  const first = items[0];
  return {
    text: lines.join(`

`),
    details: {
      version: 1,
      mode: "inspect",
      status: complete ? "complete" : "partial",
      snapshotComplete: complete,
      totalMatches: 0,
      storedMatches: 0,
      returnedMatches: 0,
      totalFiles: paths.size,
      inspections: items,
      ...targets.length === 1 && first?.structure ? { structure: metadataStructure(first.structure) } : {}
    }
  };
}
async function inspectDocuments(targets, access, continuations, structure) {
  const items = [];
  const blocks = [];
  let metadataOnly = false;
  for (const [index, target] of targets.entries()) {
    try {
      const prepared = await prepare(target, access, structure);
      metadataOnly ||= !prepared.document.utf8 || hasBareCarriageReturn(prepared.document.bytes);
      let blockIndex = blocks.findIndex((block) => block.document === prepared.document);
      if (blockIndex < 0) {
        blockIndex = blocks.length;
        blocks.push({
          document: prepared.document,
          ranges: [],
          targets: [],
          prepared: [],
          fragments: [],
          remaining: [],
          text: [],
          boundary: undefined
        });
      }
      const block = blocks[blockIndex];
      if (!block)
        throw new Error("Inspection block is unavailable");
      block.ranges.push(prepared.range);
      block.targets.push(index);
      block.prepared.push(prepared);
      items.push({
        inputIndex: index + 1,
        path: target.path,
        line: target.line,
        status: "returned",
        ...target.matchIndex !== undefined ? { matchIndex: target.matchIndex } : {},
        block: blockIndex + 1,
        structure: prepared.structure
      });
    } catch (error) {
      if (access.signal?.aborted || error instanceof Error && error.name === "AbortError")
        throw abortError();
      const status = errorStatus(error);
      if (!status)
        throw error;
      items.push({
        inputIndex: index + 1,
        path: target.path,
        line: target.line,
        status: "error",
        structure: { status },
        error: error instanceof Error ? error.message : status
      });
    }
  }
  if (metadataOnly)
    return inspectDocumentsMetadata(targets, access, structure);
  for (const block of blocks) {
    block.ranges = mergeByteRanges(block.ranges);
    block.remaining = block.ranges;
    block.boundary = blockBoundary(block);
  }
  const baseBytes = Buffer.byteLength(render(items, blocks, targets.length === 1));
  let remainingResponseBytes = MAX_RESULT_BYTES - baseBytes - blocks.length * 400;
  if (blocks.length && remainingResponseBytes < blocks.length * 256)
    throw new SiftlightError("Inspection selectors exceed the shared response limit; use fewer targets");
  for (const [index, block] of blocks.entries()) {
    const followingBlocks = blocks.length - index - 1;
    let allowance = remainingResponseBytes - followingBlocks * 256;
    if (!block.document.utf8) {
      const target = block.prepared[0];
      if (!target)
        throw new Error("Missing lossy-source target");
      const lineStart = block.document.lineStarts[target.target.line - 1] ?? 0;
      const relativeFocus = target.focus - lineStart;
      const preview = sourceRangeFromBytes(block.document.bytes, Math.max(1, target.target.line - 10), Math.min(block.document.lineStarts.length, target.target.line + 10), target.target.line, {
        maxBytes: Math.min(MAX_RESULT_BYTES - 1024, Math.max(256, allowance - 300)),
        focus: {
          byteStart: relativeFocus,
          byteEnd: relativeFocus,
          range: {
            start: { line: target.target.line - 1, character: relativeFocus },
            end: { line: target.target.line - 1, character: relativeFocus },
            encoding: "utf-8"
          }
        }
      });
      block.text.push(`[lossy UTF-8 preview only; original bytes are not fully representable; source continuation unavailable; lines may be clipped at 500 characters]
${preview.text}`);
      remainingResponseBytes -= Buffer.byteLength(block.text.at(-1) ?? "") + 1;
      for (const targetIndex of block.targets) {
        const item = items[targetIndex];
        if (item)
          item.source = {
            range: { startLine: preview.startLine, endLine: preview.endLine },
            omittedBefore: preview.omittedBefore,
            omittedAfter: preview.omittedAfter,
            truncatedLines: preview.truncatedLines,
            complete: false,
            ...block.boundary ? { boundary: block.boundary } : {},
            reference: block.document.reference
          };
      }
      continue;
    }
    const focuses = [...new Set(block.prepared.map((prepared) => prepared.focus))];
    for (const [focusIndex, focus] of focuses.entries()) {
      if (!block.remaining.some((range) => range.start <= focus && focus < range.end) || allowance < 256)
        continue;
      const missingBytes = block.remaining.reduce((total, range) => total + range.end - range.start, 0);
      const budget = missingBytes + block.remaining.length * 200 < allowance ? allowance : Math.max(256, Math.floor(allowance / (focuses.length - focusIndex)));
      const page = sourcePage(block.document, block.remaining, budget, focus);
      block.fragments.push(page.fragment);
      block.remaining = page.remaining;
      block.text.push(page.text);
      const pageBytes = Buffer.byteLength(page.text) + 1;
      allowance -= pageBytes;
      remainingResponseBytes -= pageBytes;
    }
    while (block.remaining.length && allowance >= 256) {
      const page = sourcePage(block.document, block.remaining, allowance);
      block.fragments.push(page.fragment);
      block.remaining = page.remaining;
      block.text.push(page.text);
      const pageBytes = Buffer.byteLength(page.text) + 1;
      allowance -= pageBytes;
      remainingResponseBytes -= pageBytes;
    }
    const fallback = block.boundary === "line-window" || block.boundary === "mixed" ? fallbackContinuationRange(block.document, block.ranges) : undefined;
    const continuationTarget = fallback ? [...block.ranges, fallback] : block.ranges;
    const continuationGaps = fallback ? [...block.remaining, fallback] : block.remaining;
    if (continuationGaps.length)
      block.continuation = continuations.create(block.document.reference, continuationTarget, continuationGaps, block.boundary);
    if (block.document.reference.origin.kind === "worktree") {
      const current = await getSourceRevision(resolve17(access.cwd, block.document.path));
      if (!current || !sameSourceRevision(current, block.document.reference.origin.revision)) {
        block.text = [];
        block.fragments = [];
        block.remaining = block.ranges;
        delete block.continuation;
        for (const targetIndex of block.targets) {
          const item = items[targetIndex];
          if (item) {
            item.status = "error";
            item.structure = { status: "source-changed" };
            item.error = "Source changed during inspection; refresh the source";
          }
        }
      }
    }
    for (const targetIndex of block.targets) {
      const item = items[targetIndex];
      if (item?.status === "returned")
        item.source = blockDetails(block);
    }
    if (access.signal?.aborted)
      throw abortError();
    if (index >= 5)
      throw new Error("Inspection target limit was not validated");
  }
  const text = render(items, blocks, targets.length === 1);
  if (Buffer.byteLength(text) > MAX_RESULT_BYTES)
    throw new SiftlightError("Inspection metadata exceeds the response byte limit");
  const complete = items.every((item) => item.status === "returned") && blocks.every((block) => block.remaining.length === 0);
  const first = items[0];
  return {
    text,
    details: {
      version: 1,
      mode: "inspect",
      status: complete ? "complete" : "partial",
      snapshotComplete: complete,
      totalMatches: 0,
      storedMatches: 0,
      returnedMatches: 0,
      totalFiles: blocks.length,
      inspections: items,
      sourceBlocks: blocks.map((block) => ({
        path: block.document.path,
        source: blockDetails(block)
      })),
      ...targets.length === 1 && first?.structure ? { structure: first.structure } : {},
      ...targets.length === 1 && first?.source ? {
        source: first.source,
        ...first.source.nextRequest ? { nextRequest: first.source.nextRequest } : {}
      } : {}
    }
  };
}
async function continueSource(cursor, access, continuations) {
  const state = continuations.resolve(cursor);
  const document = await access.load(state.source.path, state.source);
  const page = sourcePage(document, state.remaining, MAX_RESULT_BYTES - 1400);
  const next = continuations.advance(cursor, page.fragment);
  const block = {
    document,
    ranges: state.target,
    targets: [],
    prepared: [],
    fragments: [page.fragment],
    remaining: page.remaining,
    text: [page.text],
    boundary: state.boundary,
    ...next ? { continuation: next } : {}
  };
  const source = blockDetails(block);
  const text = render([], [block], true);
  if (Buffer.byteLength(text) > MAX_RESULT_BYTES)
    throw new SiftlightError("Source continuation metadata exceeds the output limit");
  return {
    text,
    details: {
      version: 1,
      mode: "inspect",
      status: next ? "partial" : "complete",
      snapshotComplete: !next,
      totalMatches: 0,
      storedMatches: 0,
      returnedMatches: 0,
      totalFiles: 1,
      source,
      sourceBlocks: [{ path: document.path, source }],
      ...source.nextRequest ? { nextRequest: source.nextRequest } : {}
    }
  };
}

// src/evidence-validation.ts
import { realpath as realpath5, stat as stat3 } from "node:fs/promises";
import { resolve as resolve18 } from "node:path";

// src/evidence-validity.ts
function aggregateEvidenceValidity(sources) {
  if (sources.some((source) => source.status === "stale"))
    return "stale";
  if (sources.length === 0 || sources.some((source) => source.status === "unknown"))
    return "unknown";
  return "current";
}
function evidenceRecheck(sources, reasons = [], coverage = sources.length > 0 ? "complete" : "not-applicable") {
  return {
    validity: aggregateEvidenceValidity(sources),
    coverage,
    sources: [...sources],
    reasons: [...new Set(reasons)]
  };
}

// src/evidence-validation.ts
function isAbort(error, signal) {
  return signal?.aborted === true || error instanceof Error && error.name === "AbortError";
}
function systemErrorCode(error) {
  if (typeof error !== "object" || error === null || !("code" in error))
    return;
  const code = error.code;
  return typeof code === "string" ? code : undefined;
}
function policyFailure(error) {
  return error instanceof SiftlightError && (error.message.startsWith("Path is inside a protected credential or system area:") || error.message === "Git internals are excluded from search" || error.message === "Path must stay within the working directory");
}
async function confirmWorktreeState(path, cwd, signal) {
  const absolute = resolve18(cwd, path);
  const policy = new SearchPathPolicy(cwd);
  try {
    policy.assertPath(absolute);
    const before = await stat3(absolute);
    const beforeCanonical = await realpath5(absolute);
    const after = await stat3(absolute);
    const afterCanonical = await realpath5(absolute);
    if (!before.isFile() || !after.isFile()) {
      return { status: "stale", reason: "Source is no longer a regular file" };
    }
    if (beforeCanonical !== afterCanonical || !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(after))) {
      return { status: "stale", reason: "Source changed while checking its availability" };
    }
    return { status: "unknown", reason: "Source could not be read despite a stable path" };
  } catch (error) {
    if (isAbort(error, signal))
      throw error;
    const code = systemErrorCode(error);
    if (code === "ENOENT")
      return { status: "stale", reason: "Source is unavailable" };
    if (code && ["EACCES", "EPERM", "ELOOP", "ENOTDIR"].includes(code)) {
      return { status: "unknown", reason: `Source could not be checked (${code})` };
    }
    if (policyFailure(error)) {
      return {
        status: "unknown",
        reason: error instanceof Error ? error.message : "Path policy denied source"
      };
    }
    throw error;
  }
}
async function failure(error, expected, path, cwd, signal) {
  if (error instanceof SourceDocumentError) {
    if (error.reason === "source-changed") {
      return { status: "stale", reason: error.message };
    }
    if (error.reason === "source-unavailable" && expected?.origin.kind === "worktree") {
      return confirmWorktreeState(path, cwd, signal);
    }
    return { status: "unknown", reason: error.message };
  }
  if (error instanceof SourceBudgetError)
    return { status: "unknown", reason: error.message, budgetReached: true };
  const code = systemErrorCode(error);
  if (code === "ENOENT" && expected?.origin.kind === "worktree") {
    return confirmWorktreeState(path, cwd, signal);
  }
  if (code && ["EACCES", "EPERM", "ELOOP", "ENOTDIR"].includes(code)) {
    return { status: "unknown", reason: `Source could not be checked (${code})` };
  }
  if (policyFailure(error)) {
    return {
      status: "unknown",
      reason: error instanceof Error ? error.message : "Path policy denied source"
    };
  }
  throw error;
}
function sourceKey(reference) {
  return JSON.stringify([reference.path, reference.origin]);
}
function revisionKey(path, revision) {
  return JSON.stringify([path, revision]);
}
function selectedIndex(index, count, label) {
  if (index === undefined)
    return;
  if (!Number.isSafeInteger(index) || index < 1 || index > count) {
    throw new CursorError(`matchIndex must select a retained ${label} from 1 through ${String(count)}`, "E_CURSOR_OFFSET_INVALID");
  }
  return index;
}
function addUniqueTarget(targets, seen, target) {
  if (seen.has(target.key))
    return;
  seen.add(target.key);
  targets.push(target);
}
function analysisTargets(items, matchIndex) {
  const selected = selectedIndex(matchIndex, items.length, "analysis item");
  const selectedItems = selected === undefined ? items : [items[selected - 1]];
  const targets = [];
  const missing = [];
  const seen = new Set;
  for (const item of selectedItems) {
    const reference = item.source;
    if (!reference) {
      const key = JSON.stringify(["missing", item.path]);
      if (!seen.has(key)) {
        seen.add(key);
        missing.push({
          path: item.path,
          role: "source",
          status: "unknown",
          reason: "Saved analysis item has no source reference"
        });
      }
      continue;
    }
    addUniqueTarget(targets, seen, {
      key: sourceKey(reference),
      path: reference.path,
      expected: reference
    });
  }
  return { targets, missing };
}
function snapshotTargets(snapshot, matchIndex) {
  const selected = selectedIndex(matchIndex, snapshot.matches.length, "search match");
  const selectedPaths = selected === undefined ? [...snapshot.sourceRevisions.keys()] : [snapshot.matches[selected - 1].absolutePath];
  const targets = [];
  const missing = [];
  const seen = new Set;
  for (const path of selectedPaths) {
    const revision = snapshot.sourceRevisions.get(path);
    if (!revision) {
      const key = JSON.stringify(["missing", path]);
      if (!seen.has(key)) {
        seen.add(key);
        missing.push({
          path,
          role: "source",
          status: "unknown",
          reason: "Saved search has no source revision"
        });
      }
      continue;
    }
    addUniqueTarget(targets, seen, {
      key: revisionKey(path, revision),
      path,
      revision
    });
  }
  return { targets, missing };
}
async function validateSnapshotTarget(target, cwd, policy, signal) {
  if (!target.revision)
    throw new Error("Snapshot validation target omitted its revision");
  try {
    const absolute = resolve18(cwd, target.path);
    const canonical = await policy.resolveExistingPath(absolute);
    if (!canonical) {
      const result = await confirmWorktreeState(target.path, cwd, signal);
      return { path: target.path, role: "source", ...result };
    }
    const before = await stat3(absolute);
    const beforeCanonical = canonical;
    const after = await stat3(absolute);
    const afterCanonical = await realpath5(absolute);
    if (!before.isFile() || !after.isFile()) {
      return {
        path: target.path,
        role: "source",
        status: "stale",
        reason: "Source is no longer a regular file"
      };
    }
    if (beforeCanonical !== afterCanonical || !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(after))) {
      return {
        path: target.path,
        role: "source",
        status: "stale",
        reason: "Source changed while checking its revision"
      };
    }
    const current = sourceRevisionFromStats(after);
    const unchanged = sameSourceRevision(target.revision, current);
    return {
      path: target.path,
      role: "source",
      status: unchanged ? "current" : "stale",
      ...unchanged ? {} : { reason: "Source revision changed" }
    };
  } catch (error) {
    if (isAbort(error, signal))
      throw error;
    const code = systemErrorCode(error);
    if (code === "ENOENT") {
      const classified = await confirmWorktreeState(target.path, cwd, signal);
      return { path: target.path, role: "source", ...classified };
    }
    const classified = await failure(error, undefined, target.path, cwd, signal);
    return {
      path: target.path,
      role: "source",
      status: classified.status,
      reason: classified.reason
    };
  }
}
async function validateAnalysisTarget(target, access, cwd, signal) {
  if (!target.expected)
    throw new Error("Analysis validation target omitted its source reference");
  try {
    const current = await access.refresh(target.path, target.expected);
    return {
      path: target.path,
      role: "source",
      status: "current",
      ...target.expected ? { expected: target.expected } : {},
      current: current.reference
    };
  } catch (error) {
    if (isAbort(error, signal))
      throw error;
    const classified = await failure(error, target.expected, target.path, cwd, signal);
    return {
      path: target.path,
      role: "source",
      status: classified.status,
      ...target.expected ? { expected: target.expected } : {},
      reason: classified.reason,
      ...classified.budgetReached ? { budgetReached: true } : {}
    };
  }
}
function comparisonTarget(sources, hasUnscopedUnknown) {
  const hasGit = sources.some((source) => source.expected?.origin.kind === "git");
  const hasWorktree = sources.some((source) => source.expected?.origin.kind === "worktree");
  if (hasGit && hasWorktree || hasGit && hasUnscopedUnknown)
    return "mixed";
  if (hasGit)
    return "recorded-git";
  return "current-worktree";
}
function evidenceScope(cwd, scope, request) {
  const path = scope?.path ?? request?.expandedFromPath ?? request?.path ?? ".";
  const include = scope?.glob ?? request?.glob;
  const exclude = scope?.exclude ?? request?.exclude;
  const hidden = scope?.hidden ?? request?.hidden;
  return {
    root: resolve18(cwd, path),
    ...include && include.length > 0 ? { include: [...include] } : {},
    ...exclude && exclude.length > 0 ? { exclude: [...exclude] } : {},
    ...hidden === undefined ? {} : { hidden }
  };
}
async function validateSavedEvidence(options) {
  let scope = { root: resolve18(options.cwd) };
  const reasons = [];
  let storedPartial = false;
  let targets;
  let sources;
  const missing = [];
  const isAnalysis = options.cursor.includes(".analysis.");
  if (isAnalysis) {
    const { stored } = options.analyses.resolve(options.cursor);
    scope = evidenceScope(options.cwd, stored.result.scope, undefined);
    storedPartial = stored.result.partial;
    reasons.push(...stored.result.reasons);
    const selected = analysisTargets(stored.result.items, options.matchIndex);
    targets = selected.targets;
    missing.push(...selected.missing);
    const access = new SourceAccess(options.cwd, options.queue, options.signal, {
      maxFiles: options.maxFiles ?? MAX_STRUCTURE_FILES
    });
    sources = [...missing];
    let budgetExhausted = false;
    let admittedTargets = 0;
    for (const target of targets) {
      if (options.signal?.aborted)
        throw abortError();
      if (budgetExhausted || admittedTargets >= access.maxFiles) {
        sources.push({
          path: target.path,
          role: "source",
          status: "unknown",
          ...target.expected ? { expected: target.expected } : {},
          reason: "Saved evidence validation source budget is exhausted"
        });
        continue;
      }
      admittedTargets += 1;
      const status = await validateAnalysisTarget(target, access, options.cwd, options.signal);
      const { budgetReached, ...sourceStatus } = status;
      sources.push(sourceStatus);
      if (budgetReached)
        budgetExhausted = true;
    }
  } else {
    const { snapshot } = options.snapshots.resolve(options.cursor);
    scope = evidenceScope(options.cwd, undefined, snapshot.request);
    storedPartial = !snapshot.snapshotComplete;
    reasons.push(...snapshot.retention?.reasons ?? []);
    const selected = snapshotTargets(snapshot, options.matchIndex);
    targets = selected.targets;
    missing.push(...selected.missing);
    const policy = new SearchPathPolicy(options.cwd);
    sources = [...missing];
    let checked = 0;
    const maxFiles = options.maxFiles ?? MAX_STRUCTURE_FILES;
    for (const target of targets) {
      if (options.signal?.aborted)
        throw abortError();
      if (checked >= maxFiles) {
        sources.push({
          path: target.path,
          role: "source",
          status: "unknown",
          reason: "Saved evidence validation source budget is exhausted"
        });
        continue;
      }
      checked += 1;
      sources.push(await validateSnapshotTarget(target, options.cwd, policy, options.signal));
    }
  }
  if (sources.length === 0)
    reasons.push("No retained source evidence could be validated");
  const uniqueReasons = [...new Set(reasons)];
  const coverage = storedPartial || sources.length === 0 || sources.some((source) => source.status === "unknown") ? "partial" : "complete";
  const recheck = evidenceRecheck(sources, uniqueReasons, coverage);
  return {
    scope,
    sources,
    coverage,
    storedPartial,
    reasons: uniqueReasons,
    comparisonTarget: comparisonTarget(sources, missing.length > 0),
    recheck
  };
}

// src/syntax-search.ts
function unavailable(document, analysis) {
  if (!document.utf8) {
    return {
      items: [],
      partial: true,
      reasons: [`${document.path}: syntax classification requires lossless UTF-8 source`]
    };
  }
  if (analysis.status !== "ok") {
    return {
      items: [],
      partial: true,
      reasons: [`${document.path}: syntax ${analysis.status}; this source remains unclassified`]
    };
  }
  return;
}
function byteBoundary(document, offset) {
  const byte = document.bytes[offset];
  return offset === document.bytes.length || byte !== undefined && (byte & 192) !== 128;
}
function buildRoleIndex(analysis, selected) {
  const groups = new Map;
  for (const role of analysis.roles) {
    if (!selected.has(role.role))
      continue;
    const key = JSON.stringify([role.role, role.certainty, role.subkind]);
    const group = groups.get(key);
    if (group)
      group.push(role);
    else
      groups.set(key, [role]);
  }
  return [...groups.values()].map((roles) => {
    roles.sort((a, b) => a.start - b.start || b.end - a.end);
    const widest = [];
    let best = 0;
    for (let index = 0;index < roles.length; index++) {
      if ((roles[index]?.end ?? 0) > (roles[best]?.end ?? 0))
        best = index;
      widest.push(best);
    }
    return { roles, widest };
  });
}
function roleProofs(indices, start, end) {
  const proofs = [];
  for (const index of indices) {
    let low = 0, high = index.roles.length;
    while (low < high) {
      const middle = low + high >>> 1;
      if ((index.roles[middle]?.start ?? Infinity) <= start)
        low = middle + 1;
      else
        high = middle;
    }
    const widest = index.widest[low - 1];
    const role = widest === undefined ? undefined : index.roles[widest];
    if (role && end <= role.end && start < role.end)
      proofs.push(role);
  }
  return proofs;
}
function filterRoleOccurrences(document, analysis, occurrences, roles) {
  const missing = unavailable(document, analysis);
  if (missing)
    return missing;
  const indices = buildRoleIndex(analysis, new Set(roles));
  const items = [];
  const reasons = [];
  const seen = new Set;
  let splitOccurrences = 0;
  for (const range of occurrences) {
    document.checkRange(range);
    const key = `${range.start}:${range.end}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    if (!byteBoundary(document, range.start) || !byteBoundary(document, range.end)) {
      splitOccurrences++;
      continue;
    }
    const proofs = roleProofs(indices, document.toCharacterOffset(range.start), document.toCharacterOffset(range.end));
    if (proofs.length === 0)
      continue;
    if (items.length === MAX_ANALYSIS_RESULTS) {
      reasons.push(`${document.path}: role result retention limit reached; additional occurrences are not retained`);
      break;
    }
    const match = sourceEvidence(document, range);
    items.push({
      path: document.path,
      line: match.line,
      range: match.range,
      source: document.reference,
      label: [...new Set(proofs.map((proof) => proof.role))].join(", "),
      excerpt: match.excerpt,
      details: {
        roles: proofs.map((proof) => ({
          role: proof.role,
          certainty: proof.certainty,
          subkind: proof.subkind,
          range: { ...range }
        })),
        excerptRange: match.excerptRange,
        excerptTruncated: match.excerptTruncated
      }
    });
  }
  if (splitOccurrences > 0) {
    reasons.push(`${document.path}: ${splitOccurrences} occurrence(s) split UTF-8 characters and could not be classified`);
  }
  return { items, partial: reasons.length > 0, reasons };
}
function merge(ranges) {
  const result = [];
  for (const range of ranges.toSorted((a, b) => a.start - b.start || b.end - a.end)) {
    if (range.start === range.end)
      continue;
    const previous = result.at(-1);
    if (previous && range.start <= previous.end)
      previous.end = Math.max(previous.end, range.end);
    else
      result.push({ ...range });
  }
  return result;
}
function intersect(range, sorted) {
  let low = 0, high = sorted.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if ((sorted[middle]?.end ?? Infinity) <= range.start)
      low = middle + 1;
    else
      high = middle;
  }
  const result = [];
  for (let index = low;index < sorted.length; index++) {
    const other = sorted[index];
    if (!other || other.start >= range.end)
      break;
    const start = Math.max(range.start, other.start);
    const end = Math.min(range.end, other.end);
    if (start < end)
      result.push({ start, end });
  }
  return result;
}
function subtract2(range, exclusions) {
  const result = [];
  let start = range.start;
  for (const excluded of exclusions) {
    if (excluded.end <= start || excluded.start >= range.end)
      continue;
    if (excluded.start > start)
      result.push({ start, end: excluded.start });
    start = Math.max(start, excluded.end);
  }
  if (start < range.end)
    result.push({ start, end: range.end });
  return result;
}
function implementationRanges(document, analysis) {
  const symbols = analysis.symbols.filter((symbol) => symbol.hasBody).toSorted((a, b) => a.start - b.start || b.end - a.end);
  const stack = [];
  const nested = new Map;
  for (const symbol of symbols) {
    let parent = stack.at(-1);
    while (parent && (symbol.start >= parent.end || symbol.end > parent.end)) {
      stack.pop();
      parent = stack.at(-1);
    }
    if (parent) {
      const ranges = nested.get(parent.node) ?? [];
      ranges.push({
        start: document.toByteOffset(symbol.start),
        end: document.toByteOffset(symbol.end)
      });
      nested.set(parent.node, ranges);
    }
    stack.push(symbol);
  }
  const code = merge(analysis.roles.filter((role) => role.role === "code").map((role) => ({
    start: document.toByteOffset(role.start),
    end: document.toByteOffset(role.end)
  })));
  return { symbols, code, nested };
}
function owned(document, context, symbol, changed) {
  if (!symbol.hasBody || symbol.bodyStart === undefined || symbol.bodyEnd === undefined)
    return [];
  const body = {
    start: document.toByteOffset(symbol.bodyStart),
    end: document.toByteOffset(symbol.bodyEnd)
  };
  const withoutNested = subtract2(body, context.nested.get(symbol.node) ?? []);
  const code = withoutNested.flatMap((range) => intersect(range, context.code));
  return changed ? code.flatMap((range) => intersect(range, changed)) : code;
}
function termEvidence(document, ranges, term) {
  const needle = Buffer.from(term);
  if (needle.length === 0)
    throw new Error("Function conjunction expects normalized non-empty terms");
  let count = 0;
  let first;
  for (const range of ranges) {
    const bytes = document.bytes.subarray(range.start, range.end);
    let offset = bytes.indexOf(needle);
    while (offset >= 0) {
      const start = range.start + offset;
      count++;
      first ??= { start, end: start + needle.length };
      offset = bytes.indexOf(needle, offset + needle.length);
    }
  }
  return first ? {
    term,
    count,
    evidence: sourceEvidence(document, first),
    omittedOccurrenceEvidence: count - 1
  } : undefined;
}
function findFunctionConjunctions(document, analysis, terms, changedRanges) {
  const missing = unavailable(document, analysis);
  if (missing)
    return missing;
  if (analysis.language !== "javascript" && analysis.language !== "typescript" && analysis.language !== "tsx") {
    return {
      items: [],
      partial: true,
      reasons: [`${document.path}: same-function AND supports JS/TS/TSX only`]
    };
  }
  if (terms.length === 0)
    throw new SiftlightError("Function conjunction requires normalized terms");
  for (const range of changedRanges ?? [])
    document.checkRange(range);
  const changed = changedRanges ? merge(changedRanges) : undefined;
  const context = implementationRanges(document, analysis);
  const items = [];
  for (const symbol of context.symbols) {
    const ranges = owned(document, context, symbol, changed);
    const matches = terms.map((term) => termEvidence(document, ranges, term));
    if (matches.some((match) => match === undefined))
      continue;
    if (items.length === MAX_ANALYSIS_RESULTS) {
      return {
        items,
        partial: true,
        reasons: [`${document.path}: function result retention limit reached`]
      };
    }
    const range = {
      start: document.toByteOffset(symbol.start),
      end: document.toByteOffset(symbol.end)
    };
    items.push({
      path: document.path,
      line: document.lineAt(range.start),
      source: document.reference,
      range,
      label: symbol.scope ? `${symbol.scope}.${symbol.name}` : symbol.name,
      excerpt: matches.map((match) => match?.evidence.excerpt ?? "").join(`
`),
      details: {
        symbol: {
          name: symbol.name,
          kind: symbol.kind,
          scope: symbol.scope,
          range,
          body: symbol.bodyStart !== undefined && symbol.bodyEnd !== undefined ? {
            start: document.toByteOffset(symbol.bodyStart),
            end: document.toByteOffset(symbol.bodyEnd)
          } : undefined
        },
        terms: matches,
        relation: "same lexical implementation; not proof of a shared execution path or data flow",
        scope: changed ? "implementation-code-intersect-changed-ranges" : "implementation-own-code"
      }
    });
  }
  return { items, partial: false, reasons: [] };
}

// src/python-outline.ts
function indentation(line) {
  let width = 0;
  for (const character of line) {
    if (character === " ")
      width += 1;
    else if (character === "\t")
      width += 4;
    else
      break;
  }
  return width;
}
function stripStringsAndComments(line, state) {
  const code = line.split("");
  const blank = (start, end) => {
    for (let index = start;index < end; index += 1)
      code[index] = " ";
  };
  let index = 0;
  while (index < line.length) {
    if (state.tripleQuote) {
      const delimiter = state.tripleQuote.repeat(3);
      const close = line.indexOf(delimiter, index);
      if (close < 0) {
        blank(index, line.length);
        return code.join("");
      }
      blank(index, close + 3);
      index = close + 3;
      delete state.tripleQuote;
      continue;
    }
    const character = line[index];
    if (character === "#") {
      blank(index, line.length);
      break;
    }
    if (character !== "'" && character !== '"') {
      index += 1;
      continue;
    }
    const delimiter = line.slice(index, index + 3);
    if (delimiter === "'''" || delimiter === '"""') {
      state.tripleQuote = character;
      blank(index, Math.min(line.length, index + 3));
      index += 3;
      continue;
    }
    blank(index, index + 1);
    index += 1;
    while (index < line.length) {
      if (line[index] === "\\") {
        blank(index, Math.min(line.length, index + 2));
        index += 2;
        continue;
      }
      if (line[index] === character) {
        blank(index, index + 1);
        index += 1;
        break;
      }
      blank(index, index + 1);
      index += 1;
    }
  }
  return code.join("");
}
function scanLines(document) {
  const state = {};
  let depth = 0;
  return document.text.split(`
`).map((text) => {
    const code = stripStringsAndComments(text, state);
    const depthBefore = depth;
    depth = scanTopLevelColon(code, depth).depth;
    return {
      text,
      code,
      indent: indentation(text),
      meaningful: code.trim().length > 0,
      depthBefore,
      depthAfter: depth
    };
  });
}
function declarations(lines) {
  return lines.flatMap((line, lineIndex) => {
    const match = /^([ \t]*)(?:(?:async)[ \t]+)?(def|class)[ \t]+([\p{ID_Start}_][\p{ID_Continue}]*)[ \t]*(?=[:(])/u.exec(line.code);
    if (!match)
      return [];
    return [
      {
        name: match[3] ?? "",
        kind: match[2] === "class" ? "class" : "function",
        indent: line.indent,
        lineIndex
      }
    ];
  });
}
function endLines(lines) {
  const nextBoundaries = Array.from({ length: lines.length }, () => lines.length);
  const candidates = [];
  for (let lineIndex = lines.length - 1;lineIndex >= 0; lineIndex -= 1) {
    const line = lines[lineIndex];
    if (!line?.meaningful || line.depthBefore !== 0)
      continue;
    while (candidates.at(-1) && (candidates.at(-1)?.indent ?? 0) > line.indent) {
      candidates.pop();
    }
    nextBoundaries[lineIndex] = candidates.at(-1)?.lineIndex ?? lines.length;
    candidates.push({ lineIndex, indent: line.indent });
  }
  return nextBoundaries;
}
function scanTopLevelColon(code, initialDepth) {
  let depth = initialDepth;
  let colon = -1;
  for (let index = 0;index < code.length; index += 1) {
    const character = code[index];
    if (character === "(" || character === "[" || character === "{")
      depth += 1;
    else if (character === ")" || character === "]" || character === "}")
      depth = Math.max(0, depth - 1);
    else if (character === ":" && depth === 0 && colon < 0)
      colon = index;
  }
  return { depth, colon };
}
function hasBody(lines, declaration, endLine) {
  let headerEnded = false;
  let depth = 0;
  for (let lineIndex = declaration.lineIndex;lineIndex < endLine; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line)
      continue;
    const scanned = scanTopLevelColon(line.code, depth);
    depth = scanned.depth;
    if (scanned.colon < 0)
      continue;
    headerEnded = true;
    if (line.code.slice(scanned.colon + 1).trim().length > 0)
      return true;
    break;
  }
  if (!headerEnded)
    return false;
  for (let lineIndex = declaration.lineIndex + 1;lineIndex < endLine; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line?.meaningful && line.indent > declaration.indent)
      return true;
  }
  return false;
}
function parsePythonOutline(document) {
  if (!document.utf8)
    return [];
  const lines = scanLines(document);
  const found = declarations(lines);
  const boundaries = endLines(lines);
  const active = [];
  return found.map((declaration) => {
    while (active.at(-1) && (active.at(-1)?.lineIndex ?? 0) >= declaration.lineIndex) {
      active.pop();
    }
    while (active.at(-1) && (active.at(-1)?.indent ?? 0) >= declaration.indent) {
      active.pop();
    }
    const parents = [...active];
    const boundary = boundaries[declaration.lineIndex] ?? lines.length;
    const endLine = boundary === lines.length ? lines.length : boundary;
    const nearestParent = parents.at(-1);
    const kind = declaration.kind === "function" && nearestParent?.kind === "class" ? "method" : declaration.kind;
    const scope = parents.map((item) => item.name);
    const range = document.lineRange(declaration.lineIndex + 1, endLine);
    const lineStart = document.toCharacterOffset(range.start);
    const signature = document.text.slice(lineStart, Math.min(document.toCharacterOffset(range.end), lineStart + 600)).split(`
`, 1)[0]?.trimEnd() ?? "";
    const item = {
      name: declaration.name,
      kind,
      startLine: declaration.lineIndex + 1,
      endLine,
      scope,
      hasBody: hasBody(lines, declaration, boundary),
      range,
      signature
    };
    active.push(declaration);
    return item;
  });
}

// src/hybrid-search.ts
import { resolve as resolve19 } from "node:path";

// src/semantic-judge-batches.ts
var MAX_SEMANTIC_JUDGE_BATCH_CANDIDATES = 8;
var MAX_SEMANTIC_JUDGE_REQUEST_BYTES = 64 * 1024;

class SemanticJudgePayloadTooLargeError extends SiftlightError {
  constructor(message) {
    super(message);
    this.name = "SemanticJudgePayloadTooLargeError";
  }
}
function createSemanticJudgeBatches(candidates, serializedBytes) {
  const batches = [];
  let startIndex = 0;
  let current = [];
  for (const [index, candidate] of candidates.entries()) {
    const proposed = [...current, candidate];
    const exceedsCount = proposed.length > MAX_SEMANTIC_JUDGE_BATCH_CANDIDATES;
    const exceedsBytes = serializedBytes(proposed) > MAX_SEMANTIC_JUDGE_REQUEST_BYTES;
    if (current.length > 0 && (exceedsCount || exceedsBytes)) {
      batches.push({ startIndex, candidates: current });
      startIndex = index;
      current = [candidate];
    } else {
      current = proposed;
    }
  }
  if (current.length > 0)
    batches.push({ startIndex, candidates: current });
  return batches;
}
function combineBatchExecutions(executions) {
  return {
    successes: executions.flatMap((execution) => execution.successes),
    failures: executions.flatMap((execution) => execution.failures),
    attempts: executions.reduce((total, execution) => total + execution.attempts, 0),
    splits: executions.reduce((total, execution) => total + execution.splits, 0)
  };
}
async function settledBatchExecutions(operations) {
  const settled = await Promise.allSettled(operations);
  const executions = [];
  let hasRejection = false;
  let rejection;
  for (const result of settled) {
    if (result.status === "rejected") {
      if (!hasRejection)
        rejection = result.reason;
      hasRejection = true;
    } else
      executions.push(result.value);
  }
  if (hasRejection)
    throw rejection;
  return executions;
}
async function judgeBatchWithSplit(runner, query, batch, signal) {
  try {
    const result = await runner(query, batch.candidates, signal);
    return { successes: [{ ...batch, result }], failures: [], attempts: 1, splits: 0 };
  } catch (error) {
    if (signal?.aborted)
      throw error;
    if (error instanceof SemanticJudgePayloadTooLargeError && batch.candidates.length > 1) {
      const midpoint = Math.ceil(batch.candidates.length / 2);
      const left = await judgeBatchWithSplit(runner, query, { startIndex: batch.startIndex, candidates: batch.candidates.slice(0, midpoint) }, signal);
      const right = await judgeBatchWithSplit(runner, query, {
        startIndex: batch.startIndex + midpoint,
        candidates: batch.candidates.slice(midpoint)
      }, signal);
      const combined = combineBatchExecutions([left, right]);
      return { ...combined, attempts: combined.attempts + 1, splits: combined.splits + 1 };
    }
    return { successes: [], failures: [{ ...batch, error }], attempts: 1, splits: 0 };
  }
}
async function judgeSemanticCandidateBatches(runner, query, batches, signal) {
  return combineBatchExecutions(await settledBatchExecutions(batches.map((batch) => judgeBatchWithSplit(runner, query, batch, signal))));
}

// src/semantic-judge.ts
var MAX_CANDIDATE_CHARS = 4000;
var MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
var MAX_ERROR_CHARS = 512;
var CLASSIFICATION_PRIORITY = {
  "implementation-candidate": 0,
  "caller-candidate": 1,
  "mention-only": 2,
  documentation: 3,
  "test-only": 4,
  uncertain: 5,
  irrelevant: 6
};

class SemanticJudgeConfigurationError extends SiftlightError {
  constructor(message, options) {
    super(message, options);
    this.name = "SemanticJudgeConfigurationError";
  }
}

class SemanticJudgeRequestError extends SiftlightError {
  retryable;
  constructor(message, retryable, options) {
    super(message, options);
    this.name = "SemanticJudgeRequestError";
    this.retryable = retryable;
  }
}
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function boundedError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_CHARS);
}
function isClassification(value) {
  return typeof value === "string" && SEMANTIC_JUDGE_CLASSIFICATIONS.some((classification) => classification === value);
}
function probability(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new SemanticJudgeRequestError(`Semantic judge response has an invalid ${field}`, false);
  }
  return value;
}
function choiceProbability(answer, choice) {
  const probabilities = answer.probabilities;
  if (!isRecord4(probabilities))
    return probability(answer.confidence, "confidence");
  return probability(probabilities[choice], `probabilities.${choice}`);
}
function parseJudgment(value, candidateIndex) {
  if (!isRecord4(value) || value.type !== "choice" || !isClassification(value.choice)) {
    throw new SemanticJudgeRequestError(`Semantic judge response is missing choice answer ${String(candidateIndex + 1)}`, false);
  }
  const confidence = value.confidence === undefined ? undefined : probability(value.confidence, "confidence");
  return {
    candidateIndex,
    classification: value.choice,
    probability: choiceProbability(value, value.choice),
    ...confidence === undefined ? {} : { confidence }
  };
}
function requestBody(query, candidates, model) {
  const questions = {};
  for (const candidate of candidates) {
    questions[candidate.id] = {
      type: "choice",
      instructions: "Classify the candidate by what it actually does for the requested behavior. Judge the code excerpt, not just matching words.",
      criteria: {
        "implementation-candidate": "The excerpt appears to implement the requested behavior or its core decision/side effect.",
        "caller-candidate": "The excerpt invokes or wires an implementation but does not implement the behavior itself.",
        "mention-only": "The excerpt mentions the topic without implementing or invoking the behavior.",
        documentation: "The excerpt is documentation or explanatory prose rather than executable behavior.",
        "test-only": "The excerpt is test or fixture code that describes or checks the behavior.",
        irrelevant: "The excerpt is not meaningfully related to the requested behavior.",
        uncertain: "The excerpt is too incomplete or ambiguous to classify confidently."
      }
    };
  }
  return {
    state: {
      query,
      candidates: candidates.map(({ id, excerpt }) => ({
        id,
        excerpt
      }))
    },
    model,
    questions
  };
}
async function responseText(response) {
  if (!response.body) {
    const contentLength = response.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_BYTES) {
      throw new SemanticJudgeRequestError("Semantic judge response exceeded the 4 MiB limit", false);
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new SemanticJudgeRequestError("Semantic judge response exceeded the 4 MiB limit", false);
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done)
        break;
      const chunk = result.value;
      bytes += chunk.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new SemanticJudgeRequestError("Semantic judge response exceeded the 4 MiB limit", false);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(all);
}
function retryDelay(attempt) {
  return Math.min(20000, 400 * 2 ** attempt);
}
async function waitForRetry(delayMs, signal) {
  if (signal?.aborted)
    throw signal.reason instanceof Error ? signal.reason : new Error("Operation aborted");
  await new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("Operation aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
function createJevRunner(config, key, fetcher) {
  return async (query, candidates, parentSignal) => {
    const startedAt = performance.now();
    const body = JSON.stringify(requestBody(query, candidates, config.model));
    if (new TextEncoder().encode(body).byteLength > MAX_SEMANTIC_JUDGE_REQUEST_BYTES) {
      throw new SemanticJudgePayloadTooLargeError("Semantic judge request exceeded the 64 KiB request limit");
    }
    for (let attempt = 0;attempt <= config.maxRetries; attempt += 1) {
      const controller = new AbortController;
      const onParentAbort = () => controller.abort(parentSignal?.reason);
      parentSignal?.addEventListener("abort", onParentAbort, { once: true });
      const timeout = setTimeout(() => controller.abort(new Error("Semantic judge request timed out")), config.timeoutMs);
      try {
        const response = await fetcher(config.endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${key}`
          },
          body,
          signal: controller.signal
        });
        if (!response.ok) {
          if (response.status === 413) {
            throw new SemanticJudgePayloadTooLargeError("Semantic judge rejected an oversized request with HTTP 413");
          }
          const retryable = response.status === 408 || response.status === 429 || response.status === 529 || response.status >= 500;
          throw new SemanticJudgeRequestError(`Semantic judge returned HTTP ${String(response.status)}`, retryable);
        }
        const raw = JSON.parse(await responseText(response));
        if (!isRecord4(raw) || !isRecord4(raw.answers)) {
          throw new SemanticJudgeRequestError("Semantic judge response did not contain answers", false);
        }
        const answers = raw.answers;
        const judgments = candidates.map((candidate, index) => parseJudgment(answers[candidate.id], index));
        const model = raw.model ?? config.model;
        if (typeof model !== "string" || model.length === 0 || model.length > 128 || /[\r\n\0]/u.test(model)) {
          throw new SemanticJudgeRequestError("Semantic judge response model must be bounded single-line text", false);
        }
        const usage = isRecord4(raw.usage) ? raw.usage : undefined;
        const inputTokens = typeof usage?.input_tokens === "number" && Number.isSafeInteger(usage.input_tokens) && usage.input_tokens >= 0 ? usage.input_tokens : undefined;
        const outputTokens = typeof usage?.output_tokens === "number" && Number.isSafeInteger(usage.output_tokens) && usage.output_tokens >= 0 ? usage.output_tokens : undefined;
        return {
          model,
          judgments,
          ...inputTokens === undefined ? {} : { inputTokens },
          ...outputTokens === undefined ? {} : { outputTokens },
          elapsedMs: Math.round(performance.now() - startedAt)
        };
      } catch (error) {
        if (parentSignal?.aborted)
          throw error;
        const retryable = error instanceof SemanticJudgePayloadTooLargeError ? false : error instanceof SemanticJudgeRequestError ? error.retryable : true;
        if (!retryable || attempt >= config.maxRetries)
          throw error;
        await waitForRetry(retryDelay(attempt), parentSignal);
      } finally {
        clearTimeout(timeout);
        parentSignal?.removeEventListener("abort", onParentAbort);
      }
    }
    throw new SemanticJudgeRequestError("Semantic judge request failed", false);
  };
}
function createDisabledSemanticJudgeIntegration(config) {
  return { config: { ...config, enabled: false } };
}
function createSemanticJudgeIntegration(config, environment = process.env, fetcher = fetch) {
  if (!config.enabled)
    return createDisabledSemanticJudgeIntegration(config);
  const key = environment[config.apiKeyEnv]?.trim();
  if (!key) {
    throw new SemanticJudgeConfigurationError(`Semantic judge is enabled, but environment variable ${config.apiKeyEnv} is missing or empty`);
  }
  if (config.provider !== "jev") {
    throw new SemanticJudgeConfigurationError(`Unsupported semantic judge provider: ${String(config.provider)}`);
  }
  return { config, runner: createJevRunner(config, key, fetcher) };
}
function baseDetails(config) {
  return {
    enabled: config.enabled,
    provider: config.provider,
    status: config.enabled ? "partial" : "disabled",
    maxCandidates: config.maxCandidates,
    candidatesConsidered: 0,
    judgedCandidates: 0,
    candidatesUnjudged: 0,
    batchesAttempted: 0,
    batchesCompleted: 0,
    batchesFailed: 0,
    batchesSplit: 0,
    classificationCounts: {}
  };
}
function optionalUsageTotal(results, select) {
  let total = 0;
  for (const result of results) {
    const value = select(result);
    if (value === undefined)
      return;
    total += value;
  }
  return total;
}
async function applySemanticJudge(result, query, integration, signal) {
  const config = integration?.config;
  if (!config || !config.enabled || !integration.runner) {
    return { ...result, ...config ? { semanticJudge: baseDetails(config) } : {} };
  }
  const candidates = result.items.slice(0, config.maxCandidates).map((item, index) => ({
    id: `candidate-${String(index + 1)}`,
    excerpt: (item.excerpt ?? "").slice(0, MAX_CANDIDATE_CHARS)
  }));
  const initial = baseDetails(config);
  initial.candidatesConsidered = candidates.length;
  if (candidates.length === 0) {
    return { ...result, semanticJudge: { ...initial, status: "complete", model: config.model } };
  }
  const startedAt = performance.now();
  const execution = await judgeSemanticCandidateBatches(integration.runner, query, createSemanticJudgeBatches(candidates, (batch) => new TextEncoder().encode(JSON.stringify(requestBody(query, batch, config.model))).byteLength), signal);
  const judgments = new Map;
  const judgmentModels = new Map;
  for (const success of execution.successes) {
    for (const judgment of success.result.judgments) {
      const candidateIndex = success.startIndex + judgment.candidateIndex;
      judgments.set(candidateIndex, { ...judgment, candidateIndex });
      judgmentModels.set(candidateIndex, success.result.model);
    }
  }
  const counts = {};
  for (const judgment of judgments.values())
    counts[judgment.classification] = (counts[judgment.classification] ?? 0) + 1;
  const rankedJudgedIndices = [...judgments.keys()].toSorted((left, right) => {
    const leftJudgment = judgments.get(left);
    const rightJudgment = judgments.get(right);
    return CLASSIFICATION_PRIORITY[leftJudgment.classification] - CLASSIFICATION_PRIORITY[rightJudgment.classification] || rightJudgment.probability - leftJudgment.probability || left - right;
  });
  let rankedOffset = 0;
  const reordered = result.items.map((original, index) => {
    if (!judgments.has(index))
      return original;
    const rankedIndex = rankedJudgedIndices[rankedOffset++];
    const item = rankedIndex === undefined ? undefined : result.items[rankedIndex];
    const judgment = rankedIndex === undefined ? undefined : judgments.get(rankedIndex);
    const model = rankedIndex === undefined ? undefined : judgmentModels.get(rankedIndex);
    if (!item || !judgment || !model)
      return original;
    return Object.assign({}, item, {
      details: Object.assign({}, item.details, {
        semanticJudge: {
          classification: judgment.classification,
          probability: judgment.probability,
          ...judgment.confidence === undefined ? {} : { confidence: judgment.confidence },
          model,
          claim: SEMANTIC_JUDGE_NON_PROOF_CLAIM
        }
      })
    });
  });
  const candidatesUnjudged = candidates.length - judgments.size;
  const failureDetails = [
    ...new Set(execution.failures.map((failure) => boundedError(failure.error)))
  ];
  const status = execution.failures.length === 0 ? "complete" : judgments.size > 0 ? "partial" : "failed";
  const reason = execution.failures.length === 0 ? undefined : status === "failed" ? `Semantic judge unavailable; local semantic candidates retained without behavior classification: ${boundedError(failureDetails.join("; "))}` : `Semantic judge partially unavailable; ${String(candidatesUnjudged)} candidates retained in local order without behavior classification across ${String(execution.failures.length)} failed batch${execution.failures.length === 1 ? "" : "es"}: ${boundedError(failureDetails.join("; "))}`;
  const successfulResults = execution.successes.map((success) => success.result);
  const models = [...new Set(successfulResults.map((judged) => judged.model))];
  const model = models.length === 1 ? models[0] ?? config.model : config.model;
  const inputTokens = optionalUsageTotal(successfulResults, (judged) => judged.inputTokens);
  const outputTokens = optionalUsageTotal(successfulResults, (judged) => judged.outputTokens);
  return {
    ...result,
    partial: result.partial || execution.failures.length > 0,
    reasons: reason ? [...result.reasons, reason] : result.reasons,
    items: reordered,
    semanticJudge: {
      ...initial,
      status,
      model,
      judgedCandidates: judgments.size,
      candidatesUnjudged,
      batchesAttempted: execution.attempts,
      batchesCompleted: execution.successes.length,
      batchesFailed: execution.failures.length,
      batchesSplit: execution.splits,
      classificationCounts: counts,
      ...inputTokens === undefined ? {} : { inputTokens },
      ...outputTokens === undefined ? {} : { outputTokens },
      elapsedMs: Math.round(performance.now() - startedAt),
      ...reason ? { reason } : {}
    }
  };
}

// src/hybrid-search.ts
class HybridSourceChangedError extends ConceptSourceChangedError {
  constructor(message = "Hybrid source changed while exact and concept evidence were being merged") {
    super(message);
    this.name = "HybridSourceChangedError";
  }
}
function sameHybridLiteralScan(left, right) {
  if (left.totalMatches !== right.totalMatches || left.snapshotComplete !== right.snapshotComplete || left.fileCounts.size !== right.fileCounts.size)
    return false;
  const leftMatchesByDisplayPath = new Map;
  for (const match of left.matches) {
    if (!leftMatchesByDisplayPath.has(match.displayPath)) {
      leftMatchesByDisplayPath.set(match.displayPath, match);
    }
  }
  const rightMatchesByDisplayPath = new Map;
  for (const match of right.matches) {
    if (!rightMatchesByDisplayPath.has(match.displayPath)) {
      rightMatchesByDisplayPath.set(match.displayPath, match);
    }
  }
  for (const [path, count] of left.fileCounts) {
    if (right.fileCounts.get(path) !== count)
      return false;
    const leftMatch = leftMatchesByDisplayPath.get(path);
    const rightMatch = rightMatchesByDisplayPath.get(path);
    if (leftMatch?.absolutePath !== rightMatch?.absolutePath)
      return false;
    if (!leftMatch || !rightMatch)
      continue;
    const leftRevision = left.sourceRevisions.get(leftMatch.absolutePath);
    const rightRevision = right.sourceRevisions.get(rightMatch.absolutePath);
    if (leftRevision === undefined || rightRevision === undefined)
      continue;
    if (!sameSourceRevision(leftRevision, rightRevision))
      return false;
  }
  return true;
}
function rangesOverlap(left, right) {
  return left.start < right.end && right.start < left.end;
}
function hybridConceptLimit(value) {
  const candidate = value ?? DEFAULT_HYBRID_CONCEPT_LIMIT;
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > MAX_HYBRID_CONCEPT_LIMIT) {
    throw new SiftlightError(`conceptLimit must be an integer from 1 through ${String(MAX_HYBRID_CONCEPT_LIMIT)}`);
  }
  return candidate;
}
function absoluteOccurrenceRanges(document, line, match) {
  const lineRange = document.lineRange(line);
  return match.occurrences.map((occurrence) => ({
    start: lineRange.start + occurrence.byteStart,
    end: lineRange.start + occurrence.byteEnd
  }));
}
async function literalEvidence(scan, access, generation) {
  const documents = new Map;
  const unavailable = new Map;
  const generatedDocuments = new Map(generation.documents.map((document) => [resolve19(access.cwd, document.path), document]));
  for (const match of scan.matches) {
    if (documents.has(match.absolutePath) || unavailable.has(match.absolutePath))
      continue;
    try {
      const generated = generatedDocuments.get(resolve19(access.cwd, match.absolutePath));
      const document = generated ?? await access.load(match.absolutePath);
      const expected = scan.sourceRevisions.get(match.absolutePath);
      if (!expected) {
        unavailable.set(match.absolutePath, "source revision metadata was unavailable");
        continue;
      }
      if (document.reference.origin.kind !== "worktree") {
        unavailable.set(match.absolutePath, "source revision origin was unavailable");
        continue;
      }
      if (!sameSourceRevision(expected, document.reference.origin.revision)) {
        throw new HybridSourceChangedError(`${match.displayPath}: source revision changed while preparing hybrid evidence`);
      }
      documents.set(match.absolutePath, document);
    } catch (error) {
      if (error instanceof SourceDocumentError && error.reason === "source-changed")
        throw new HybridSourceChangedError(`${match.displayPath}: ${error.message}`);
      if (error instanceof SourceBudgetError || error instanceof SourceDocumentError) {
        unavailable.set(match.absolutePath, error.message);
        continue;
      }
      throw error;
    }
  }
  const rangesByPath = new Map;
  const items = scan.matches.map((match) => {
    const document = documents.get(match.absolutePath);
    const path = document?.path ?? match.displayPath;
    const ranges = document ? absoluteOccurrenceRanges(document, match.lineNumber, match) : [];
    if (ranges.length) {
      const existing = rangesByPath.get(path) ?? [];
      existing.push(...ranges);
      rangesByPath.set(path, existing);
    }
    const primary = ranges[0];
    return {
      path,
      line: match.lineNumber,
      label: `Literal exact match (${String(match.occurrences.length)} occurrence${match.occurrences.length === 1 ? "" : "s"})${document && primary ? "" : "; source inspection unavailable"}`,
      excerpt: match.lineContent,
      ...document && primary ? { source: document.reference, range: primary } : {},
      details: {
        kind: "literal-match",
        source: "literal",
        certainty: "exact",
        sourceVerified: Boolean(document && primary),
        occurrenceCount: match.occurrences.length,
        ranges,
        lineContentTruncated: match.lineTruncated
      }
    };
  });
  const reasons = [...new Set(unavailable.values())].map((reason) => `Literal source inspection is unavailable for retained evidence: ${reason}`);
  return {
    items,
    rangesByPath,
    sourceCoverage: unavailable.size ? "partial" : "complete",
    reasons
  };
}
function isLiteralOverlap(item, rangesByPath) {
  const itemRange = item.range;
  if (!itemRange)
    return false;
  return (rangesByPath.get(item.path) ?? []).some((range) => rangesOverlap(range, itemRange));
}
async function combineHybridSearch(scan, execution, access, conceptLimit, query, semanticJudge, signal) {
  const concept = execution.analysis;
  if (concept.kind !== "concept")
    throw new Error("Hybrid search requires concept evidence");
  await verifyConceptSourceGeneration(execution.sourceGeneration, access);
  const literal = await literalEvidence(scan, access, execution.sourceGeneration);
  const retainedRanges = new Map;
  const eligibleConcept = concept.items.filter((item) => {
    if (isLiteralOverlap(item, literal.rangesByPath))
      return false;
    const range = item.range;
    if (!range)
      return true;
    const ranges = retainedRanges.get(item.path) ?? [];
    let low = 0;
    let high = ranges.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (ranges[middle].start < range.start)
        low = middle + 1;
      else
        high = middle;
    }
    const previous = ranges[low - 1];
    const next = ranges[low];
    if (previous && rangesOverlap(previous, range) || next && rangesOverlap(next, range))
      return false;
    ranges.splice(low, 0, range);
    retainedRanges.set(item.path, ranges);
    return true;
  });
  const duplicateConceptCandidates = concept.items.length - eligibleConcept.length;
  const judgedConcept = await applySemanticJudge({
    kind: "hybrid",
    unit: "evidence-items",
    items: eligibleConcept,
    partial: false,
    reasons: []
  }, query, semanticJudge, signal);
  const selectedConcept = judgedConcept.items.slice(0, conceptLimit).map((item) => Object.assign({}, item, {
    details: Object.assign({}, item.details, { source: "concept" })
  }));
  const conceptCandidatesOmitted = Math.max(0, eligibleConcept.length - selectedConcept.length);
  const literalOccurrencesRetained = scan.matches.reduce((total, match) => total + match.occurrences.length, 0);
  const literalCoverage = scan.snapshotComplete ? "complete" : "partial";
  const conceptCoverage = concept.coverage?.conceptCandidates ?? (concept.partial ? "partial" : "complete");
  const conceptSourceCoverage = execution.sourceGeneration.partial ? "partial" : "complete";
  const deduplicationCoverage = scan.snapshotComplete && literal.sourceCoverage === "complete" && conceptSourceCoverage === "complete" ? "complete" : "partial";
  const partial = !scan.snapshotComplete || concept.partial || conceptCoverage === "skipped" || conceptSourceCoverage === "partial" || literal.sourceCoverage === "partial" || deduplicationCoverage === "partial" || judgedConcept.semanticJudge?.status === "failed" || judgedConcept.semanticJudge?.status === "partial";
  const selectionReason = conceptCandidatesOmitted ? `Hybrid concept limit retained the top ${String(selectedConcept.length)} of ${String(eligibleConcept.length)} non-overlapping semantic candidates` : undefined;
  return {
    kind: "hybrid",
    unit: "evidence-items",
    items: [...literal.items, ...selectedConcept],
    partial,
    reasons: [
      ...scan.retention?.reasons ?? [],
      ...concept.reasons,
      ...literal.reasons,
      ...execution.sourceGeneration.reasons,
      ...selectionReason ? [selectionReason] : [],
      ...judgedConcept.semanticJudge?.reason ? [judgedConcept.semanticJudge.reason] : []
    ],
    filesRead: (concept.filesRead ?? 0) + access.filesRead,
    bytesRead: (concept.bytesRead ?? 0) + access.bytesRead,
    counts: {
      ...concept.counts,
      literalMatchingLinesFound: scan.totalMatches,
      literalMatchingLinesPrepared: literal.items.length,
      literalOccurrencesRetained,
      conceptCandidatesRanked: concept.items.length,
      conceptCandidatesDeduplicated: duplicateConceptCandidates,
      conceptCandidatesEligible: eligibleConcept.length,
      conceptCandidatesSelected: selectedConcept.length,
      conceptCandidatesOmitted,
      literalItemsRetained: literal.items.length,
      conceptItemsRetained: selectedConcept.length,
      ...judgedConcept.semanticJudge ? {
        semanticJudgeCandidatesConsidered: judgedConcept.semanticJudge.candidatesConsidered,
        semanticJudgeCandidatesJudged: judgedConcept.semanticJudge.judgedCandidates
      } : {}
    },
    ...concept.scope ? { scope: concept.scope } : {},
    coverage: {
      literalMatches: literalCoverage,
      conceptCandidates: conceptCoverage,
      crossSourceDeduplication: deduplicationCoverage,
      sourceInspection: literal.sourceCoverage,
      conceptSourceInspection: conceptSourceCoverage,
      retention: "complete"
    },
    ...concept.stats ? { stats: concept.stats } : {},
    ...concept.redact !== undefined ? { redact: concept.redact } : {},
    ...concept.sourceGeneration ? { sourceGeneration: concept.sourceGeneration } : {},
    ...judgedConcept.semanticJudge ? { semanticJudge: judgedConcept.semanticJudge } : {}
  };
}
function retainedHybridCounts(original, items) {
  let literalItemsRetained = 0;
  let conceptItemsRetained = 0;
  for (const item of items) {
    if (item.details?.source === "literal")
      literalItemsRetained += 1;
    if (item.details?.source === "concept")
      conceptItemsRetained += 1;
  }
  return { ...original, literalItemsRetained, conceptItemsRetained };
}

// src/validation-output.ts
function sourceItem(status, index) {
  return {
    path: status.path,
    line: 1,
    label: `source ${status.status}`,
    details: {
      role: status.role,
      status: status.status,
      ...status.reason ? { reason: status.reason } : {},
      index
    }
  };
}
function publicSourceStatus(status) {
  const reference = status.current ?? status.expected;
  const actualTarget = status.actualTarget ?? (reference === undefined ? undefined : reference.origin.kind === "git" ? "recorded-git" : "current-worktree");
  return {
    path: status.path,
    role: status.role,
    status: status.status,
    ...actualTarget ? { actualTarget } : {},
    ...status.reason ? { reason: status.reason } : {}
  };
}
function sourceStatusRank(status) {
  return status === "stale" ? 0 : status === "unknown" ? 1 : 2;
}
function publicValidationDetails(scope, sources, values) {
  const ordered = [...sources].toSorted((left, right) => {
    return sourceStatusRank(left.status) - sourceStatusRank(right.status) || left.path.localeCompare(right.path);
  });
  const visible = [];
  let sourceBytes = 0;
  for (const source of ordered) {
    const compact = publicSourceStatus(source);
    const rowBytes = Buffer.byteLength(JSON.stringify(compact));
    if (visible.length > 0 && sourceBytes + rowBytes > 4096)
      break;
    visible.push(compact);
    sourceBytes += rowBytes;
  }
  const omitted = sources.length - visible.length;
  return {
    scope,
    checked: visible.filter((source) => source.status !== "unknown"),
    unchecked: visible.filter((source) => source.status === "unknown"),
    ...omitted > 0 ? { sourceOmitted: omitted } : {},
    ...values
  };
}
function base(mode, status, total, files, returned = total) {
  return {
    version: 1,
    mode,
    status,
    totalMatches: total,
    storedMatches: total,
    totalFiles: files,
    returnedMatches: returned,
    snapshotComplete: status === "complete"
  };
}
function validationResult(state, cursor, checkInterval) {
  const { recheck, comparisonTarget, coverage } = state;
  const status = state.storedPartial || coverage === "partial" || recheck.validity !== "current" ? "partial" : "complete";
  const reasons = [...new Set([...state.reasons ?? [], ...recheck.reasons])];
  const validation = publicValidationDetails(state.scope, recheck.sources, {
    comparisonTarget,
    freshness: recheck.validity,
    coverage,
    truncation: { truncated: state.storedPartial, reasons },
    checkInterval
  });
  const analysis = {
    kind: "validate",
    unit: "evidence-items",
    totalItems: recheck.sources.length,
    returnedItems: validation.checked.length + validation.unchecked.length,
    items: [...validation.checked, ...validation.unchecked].map((source, index) => Object.assign(sourceItem(source, index + 1), { index: index + 1 })),
    reasons,
    validation
  };
  const details = {
    ...base("validate", status, recheck.sources.length, new Set(recheck.sources.map((source) => source.path)).size, validation.checked.length + validation.unchecked.length),
    cursor,
    analysis,
    validation
  };
  const sourceRows = [...validation.checked, ...validation.unchecked].map((source, index) => `#${String(index + 1)} ${JSON.stringify(source.path)}: ${source.status}${source.reason ? ` (${source.reason})` : ""}`);
  return {
    text: `Evidence validation is ${recheck.validity}; checked ${String(validation.checked.length)} source(s), ${String(validation.unchecked.length)} require attention; coverage ${coverage}; target ${comparisonTarget}; check interval ${String(checkInterval.start)}-${String(checkInterval.end)}.${validation.sourceOmitted ? ` ${String(validation.sourceOmitted)} source(s) omitted from this page.` : ""}${reasons.length ? ` ${reasons.join(" ")}` : ""}${sourceRows.length ? `
${sourceRows.join(`
`)}` : ""}`,
    details
  };
}

// src/evidence-service.ts
import { realpath as realpath6 } from "node:fs/promises";
function isEvidenceRequest(input) {
  return input.mode === "concept" || input.mode === "hybrid" || input.mode === "structure" || input.mode === "files" || input.mode === "inspect" || input.mode === "outline" || input.mode === "imports" || input.mode === "tests" || input.mode === "validate" || input.sourceCursor !== undefined || input.anyOf !== undefined || input.allOf !== undefined || input.within !== undefined || input.roles !== undefined || input.changes !== undefined || input.symbol !== undefined || input.conceptLimit !== undefined || (input.cursor?.includes(".analysis") ?? false);
}
function maxFilesToParse(value) {
  const candidate = value ?? MAX_STRUCTURE_FILES;
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > MAX_CONFIGURABLE_STRUCTURE_FILES) {
    throw new SiftlightError(`maxFilesToParse must be an integer from 1 through ${String(MAX_CONFIGURABLE_STRUCTURE_FILES)}`);
  }
  return candidate;
}
function validateTerms(input) {
  const terms = input.allOf;
  if (terms === undefined) {
    if (input.within !== undefined) {
      throw new SiftlightError("within is only valid with allOf; omit within for ordinary single-pattern searches");
    }
    return;
  }
  if (!Array.isArray(terms) || terms.length < 2 || terms.length > 3 || terms.some((term) => typeof term !== "string" || !term.trim() || /[\r\n\0]/.test(term)) || new Set(terms).size !== terms.length)
    throw new SiftlightError("allOf requires 2–3 distinct, nonempty, single-line literal terms");
  if (input.pattern !== undefined || input.roles !== undefined || input.literal !== undefined || input.ignoreCase !== undefined || input.wholeWord !== undefined)
    throw new SiftlightError("allOf is an explicit case-sensitive literal conjunction; omit pattern, roles, literal and ignoreCase");
  if (input.within !== undefined && input.within !== "file" && input.within !== "function")
    throw new SiftlightError("within must be file or function");
  return terms;
}
function fileConjunction(document, terms, allowed) {
  const evidence = terms.map((term) => ({
    term,
    ranges: literalOccurrences(document, term, allowed)
  }));
  if (evidence.some((item) => !item.ranges.length))
    return;
  const first = evidence[0]?.ranges[0];
  if (!first)
    throw new Error("Conjunction evidence unavailable");
  return {
    path: document.path,
    line: document.lineAt(first.start),
    label: "All terms occur in this file; no cross-file or execution-path claim",
    source: document.reference,
    range: first,
    details: {
      terms: evidence.map((item) => ({
        term: item.term,
        occurrences: item.ranges.length,
        evidence: item.ranges.slice(0, 3).map((range) => ({
          start: range.start,
          end: range.end,
          line: document.lineAt(range.start),
          text: document.slice(document.lineRange(document.lineAt(range.start))).slice(0, 500)
        }))
      })),
      scope: allowed ? "changed-lines" : "file",
      unit: "files"
    }
  };
}
function searchScope(request) {
  const path = request.path ?? ".";
  const requestedPath = request.expandedFromPath ?? path;
  return {
    path,
    requestedPath,
    glob: [...request.glob],
    exclude: [...request.exclude],
    hidden: request.hidden,
    ignorePolicy: request.ignorePolicy ?? "respect",
    expandedToProjectRoot: request.expandedFromPath !== undefined,
    assertion: path === "." ? "project-wide" : "requested-scope",
    ...request.modifiedAfterMs !== undefined ? { modifiedAfterMs: request.modifiedAfterMs } : {},
    ...request.modifiedBeforeMs !== undefined ? { modifiedBeforeMs: request.modifiedBeforeMs } : {}
  };
}
async function navigationRoot(cwd, path, signal) {
  const absolute = resolve20(cwd, path);
  const repository = await findGitRepository(dirname4(absolute), signal);
  if (repository)
    return repository;
  return isPathInsideCwd(absolute, cwd) ? resolve20(cwd) : dirname4(absolute);
}
function navigationFilters(input) {
  const request = normalizeRequest({
    pattern: "",
    ...input.glob !== undefined ? { glob: input.glob } : {},
    ...input.exclude !== undefined ? { exclude: input.exclude } : {},
    ...input.hidden !== undefined ? { hidden: input.hidden } : {}
  });
  return { glob: request.glob, exclude: request.exclude, hidden: request.hidden };
}
async function navigationScope(cwd, root, requestedPath, filters) {
  const [canonicalCwd, canonicalRoot] = await Promise.all([
    realpath6(resolve20(cwd)).catch(() => resolve20(cwd)),
    realpath6(root).catch(() => resolve20(root))
  ]);
  const isProjectRoot = canonicalRoot === canonicalCwd;
  return {
    path: isProjectRoot ? "." : canonicalRoot,
    requestedPath,
    glob: [...filters.glob],
    exclude: [...filters.exclude],
    hidden: filters.hidden,
    ignorePolicy: "respect",
    expandedToProjectRoot: false,
    assertion: isProjectRoot ? "project-wide" : "requested-scope"
  };
}
async function canonicalNavigationPath(path) {
  return realpath6(path).catch(() => resolve20(path));
}
async function canonicalNavigationFiles(cwd, root, files, primaryPath) {
  const canonicalRoot = await canonicalNavigationPath(root);
  const [enumerated, canonicalPrimary] = await Promise.all([
    Promise.all(files.paths.map((file) => canonicalNavigationPath(resolve20(cwd, file)))),
    canonicalNavigationPath(resolve20(cwd, primaryPath))
  ]);
  const allowed = new Set(enumerated.filter((path) => isPathInsideRoot(path, canonicalRoot)));
  if (isPathInsideRoot(canonicalPrimary, canonicalRoot))
    allowed.add(canonicalPrimary);
  return { allowed, primaryPath: canonicalPrimary };
}

class EvidenceService {
  #runner;
  #snapshots;
  #structure;
  #conceptSearch;
  #semanticJudge;
  #queue = new SyntaxQueue;
  #analyses = new AnalysisStore;
  #continuations = new SourceContinuations;
  constructor(runner, snapshots, structure, runConceptSearch = conceptSearch, semanticJudge) {
    this.#runner = runner;
    this.#snapshots = snapshots;
    this.#structure = structure;
    this.#conceptSearch = runConceptSearch;
    this.#semanticJudge = semanticJudge;
  }
  clear() {
    this.#analyses.clear();
    this.#continuations.clear();
    this.#queue.clear();
  }
  async shutdown() {
    this.clear();
    await this.#queue.shutdown();
  }
  async#validateSavedEvidence(input, cwd, signal) {
    const cursor = input.cursor;
    if (!cursor)
      throw new SiftlightError("A saved evidence cursor is required");
    const startedAt = Date.now();
    const validated = await validateSavedEvidence({
      cursor,
      cwd,
      ...signal ? { signal } : {},
      ...input.matchIndex !== undefined ? { matchIndex: input.matchIndex } : {},
      analyses: this.#analyses,
      snapshots: this.#snapshots,
      queue: this.#queue,
      maxFiles: MAX_STRUCTURE_FILES
    });
    const finishedAt = Date.now();
    return validationResult(validated, cursor, {
      start: startedAt,
      end: finishedAt,
      ...input.matchIndex !== undefined ? { selected: input.matchIndex } : {}
    });
  }
  async#testEntryPaths(root, files, cwd, filters, signal) {
    const sourceGlobs = ["*.js", "*.jsx", "*.mjs", "*.cjs", "*.ts", "*.tsx", "*.mts", "*.cts"];
    const request = normalizeRequest({
      pattern: TEST_DISCOVERY_PATTERN,
      path: root,
      glob: filters.glob.length ? filters.glob : sourceGlobs,
      exclude: filters.exclude,
      hidden: filters.hidden,
      ignoreCase: false
    });
    const scan = await this.#runner(request, cwd, signal);
    const contentCandidates = new Set(scan.fileCounts.keys());
    return files.filter((path) => isLikelyTestPath(path) || contentCandidates.has(workspaceRelativePath(cwd, path)));
  }
  async#candidates(request, input, access) {
    const collect = (candidateRequest) => collectEvidenceCandidates({
      request: candidateRequest,
      ...input.changes ? { changes: input.changes } : {},
      cwd: access.cwd,
      ...access.signal ? { signal: access.signal } : {},
      access,
      runRipgrep: this.#runner,
      maxFiles: access.maxFiles
    });
    const candidates = await collect(request);
    if (input.changes || request.scope === "strict" || request.path === undefined || candidates.files.length > 0 || candidates.partial) {
      return { candidates, request };
    }
    const { path: requestedPath, ...projectRequest } = request;
    const expandedRequest = { ...projectRequest, expandedFromPath: requestedPath };
    return { candidates: await collect(expandedRequest), request: expandedRequest };
  }
  async search(input, cwd, signal, options = {}) {
    if (signal?.aborted)
      throw abortError();
    if (input.changes && (input.modifiedAfter !== undefined || input.modifiedBefore !== undefined))
      throw new SiftlightError("modifiedAfter and modifiedBefore apply to worktree searches and cannot be combined with changes");
    const analysisStarted = performance.now();
    const fileLimit = maxFilesToParse(input.maxFilesToParse);
    const access = new SourceAccess(cwd, this.#queue, signal, { maxFiles: fileLimit });
    if (input.mode === "validate")
      return this.#validateSavedEvidence(input, cwd, signal);
    if (input.sourceCursor !== undefined) {
      if (typeof input.sourceCursor !== "string" || !input.sourceCursor.trim())
        throw new CursorError("A nonempty sourceCursor is required");
      if (input.mode !== "inspect")
        throw new SiftlightError("sourceCursor requires mode=inspect");
      return continueSource(input.sourceCursor, access, this.#continuations);
    }
    if (input.mode === "inspect") {
      const targets = this.#inspectionTargets(input, cwd);
      return targets.some((target) => target.range !== undefined) ? inspectDocumentsMetadata(targets, access, this.#structure) : inspectDocuments(targets, access, this.#continuations, this.#structure);
    }
    if (input.mode === "concept") {
      const execution = await this.#conceptSearch(input, access, options.onProgress);
      return this.#analyses.page(this.#analyses.create(execution.analysis), options.modelOutput);
    }
    if (input.mode === "hybrid") {
      const query = validateConceptQuery(input.query);
      const limit = hybridConceptLimit(input.conceptLimit);
      const literalRequest = normalizeRequest({
        pattern: query,
        ...input.path !== undefined ? { path: input.path } : {},
        ...input.glob !== undefined ? { glob: input.glob } : {},
        ...input.exclude !== undefined ? { exclude: input.exclude } : {},
        ...input.hidden !== undefined ? { hidden: input.hidden } : {},
        literal: true,
        scope: "strict",
        redact: input.redact ?? false
      });
      let literalResult;
      let conceptResult;
      let conceptAccess;
      let conceptFailure;
      options.onProgress?.({ phase: "literal-search" });
      await runOwnedParallel((groupSignal) => {
        conceptAccess = new SourceAccess(cwd, this.#queue, groupSignal, { maxFiles: fileLimit });
        return [
          this.#runner(literalRequest, cwd, groupSignal).then((result) => {
            literalResult = result;
            return;
          }),
          this.#conceptSearch(input, conceptAccess, options.onProgress).then((result) => {
            conceptResult = result;
            return;
          }).catch((error) => {
            if (signal?.aborted || groupSignal.aborted)
              throw error;
            conceptFailure = error;
            return;
          })
        ];
      }, signal);
      if (!literalResult || !conceptAccess)
        throw new Error("Hybrid search did not settle its owned literal operation");
      if (!conceptResult) {
        if (conceptFailure instanceof Error)
          throw conceptFailure;
        throw new SiftlightError("Concept search failed without a diagnostic");
      }
      const firstLiteralResult = literalResult;
      const verifiedLiteralResult = await this.#runner(literalRequest, cwd, signal);
      if (!sameHybridLiteralScan(firstLiteralResult, verifiedLiteralResult)) {
        throw new HybridSourceChangedError("Literal source evidence changed while concept evidence was being computed");
      }
      const literalAccess = new SourceAccess(cwd, this.#queue, signal, { maxFiles: fileLimit });
      const hybrid = await combineHybridSearch(verifiedLiteralResult, conceptResult, literalAccess, limit, query, this.#semanticJudge, signal);
      const originalCounts = hybrid.counts ?? {};
      const cursor = this.#analyses.create(hybrid, (items) => ({
        counts: retainedHybridCounts(originalCounts, items)
      }));
      return this.#analyses.page(cursor, options.modelOutput);
    }
    if (input.mode === "structure") {
      return this.#analyses.page(this.#analyses.create(await structuralSearch(input, access)), options.modelOutput);
    }
    if (input.mode === "files") {
      return this.#analyses.page(this.#analyses.create(await discoverFiles(input, cwd, signal)), options.modelOutput);
    }
    if (input.cursor?.includes(".analysis") && !input.mode?.match(/^(outline|imports|tests)$/)) {
      this.#analyses.resolve(input.cursor);
      if (input.mode !== undefined && input.mode !== "matches" && input.mode !== "auto")
        throw new CursorError("Analysis cursor cannot continue in the requested mode", "E_CURSOR_WRONG_KIND");
      return this.#analyses.page(input.cursor, options.modelOutput);
    }
    if (input.mode === "outline" || input.mode === "imports" || input.mode === "tests")
      return this.#navigate(input, access, options);
    const anyOf = validateAnyOf(input.anyOf);
    if (anyOf) {
      if (input.pattern !== undefined || input.allOf !== undefined || input.within !== undefined || input.roles !== undefined || input.literal !== undefined || input.ignoreCase !== undefined || input.wholeWord !== undefined)
        throw new SiftlightError("anyOf is an explicit case-sensitive literal union; omit pattern, allOf, within, roles, literal and ignoreCase");
      if (input.mode !== undefined && input.mode !== "auto" && input.mode !== "matches")
        throw new SiftlightError("anyOf mode must be omitted, auto, or matches");
      const chunks = Array.from({ length: Math.ceil(anyOf.length / MAX_ANY_OF_TERMS) }, (_, index) => anyOf.slice(index * MAX_ANY_OF_TERMS, (index + 1) * MAX_ANY_OF_TERMS));
      const { path: _inputPath, ...unscopedInput } = input;
      let chunkAccess = access;
      const runChunks = async (expandedFromPath) => runOwnedParallel((groupSignal) => {
        chunkAccess = new SourceAccess(cwd, this.#queue, groupSignal, { maxFiles: fileLimit });
        return chunks.map(async (chunk) => {
          const request = normalizeRequest({
            ...expandedFromPath === undefined ? input : unscopedInput,
            pattern: chunk.map(escapeRegexLiteral).join("|"),
            literal: false,
            ignoreCase: false
          });
          const effectiveRequest = expandedFromPath === undefined ? request : { ...request, expandedFromPath };
          const candidates = await collectEvidenceCandidates({
            request: effectiveRequest,
            ...input.changes ? { changes: input.changes } : {},
            cwd,
            signal: groupSignal,
            access: chunkAccess,
            runRipgrep: this.#runner,
            maxFiles: fileLimit
          });
          return { chunk, request: effectiveRequest, candidates };
        });
      }, signal);
      let chunkResults = await runChunks();
      if (!input.changes && input.path !== undefined && input.scope !== "strict" && chunkResults.every(({ candidates }) => !candidates.partial && candidates.files.length === 0)) {
        chunkResults = await runChunks(input.path.replace(/^@/, ""));
      }
      const reasons = new Set;
      let partial = false;
      let changes;
      const candidateFiles = new Map;
      const invalidatedPaths = new Set;
      for (const { candidates } of chunkResults) {
        partial ||= candidates.partial;
        changes ??= candidates.changes;
        for (const reason of candidates.reasons)
          reasons.add(reason);
        for (const file of candidates.files) {
          if (invalidatedPaths.has(file.document.path))
            continue;
          const existing = candidateFiles.get(file.document.path);
          if (existing && JSON.stringify(existing.document.reference) !== JSON.stringify(file.document.reference)) {
            candidateFiles.delete(file.document.path);
            invalidatedPaths.add(file.document.path);
            partial = true;
            reasons.add(`Source changed across anyOf chunks: ${file.document.path}`);
          } else
            candidateFiles.set(file.document.path, file);
        }
      }
      const expanded = expandMultiTermCandidates([...candidateFiles.values()], anyOf, input.changes?.scope === "lines");
      partial ||= expanded.partial;
      for (const reason of expanded.reasons)
        reasons.add(reason);
      const scope = searchScope(chunkResults[0]?.request ?? normalizeRequest({
        ...input,
        pattern: chunks[0]?.map(escapeRegexLiteral).join("|") ?? "",
        literal: false,
        ignoreCase: false
      }));
      const result = {
        kind: "any-of",
        unit: "occurrences",
        items: expanded.items,
        partial,
        reasons: [...reasons],
        filesRead: chunkAccess.filesRead,
        bytesRead: chunkAccess.bytesRead,
        ...changes ? { changes } : {},
        scope,
        chunks: {
          chunked: chunks.length > 1,
          count: chunks.length,
          maxTermsPerChunk: MAX_ANY_OF_TERMS,
          execution: chunks.length > 1 ? "bounded-parallel" : "single"
        },
        coverage: { exactOccurrences: partial ? "partial" : "complete" },
        redact: input.redact ?? false
      };
      return this.#analyses.page(this.#analyses.create(result, (retainedItems) => ({
        termCounts: retainedTermCounts(anyOf, retainedItems)
      })), options.modelOutput);
    }
    const terms = validateTerms(input);
    if (input.roles !== undefined && (!input.roles.length || input.roles.some((role) => ![
      "declaration",
      "call",
      "import",
      "export",
      "comment",
      "string",
      "jsx-text",
      "code",
      "unknown"
    ].includes(role))))
      throw new SiftlightError("roles must contain supported syntactic roles");
    const request = normalizeRequest(terms ? {
      ...input,
      pattern: terms.map(escapeRegexLiteral).join("|"),
      literal: false,
      ignoreCase: false
    } : input);
    const selected = await this.#candidates(request, input, access);
    const candidates = selected.candidates;
    const kind = terms ? input.within === "function" ? "function-and" : "file-and" : input.roles ? "roles" : "changes";
    const result = {
      kind,
      unit: kind === "function-and" ? "functions" : kind === "file-and" ? "files" : "occurrences",
      items: [],
      partial: candidates.partial,
      reasons: [...candidates.reasons],
      filesRead: candidates.filesRead,
      bytesRead: candidates.bytesRead,
      ...candidates.changes ? { changes: candidates.changes } : {},
      scope: searchScope(selected.request),
      coverage: {
        candidateSearch: candidates.partial ? "partial" : "complete",
        ...terms || input.roles ? { syntaxClassification: "complete" } : {}
      },
      redact: input.redact ?? false
    };
    let syntaxCapableFiles = 0;
    const processFile = async (index) => {
      const file = candidates.files[index];
      if (!file)
        return;
      try {
        if (!file.document.utf8) {
          result.partial = true;
          result.reasons.push(`${file.document.path}: non-UTF-8 evidence cannot be reliably classified`);
        } else if (terms && input.within !== "function") {
          const item = fileConjunction(file.document, terms, input.changes?.scope === "lines" ? file.changedRanges : undefined);
          if (item)
            result.items.push(item);
        } else if (terms || input.roles) {
          if (syntaxLanguage(file.document.path))
            syntaxCapableFiles += 1;
          const syntax = await access.syntax(file.document);
          const classified = terms ? findFunctionConjunctions(file.document, syntax, terms, input.changes?.scope === "lines" ? file.changedRanges : undefined) : filterRoleOccurrences(file.document, syntax, file.occurrences, input.roles ?? []);
          result.items.push(...classified.items);
          result.partial ||= classified.partial;
          if (classified.partial && result.coverage)
            result.coverage.syntaxClassification = "partial";
          result.reasons.push(...classified.reasons);
        } else {
          for (const range of file.occurrences) {
            const line = file.document.lineAt(range.start);
            result.items.push({
              path: file.document.path,
              line,
              label: `${file.change ?? "changed"} source occurrence`,
              excerpt: file.document.slice(file.document.lineRange(line)).slice(0, 500),
              source: file.document.reference,
              range,
              details: { change: file.change, byteRange: range }
            });
          }
        }
      } catch (error) {
        if (!(error instanceof SourceBudgetError))
          throw error;
        result.partial = true;
        result.reasons.push(error.message);
        return;
      } finally {
        access.releaseSyntax(file.document);
      }
      await processFile(index + 1);
    };
    await processFile(0);
    result.reasons = [...new Set(result.reasons)];
    if ((input.roles || terms && input.within === "function") && syntaxCapableFiles === 0) {
      throw new SiftlightError(`${input.roles ? "roles" : "within=function"} requires a supported source language; use ordinary search or file-level allOf for non-code content`);
    }
    if (terms || input.roles) {
      result.stats = {
        filesEnumerated: candidates.files.length,
        filesParsed: access.syntaxParses,
        filesSkipped: Math.max(0, candidates.files.length - syntaxCapableFiles),
        cacheHits: access.syntaxCacheHits,
        parseMs: Math.round(performance.now() - analysisStarted),
        budgetExhausted: result.reasons.some((reason) => reason.includes("limit") || reason.includes("budget-exhausted"))
      };
    }
    return this.#analyses.page(this.#analyses.create(result), options.modelOutput);
  }
  #inspectionTargets(input, cwd) {
    if (input.targets !== undefined && input.matchIndices !== undefined)
      throw new SiftlightError("Use targets or matchIndices, not both");
    if (input.targets !== undefined || input.matchIndices !== undefined) {
      if (input.path !== undefined || input.line !== undefined || input.matchIndex !== undefined)
        throw new SiftlightError("Batch inspection accepts targets or matchIndices instead of path, line or matchIndex");
      const size = input.targets?.length ?? input.matchIndices?.length ?? 0;
      if (size < 1 || size > MAX_INSPECT_TARGETS)
        throw new SiftlightError("Batch inspection requires 1-5 targets");
      if (input.targets) {
        if (input.cursor !== undefined)
          throw new SiftlightError("targets cannot be combined with cursor");
        return input.targets.map((target) => matchInspectionTarget(resolveInspectionTarget(target, cwd, this.#snapshots)));
      }
      if (!input.cursor)
        throw new SiftlightError("matchIndices requires a cursor");
      const cursor = input.cursor;
      return (input.matchIndices ?? []).map((matchIndex) => this.#singleTarget({ cursor, matchIndex }, cwd));
    }
    return [this.#singleTarget(input, cwd)];
  }
  #singleTarget(input, cwd) {
    if (input.cursor?.includes(".analysis.")) {
      if (input.path !== undefined || input.line !== undefined || input.matchIndex === undefined)
        throw new CursorError("Analysis inspection requires only cursor and matchIndex");
      const item = this.#analyses.item(input.cursor, input.matchIndex);
      if (!item.source || !item.range)
        throw new CursorError("This analysis item has no verified source range");
      const metadataOnly = item.details?.kind === "symbol" || item.details?.kind === "function";
      return {
        path: item.path,
        line: item.line,
        reference: item.source,
        ...metadataOnly ? { range: item.range } : { absoluteFocus: item.range.start }
      };
    }
    return {
      ...matchInspectionTarget(resolveInspectionTarget(input, cwd, this.#snapshots)),
      ...input.matchIndex !== undefined ? { matchIndex: input.matchIndex } : {}
    };
  }
  async#navigate(input, access, options = {}) {
    const navigationStarted = performance.now();
    let path = input.path;
    let reference;
    let line = input.line;
    let loaded;
    if (input.cursor) {
      if (input.path !== undefined || input.line !== undefined || input.matchIndex === undefined)
        throw new SiftlightError("Snapshot navigation requires cursor+matchIndex instead of path/line");
      const selected = this.#singleTarget(input, access.cwd);
      path = selected.path;
      line = selected.line;
      reference = selected.reference;
      if (selected.unverified)
        throw new SiftlightError("Snapshot source revision is unverified; refresh the search");
      if (selected.expectedRevision) {
        const doc = await access.load(path);
        if (doc.reference.origin.kind !== "worktree" || !sameSourceRevision(selected.expectedRevision, doc.reference.origin.revision))
          throw new SiftlightError("Source changed; refresh the search");
        reference = doc.reference;
        loaded = doc;
      }
    } else if (input.matchIndex !== undefined)
      throw new SiftlightError("matchIndex requires a cursor");
    if (!path)
      throw new SiftlightError(`${input.mode} requires path or cursor+matchIndex`);
    const document = loaded ?? await access.load(path, reference);
    const language = syntaxLanguage(document.path);
    const isPython = /\.py$/iu.test(document.path);
    if (input.mode === "outline") {
      const capabilityFailure = outlineCapabilityError(document.path, "outline", true);
      if (capabilityFailure)
        throw capabilityFailure;
      if (!language && !isPython)
        throw new SiftlightError(`No outline provider is registered for ${document.path}; use mode=capabilities to inspect available language modes`);
    }
    if (!language && !isPython || language === "go") {
      const extension = extname3(document.path) || "extensionless source";
      throw new SiftlightError(`${input.mode} is unavailable for ${extension}; choose a language capability from mode=capabilities or use ordinary content search`);
    }
    if (input.mode === "outline") {
      const syntax = isPython ? undefined : await access.syntax(document);
      const supported = isPython || syntax?.status === "ok" && syntax.language !== "go";
      const items = supported ? isPython ? parsePythonOutline(document).map((symbol) => ({
        path: document.path,
        line: symbol.startLine,
        label: `${symbol.kind} ${symbol.name}${symbol.hasBody ? "" : " (no implementation body)"}`,
        excerpt: symbol.signature,
        source: document.reference,
        range: symbol.range,
        details: {
          kind: "symbol",
          language: "python",
          name: symbol.name,
          scope: symbol.scope,
          hasBody: symbol.hasBody,
          exported: false,
          syntax: "indentation-based outline; not compiler binding"
        }
      })) : (syntax?.symbols ?? []).map((symbol) => {
        const range = {
          start: document.toByteOffset(symbol.start),
          end: document.toByteOffset(symbol.end)
        };
        const firstLine = document.lineAt(range.start);
        const signatureEnd = symbol.bodyStart ?? symbol.end;
        const signature = document.text.slice(symbol.start, Math.min(signatureEnd, symbol.start + 600));
        return {
          path: document.path,
          line: firstLine,
          label: `${symbol.kind} ${symbol.name}${symbol.hasBody ? "" : " (no implementation body)"}`,
          excerpt: signature,
          source: document.reference,
          range,
          details: {
            kind: "symbol",
            name: symbol.name,
            scope: symbol.scope,
            hasBody: symbol.hasBody,
            exported: symbol.exported,
            signatureTruncated: signatureEnd - symbol.start > 600
          }
        };
      }) : [];
      return this.#analyses.page(this.#analyses.create({
        kind: "outline",
        unit: "symbols",
        items,
        partial: !supported,
        reasons: supported ? isPython ? [
          "Python outline uses indentation boundaries; it does not prove compiler bindings or runtime call relationships"
        ] : [] : [
          `Outline requires reliable JS/TS/TSX or Python syntax (${syntax?.language ?? "unsupported"}: ${syntax?.status ?? "unsupported"})`
        ],
        filesRead: access.filesRead,
        bytesRead: access.bytesRead,
        stats: {
          filesEnumerated: 1,
          filesParsed: isPython ? 0 : access.syntaxParses,
          filesSkipped: 0,
          cacheHits: isPython ? 0 : access.syntaxCacheHits,
          parseMs: Math.round(performance.now() - navigationStarted),
          budgetExhausted: false
        },
        redact: input.redact ?? false
      }), options.modelOutput);
    }
    if (document.reference.origin.kind !== "worktree")
      return this.#analyses.page(this.#analyses.create({
        kind: input.mode === "imports" ? "imports" : "tests",
        unit: "evidence-items",
        items: [],
        partial: true,
        reasons: [
          "Import and related-test navigation currently support worktree sources only; historical sources are not switched to the worktree"
        ]
      }), options.modelOutput);
    const root = await navigationRoot(access.cwd, document.path, access.signal);
    const filters = navigationFilters(input);
    if (input.mode === "tests" && isPython)
      return this.#analyses.page(this.#analyses.create({
        kind: "tests",
        unit: "evidence-items",
        items: [],
        partial: true,
        reasons: [
          'Python related-test navigation is not supported; use mode="outline" for Python source structure'
        ],
        filesRead: access.filesRead,
        bytesRead: access.bytesRead,
        stats: {
          filesEnumerated: 0,
          filesParsed: 0,
          filesSkipped: 0,
          cacheHits: 0,
          parseMs: Math.round(performance.now() - navigationStarted),
          budgetExhausted: false
        },
        coverage: { navigation: "not-applicable" },
        scope: await navigationScope(access.cwd, root, document.path, filters),
        redact: input.redact ?? false
      }), options.modelOutput);
    const files = await listWorkspaceFiles(access.cwd, access.signal, {
      path: root,
      glob: filters.glob,
      exclude: filters.exclude,
      hidden: filters.hidden
    });
    const { allowed, primaryPath } = await canonicalNavigationFiles(access.cwd, root, files, document.path);
    const host = {
      cwd: access.cwd,
      ...access.signal ? { signal: access.signal } : {},
      normalizePath: (file) => workspaceRelativePath(access.cwd, file),
      load: async (file, expected) => {
        const absolutePath = await canonicalNavigationPath(resolve20(access.cwd, file));
        if (!allowed.has(absolutePath))
          throw new SiftlightError("Navigation source is excluded by current ignore rules");
        if (absolutePath === primaryPath && expected === undefined)
          return document;
        return expected ? access.refresh(file, expected) : access.load(file);
      },
      syntax: (doc) => access.syntax(doc),
      releaseSyntax: (doc) => access.releaseSyntax(doc),
      listFiles: async () => files,
      maxFilesToParse: access.maxFiles
    };
    const request = {
      path: document.path,
      ...line !== undefined ? { line } : {},
      ...input.symbol !== undefined ? { symbol: input.symbol } : {}
    };
    const result = input.mode === "imports" ? await navigateImports(host, request) : await findRelatedTests(host, request, {
      entryPaths: await this.#testEntryPaths(root, files.paths, access.cwd, filters, access.signal)
    });
    return this.#analyses.page(this.#analyses.create({
      ...result,
      partial: result.partial || files.partial,
      reasons: [...result.reasons, ...files.reasons],
      kind: input.mode === "imports" ? "imports" : "tests",
      unit: "evidence-items",
      coverage: {
        navigation: result.partial || files.partial ? "partial" : "complete"
      },
      stats: {
        filesEnumerated: files.paths.length,
        ...result.stats,
        filesParsed: access.syntaxParses,
        cacheHits: access.syntaxCacheHits
      },
      scope: await navigationScope(access.cwd, root, document.path, filters),
      redact: input.redact ?? false
    }), options.modelOutput);
  }
}

// src/service.ts
import { resolve as resolve23 } from "node:path";

// src/discovery-errors.ts
var DISCOVERY_MODE_REQUIRED_ERROR = 'query requires an explicit discovery mode: use mode=files for filename/path discovery or mode=concept for semantic discovery; for example {"mode":"files","query":"<filename-or-path>"}';

// src/format.ts
import { readFile as readFile2 } from "node:fs/promises";
var RESULT_METADATA_RESERVE_BYTES = 1024;
var RESULT_METADATA_RESERVE_CHARACTERS = 512;

class MatchPageSoftLimitError extends Error {
  constructor() {
    super("A single match exceeds the estimated-token detail target");
    this.name = "MatchPageSoftLimitError";
  }
}
function pageBodyCharacterLimit(resultTokenBudget = DEFAULT_RESULT_TOKEN_BUDGET) {
  if (!Number.isSafeInteger(resultTokenBudget) || resultTokenBudget <= 0) {
    throw new Error("Result token budget must be a positive safe integer");
  }
  const limit = resultTokenBudget * ESTIMATED_CHARACTERS_PER_TOKEN - RESULT_METADATA_RESERVE_CHARACTERS;
  if (limit <= 0) {
    throw new Error("Result token budget cannot fit reserved response metadata");
  }
  return limit;
}
function formatMetadataMatchLine(match, matchIndex) {
  const occurrences = match.occurrences.length;
  const occurrenceLabel = occurrences === 1 ? "occurrence" : "occurrences";
  return ` ${match.lineNumber}: ${String(occurrences)} ${occurrenceLabel} {match #${String(matchIndex)}}`;
}
async function formatMatchMetadataPage(snapshot, offset, signal, options = {}) {
  const maxPageBodyBytes = MAX_RESULT_BYTES - Math.max(RESULT_METADATA_RESERVE_BYTES, options.metadataReserveBytes ?? 0);
  if (maxPageBodyBytes <= 0)
    throw new Error("Continuation metadata exceeds the response byte budget; select fewer paths");
  const maxPageBodyCharacters = pageBodyCharacterLimit(options.resultTokenBudget);
  const output = [];
  let returnedMatches = 0;
  let nextOffset = offset;
  let currentFile;
  let outputBytes = 0;
  let outputCharacters = 0;
  let firstMatchIndex;
  let lastMatchIndex;
  let hasMatchRanges = false;
  while (nextOffset < snapshot.matches.length && returnedMatches < snapshot.request.pageSize) {
    if (signal?.aborted)
      throw abortError();
    const matchIndex = nextOffset;
    const match = snapshot.matches[matchIndex];
    if (!match)
      break;
    nextOffset += 1;
    if (options.include && !options.include(match, matchIndex))
      continue;
    const fileHeader = match.displayPath === currentFile ? "" : `${match.displayPath}
`;
    const separator = output.length === 0 ? "" : fileHeader.length === 0 ? `
` : `

`;
    const addition = `${separator}${fileHeader}${formatMetadataMatchLine(match, matchIndex + 1)}`;
    const additionBytes = Buffer.byteLength(addition);
    const additionCharacters = addition.length;
    if (outputBytes + additionBytes > maxPageBodyBytes || outputCharacters + additionCharacters > maxPageBodyCharacters) {
      if (returnedMatches > 0) {
        nextOffset = matchIndex;
        break;
      }
      if (additionBytes > maxPageBodyBytes)
        throw new Error("A single match exceeds the reserved result budget");
      throw new MatchPageSoftLimitError;
    }
    output.push(addition);
    outputBytes += additionBytes;
    outputCharacters += additionCharacters;
    currentFile = match.displayPath;
    returnedMatches += 1;
    hasMatchRanges ||= match.occurrences.length > 0;
    firstMatchIndex ??= matchIndex;
    lastMatchIndex = matchIndex;
  }
  const hasNext = snapshot.matches.slice(nextOffset).some((match, index) => !options.include || options.include(match, nextOffset + index));
  const page = {
    body: output.join(""),
    returnedMatches,
    nextOffset,
    hasNext,
    hasMatchRanges,
    hasByteRanges: false,
    occurrenceRangesOmitted: 0,
    occurrenceMatchesTruncated: 0,
    contextOmittedFiles: [],
    contextChangedFiles: []
  };
  if (firstMatchIndex !== undefined)
    page.firstMatchIndex = firstMatchIndex;
  if (lastMatchIndex !== undefined)
    page.lastMatchIndex = lastMatchIndex;
  return page;
}
function compactLine(line) {
  const clean = line.replaceAll("\r", "").trimEnd();
  return excerptText(clean).text;
}
function matchLocationSuffix(match) {
  if (match.occurrences.length === 0)
    return "";
  const displayed = match.occurrences.slice(0, MAX_DISPLAYED_OCCURRENCES);
  const ranges = displayed.map(({ range }) => {
    const start = range.start.character + 1;
    const end = Math.max(start, range.end.character);
    const suffix = range.encoding === "utf-8" ? "b" : "";
    return `${start}-${end}${suffix}`;
  });
  const omitted = match.occurrences.length - displayed.length;
  const notice = omitted > 0 ? ` [ranges: ${String(displayed.length)} of ${String(match.occurrences.length)} shown; ${String(omitted)} omitted; mode=inspect with this path/line for source]` : "";
  return ` [${ranges.join(",")}]${notice}`;
}
function formatMatchLine(match, matchIndex) {
  return ` ${match.lineNumber}: ${match.lineContent}${matchLocationSuffix(match)} {match #${String(matchIndex)}}${match.lineTruncated ? " [line excerpt truncated]" : ""}`;
}
async function loadContextLines(match, expectedRevision, cache, signal) {
  const cached = cache.get(match.absolutePath);
  if (cached)
    return cached;
  try {
    if (signal?.aborted)
      throw abortError();
    if (!expectedRevision || expectedRevision.size > MAX_SOURCE_FILE_BYTES) {
      const unavailable = { status: "unavailable" };
      cache.set(match.absolutePath, unavailable);
      return unavailable;
    }
    const beforeRevision = await getSourceRevision(match.absolutePath);
    if (!beforeRevision || !sameSourceRevision(expectedRevision, beforeRevision)) {
      const changed = { status: "changed" };
      cache.set(match.absolutePath, changed);
      return changed;
    }
    const content = await readFile2(match.absolutePath, { encoding: "utf8", signal });
    const afterRevision = await getSourceRevision(match.absolutePath);
    if (!afterRevision || !sameSourceRevision(expectedRevision, afterRevision)) {
      const changed = { status: "changed" };
      cache.set(match.absolutePath, changed);
      return changed;
    }
    const available = {
      status: "available",
      lines: content.replaceAll("\r", "").split(`
`)
    };
    cache.set(match.absolutePath, available);
    return available;
  } catch (error) {
    if (signal?.aborted || error instanceof Error && error.name === "AbortError") {
      throw abortError();
    }
    const unavailable = { status: "unavailable" };
    cache.set(match.absolutePath, unavailable);
    return unavailable;
  }
}
function matchContextWindows(snapshot, include) {
  const windows = new Map;
  const context = Math.min(Math.max(0, snapshot.request.context), MAX_CONTEXT_LINES);
  if (context === 0)
    return windows;
  const selectedFiles = new Map;
  for (const [index, match] of snapshot.matches.entries()) {
    if (include && !include(match, index))
      continue;
    const matches = selectedFiles.get(match.absolutePath) ?? [];
    matches.push(match);
    selectedFiles.set(match.absolutePath, matches);
  }
  for (const matches of selectedFiles.values()) {
    const ordered = matches.toSorted((left, right) => left.lineNumber - right.lineNumber);
    for (const [index, match] of ordered.entries()) {
      const previous = ordered[index - 1];
      const next = ordered[index + 1];
      windows.set(match, {
        startLine: Math.max(1, match.lineNumber - context, previous ? Math.floor((previous.lineNumber + match.lineNumber) / 2) + 1 : 1),
        endLine: Math.min(match.lineNumber + context, next ? Math.floor((match.lineNumber + next.lineNumber) / 2) : Number.MAX_SAFE_INTEGER)
      });
    }
  }
  return windows;
}
async function formatBlock(match, matchIndex, expectedRevision, window, cache, allMatchLines, signal) {
  const matchingLine = formatMatchLine(match, matchIndex);
  if (!window)
    return { text: matchingLine, contextStatus: "none" };
  const contextLoad = await loadContextLines(match, expectedRevision, cache, signal);
  if (contextLoad.status !== "available") {
    return { text: matchingLine, contextStatus: contextLoad.status };
  }
  const { lines } = contextLoad;
  const output = [];
  for (let lineNumber = window.startLine;lineNumber <= window.endLine; lineNumber += 1) {
    if (lineNumber === match.lineNumber) {
      output.push(matchingLine);
    } else if (lineNumber <= lines.length && !allMatchLines.get(match.absolutePath)?.has(lineNumber)) {
      output.push(` ${lineNumber}- ${compactLine(lines[lineNumber - 1] ?? "")}`);
    }
  }
  return { text: output.join(`
`), contextStatus: "available" };
}
async function formatMatchPage(snapshot, offset, signal, options = {}) {
  const maxPageBodyBytes = MAX_RESULT_BYTES - Math.max(RESULT_METADATA_RESERVE_BYTES, options.metadataReserveBytes ?? 0);
  if (maxPageBodyBytes <= 0)
    throw new Error("Continuation metadata exceeds the response byte budget; select fewer paths");
  const maxPageBodyCharacters = pageBodyCharacterLimit(options.resultTokenBudget);
  const cache = new Map;
  const omittedFiles = new Set;
  const changedFiles = new Set;
  const output = [];
  let returnedMatches = 0;
  let nextOffset = offset;
  let currentFile;
  let outputBytes = 0;
  let outputCharacters = 0;
  let firstMatchIndex;
  let lastMatchIndex;
  let hasMatchRanges = false;
  let hasByteRanges = false;
  let occurrenceRangesOmitted = 0;
  let occurrenceMatchesTruncated = 0;
  const contextWindows = matchContextWindows(snapshot, options.include);
  const allMatchLines = new Map;
  if (contextWindows.size > 0) {
    for (const match of snapshot.matches) {
      const lines = allMatchLines.get(match.absolutePath) ?? new Set;
      lines.add(match.lineNumber);
      allMatchLines.set(match.absolutePath, lines);
    }
  }
  while (nextOffset < snapshot.matches.length && returnedMatches < snapshot.request.pageSize) {
    if (signal?.aborted)
      throw abortError();
    const matchIndex = nextOffset;
    const match = snapshot.matches[matchIndex];
    if (!match)
      break;
    nextOffset += 1;
    if (options.include && !options.include(match, matchIndex))
      continue;
    let block = await formatBlock(match, matchIndex + 1, snapshot.sourceRevisions.get(match.absolutePath), contextWindows.get(match), cache, allMatchLines, signal);
    const fileHeader = match.displayPath === currentFile ? "" : `${match.displayPath}
`;
    const separator = output.length === 0 ? "" : fileHeader.length === 0 ? `
` : `

`;
    let addition = `${separator}${fileHeader}${block.text}`;
    let additionBytes = Buffer.byteLength(addition);
    let additionCharacters = addition.length;
    const exceedsBudget = () => outputBytes + additionBytes > maxPageBodyBytes || outputCharacters + additionCharacters > maxPageBodyCharacters;
    if (exceedsBudget()) {
      if (returnedMatches > 0) {
        nextOffset = matchIndex;
        break;
      }
      block = { text: formatMatchLine(match, matchIndex + 1), contextStatus: "unavailable" };
      addition = `${fileHeader}${block.text}`;
      additionBytes = Buffer.byteLength(addition);
      additionCharacters = addition.length;
    }
    if (additionBytes > maxPageBodyBytes) {
      throw new Error("A single match exceeds the reserved result budget");
    }
    if (additionCharacters > maxPageBodyCharacters)
      throw new MatchPageSoftLimitError;
    output.push(addition);
    outputBytes += additionBytes;
    outputCharacters += additionCharacters;
    currentFile = match.displayPath;
    returnedMatches += 1;
    hasMatchRanges ||= match.occurrences.length > 0;
    hasByteRanges ||= match.occurrences.slice(0, MAX_DISPLAYED_OCCURRENCES).some(({ range }) => range.encoding === "utf-8");
    const omittedRanges = Math.max(0, match.occurrences.length - MAX_DISPLAYED_OCCURRENCES);
    occurrenceRangesOmitted += omittedRanges;
    if (omittedRanges > 0)
      occurrenceMatchesTruncated += 1;
    if (block.contextStatus === "changed")
      changedFiles.add(match.displayPath);
    if (block.contextStatus === "unavailable")
      omittedFiles.add(match.displayPath);
    firstMatchIndex ??= matchIndex;
    lastMatchIndex = matchIndex;
  }
  const hasNext = snapshot.matches.slice(nextOffset).some((match, index) => !options.include || options.include(match, nextOffset + index));
  const page = {
    body: output.join(""),
    returnedMatches,
    nextOffset,
    hasNext,
    hasMatchRanges,
    hasByteRanges,
    occurrenceRangesOmitted,
    occurrenceMatchesTruncated,
    contextOmittedFiles: [...omittedFiles].toSorted((left, right) => left.localeCompare(right)),
    contextChangedFiles: [...changedFiles].toSorted((left, right) => left.localeCompare(right))
  };
  if (firstMatchIndex !== undefined)
    page.firstMatchIndex = firstMatchIndex;
  if (lastMatchIndex !== undefined)
    page.lastMatchIndex = lastMatchIndex;
  return page;
}

// src/summary.ts
var METADATA_CHARACTERS = 2400;
var METADATA_BYTES = 3584;
function formatSummary(snapshot, fileLimit, offset = 0, resultTokenBudget = DEFAULT_RESULT_TOKEN_BUDGET) {
  if (!Number.isSafeInteger(fileLimit) || fileLimit <= 0)
    throw new Error("Summary file limit must be a positive safe integer");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > snapshot.fileCounts.size)
    throw new Error("Summary offset is outside the file summary");
  const files = [...snapshot.fileCounts.entries()].toSorted(([left, leftCount], [right, rightCount]) => rightCount - leftCount || left.localeCompare(right));
  const maxCharacters = Math.max(256, resultTokenBudget * ESTIMATED_CHARACTERS_PER_TOKEN - METADATA_CHARACTERS);
  const maxBytes = MAX_RESULT_BYTES - METADATA_BYTES;
  const rows = [];
  const shownPaths = [];
  const firstMatches = new Map;
  for (const [index, match] of snapshot.matches.entries())
    if (!firstMatches.has(match.displayPath))
      firstMatches.set(match.displayPath, { match, index });
  let bytes = 0;
  let characters = 0;
  for (const [file, count] of files.slice(offset, offset + Math.min(30, fileLimit))) {
    const row = `${file}  ${String(count).padStart(6)}`;
    if (bytes + Buffer.byteLength(row) + 1 > maxBytes) {
      if (!rows.length)
        throw new Error("A file summary row exceeds the response byte budget; narrow the path");
      break;
    }
    if (rows.length && characters + row.length + 1 > maxCharacters)
      break;
    rows.push(row);
    shownPaths.push(file);
    bytes += Buffer.byteLength(row) + 1;
    characters += row.length + 1;
  }
  const previews = [];
  const sampleIndices = [];
  const sampleBudget = Math.max(0, Math.min(maxBytes - bytes, maxCharacters - characters));
  let sampleBytes = 0;
  for (const path of shownPaths.slice(0, 5)) {
    const retained = firstMatches.get(path);
    if (!retained)
      continue;
    const preview = `${path}:${retained.match.lineNumber} {match #${retained.index + 1}} ${retained.match.lineContent}`;
    if (sampleBytes + Buffer.byteLength(preview) + 1 > sampleBudget)
      continue;
    previews.push(preview);
    sampleIndices.push(retained.index + 1);
    sampleBytes += Buffer.byteLength(preview) + 1;
  }
  const nextOffset = offset + rows.length;
  return {
    body: rows.join(`
`),
    previews: previews.join(`
`),
    previewsShown: previews.length,
    previewsOmitted: shownPaths.length - previews.length,
    shown: rows.length,
    offset,
    nextOffset,
    hasNext: nextOffset < files.length,
    omitted: files.length - nextOffset,
    shownPaths,
    sampleIndices,
    previewByteBudget: sampleBudget
  };
}

// src/summary-previews.ts
function hasBareCarriageReturn2(bytes) {
  for (let index = 0;index < bytes.length; index += 1)
    if (bytes[index] === 13 && bytes[index + 1] !== 10)
      return true;
  return false;
}
async function summarySourcePreviews(snapshot, paths, maxBytes, cwd, signal) {
  const rows = [];
  const indices = [];
  let bytes = 0;
  let filesRead = 0;
  let windows = 0;
  const reasons = [];
  for (const path of paths) {
    if (filesRead >= 5 || maxBytes - bytes < 256)
      break;
    const matches = snapshot.matches.flatMap((match, index) => match.displayPath === path ? [{ match, index }] : []);
    const first = matches[0];
    if (!first)
      continue;
    if (matches.some(({ match }) => match.lineContent.includes("\r"))) {
      reasons.push(`${path}: preview skipped for non-standard line endings`);
      continue;
    }
    if (matches.some(({ match }) => match.lineTruncated || match.occurrences.length > 20)) {
      reasons.push(`${path}: preview skipped for dense or truncated matching lines`);
      continue;
    }
    const revision = snapshot.sourceRevisions.get(first.match.absolutePath);
    if (!revision || revision.size > MAX_SOURCE_FILE_BYTES) {
      reasons.push(`${path}: preview source unverified or over 5 MiB`);
      continue;
    }
    filesRead += 1;
    try {
      const document = await readWorkspaceDocument(path, cwd, signal);
      if (document.reference.origin.kind !== "worktree" || !sameSourceRevision(revision, document.reference.origin.revision) || !document.utf8) {
        reasons.push(`${path}: preview source changed or is not lossless UTF-8`);
        continue;
      }
      if (hasBareCarriageReturn2(document.bytes)) {
        reasons.push(`${path}: preview skipped for non-standard line endings`);
        continue;
      }
      let lastEnd = 0;
      let perFile = 0;
      for (const { match, index } of matches) {
        if (perFile >= 2)
          break;
        const start = Math.max(1, match.lineNumber - 3);
        const end = Math.min(document.lineStarts.length, start + 6);
        if (start <= lastEnd)
          continue;
        const lineRows = [];
        for (let line = start;line <= end; line += 1) {
          const value = document.slice(document.lineRange(line)).replace(/\n$/, "");
          const excerpt = excerptText(value);
          lineRows.push(`${line}: ${excerpt.text}${excerpt.truncated ? " [preview line truncated]" : ""}`);
        }
        const row = `${path}:${match.lineNumber} {match #${index + 1}} [source preview lines ${start}-${end}]
${lineRows.join(`
`)}`;
        if (bytes + Buffer.byteLength(row) + 2 > maxBytes)
          continue;
        rows.push(row);
        indices.push(index + 1);
        bytes += Buffer.byteLength(row) + 2;
        windows += 1;
        perFile += 1;
        lastEnd = end;
      }
    } catch (error) {
      if (signal?.aborted || error instanceof Error && error.name === "AbortError")
        throw abortError();
      if (!(error instanceof Error) || !(("code" in error) || error.name === "SourceDocumentError"))
        throw error;
      reasons.push(`${path}: preview unavailable`);
    }
  }
  return { text: rows.join(`

`), indices, windows, filesRead, reasons };
}

// src/snapshot-store.ts
import { randomUUID as randomUUID4 } from "node:crypto";
class SnapshotStore {
  #snapshots = new Map;
  #expired = new Set;
  #ttlMs;
  #maxSnapshots;
  #maxTotalStoredMatches;
  #maxTotalStoredBytes;
  #maxTotalStoredOccurrences;
  #now;
  constructor(options = {}) {
    this.#ttlMs = options.ttlMs ?? 10 * 60 * 1000;
    this.#maxSnapshots = options.maxSnapshots ?? 20;
    this.#maxTotalStoredMatches = options.maxTotalStoredMatches ?? 1e5;
    this.#maxTotalStoredBytes = options.maxTotalStoredBytes ?? MAX_SEARCH_STORAGE_BYTES;
    this.#maxTotalStoredOccurrences = options.maxTotalStoredOccurrences ?? MAX_STORED_OCCURRENCES;
    this.#now = options.now ?? Date.now;
  }
  create(scan) {
    this.sweep();
    if (this.#scanBytes(scan) > this.#maxTotalStoredBytes || this.#scanOccurrences(scan) > this.#maxTotalStoredOccurrences)
      throw new SiftlightError("Search snapshot exceeds the session storage budget");
    const now = this.#now();
    const snapshot = {
      ...scan,
      id: randomUUID4(),
      createdAt: now,
      lastAccessedAt: now
    };
    this.#snapshots.set(snapshot.id, snapshot);
    this.#evictToBounds();
    return snapshot;
  }
  cursor(snapshot, offset, kind = "matches", selectionKey = "all") {
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new CursorError("Cannot create a cursor with an invalid offset", "E_CURSOR_OFFSET_INVALID");
    }
    if (!/^(?:all|[0-9a-f]{16})$/.test(selectionKey)) {
      throw new CursorError("Cannot create a cursor with an invalid selection key");
    }
    return `${snapshot.id}.${kind}.${offset.toString(36)}.${selectionKey}`;
  }
  resolve(cursor) {
    this.sweep();
    const parts = cursor.match(/^(.+)\.(matches|summary)\.([0-9a-z]+)\.(all|[0-9a-f]{16})$/);
    if (!parts) {
      throw new CursorError("Invalid cursor. Start a new search to obtain a fresh cursor.", "E_CURSOR_MALFORMED");
    }
    const [, id, rawKind, rawOffset, selectionKey] = parts;
    if (!id || !rawKind || !rawOffset || !selectionKey) {
      throw new CursorError("Invalid cursor. Start a new search to obtain a fresh cursor.", "E_CURSOR_MALFORMED");
    }
    const kind = rawKind === "summary" ? "summary" : "matches";
    const offset = Number.parseInt(rawOffset, 36);
    const snapshot = this.#snapshots.get(id);
    if (!snapshot)
      throw new CursorError(this.#expired.has(id) ? "Cursor expired or was evicted. Run the search again." : "Cursor was not found. Run the search again.", this.#expired.has(id) ? "E_CURSOR_EXPIRED" : "E_CURSOR_NOT_FOUND");
    const maximumOffset = kind === "summary" ? snapshot.fileCounts.size : snapshot.matches.length;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > maximumOffset) {
      throw new CursorError("Cursor offset is outside the retained search snapshot.", "E_CURSOR_OFFSET_INVALID");
    }
    snapshot.lastAccessedAt = this.#now();
    return { snapshot, offset, kind, selectionKey };
  }
  delete(snapshot) {
    return this.#snapshots.delete(snapshot.id);
  }
  clear() {
    for (const id of this.#snapshots.keys())
      this.#rememberExpired(id);
    this.#snapshots.clear();
  }
  sweep() {
    const cutoff = this.#now() - this.#ttlMs;
    for (const [id, snapshot] of this.#snapshots) {
      if (snapshot.lastAccessedAt < cutoff) {
        this.#snapshots.delete(id);
        this.#rememberExpired(id);
      }
    }
  }
  get size() {
    this.sweep();
    return this.#snapshots.size;
  }
  get storedMatches() {
    this.sweep();
    return this.#totalStoredMatches();
  }
  #evictToBounds() {
    while (this.#snapshots.size > this.#maxSnapshots || this.#totalStoredMatches() > this.#maxTotalStoredMatches || [...this.#snapshots.values()].reduce((total, scan) => total + this.#scanBytes(scan), 0) > this.#maxTotalStoredBytes || [...this.#snapshots.values()].reduce((total, scan) => total + this.#scanOccurrences(scan), 0) > this.#maxTotalStoredOccurrences) {
      let oldest;
      for (const snapshot of this.#snapshots.values()) {
        if (!oldest || snapshot.lastAccessedAt < oldest.lastAccessedAt)
          oldest = snapshot;
      }
      if (!oldest)
        break;
      this.#snapshots.delete(oldest.id);
      this.#rememberExpired(oldest.id);
    }
  }
  #totalStoredMatches() {
    let total = 0;
    for (const snapshot of this.#snapshots.values())
      total += snapshot.matches.length;
    return total;
  }
  #scanBytes(scan) {
    return scan.retention?.accountedBytes ?? Buffer.byteLength(JSON.stringify({
      matches: scan.matches,
      fileCounts: [...scan.fileCounts],
      sourceRevisions: [...scan.sourceRevisions]
    }));
  }
  #scanOccurrences(scan) {
    return scan.retention?.retainedOccurrences ?? scan.matches.reduce((total, match) => total + match.occurrences.length, 0);
  }
  #rememberExpired(id) {
    this.#expired.add(id);
    while (this.#expired.size > this.#maxSnapshots * 4) {
      const oldest = this.#expired.values().next().value;
      if (oldest === undefined)
        break;
      this.#expired.delete(oldest);
    }
  }
}

// src/operation-lifecycle.ts
import { randomUUID as randomUUID5 } from "node:crypto";
var OPERATION_INITIAL_WAIT_MS = 5000;
var OPERATION_DEFAULT_DEADLINE_MS = 10 * 60000;
var OPERATION_DEFAULT_LEASE_MS = 2 * 60000;
var OPERATION_RESULT_TTL_MS = 10 * 60000;
var MAX_ACTIVE_OPERATIONS = 8;
var MAX_RETAINED_OPERATIONS = 32;
function abortReason(signal) {
  return signal?.reason instanceof Error ? signal.reason : new Error("Operation was cancelled");
}
function snapshot(entry) {
  return {
    id: entry.id,
    state: entry.state,
    startedAt: entry.startedAt,
    deadlineAt: entry.deadlineAt,
    leaseExpiresAt: entry.leaseExpiresAt,
    metadata: entry.metadata,
    ...entry.progress ? { progress: { ...entry.progress } } : {},
    ...entry.result === undefined ? {} : { result: entry.result },
    ...entry.error === undefined ? {} : { error: entry.error }
  };
}

class OperationLifecycle {
  #operations = new Map;
  #pending = new Set;
  #now;
  #maxOperations;
  #deadlineMs;
  #leaseMs;
  #resultTtlMs;
  #maxRetainedOperations;
  #closed = false;
  constructor(options = {}) {
    this.#now = options.now ?? Date.now;
    this.#maxOperations = options.maxOperations ?? MAX_ACTIVE_OPERATIONS;
    this.#deadlineMs = options.deadlineMs ?? OPERATION_DEFAULT_DEADLINE_MS;
    this.#leaseMs = options.leaseMs ?? OPERATION_DEFAULT_LEASE_MS;
    this.#resultTtlMs = options.resultTtlMs ?? OPERATION_RESULT_TTL_MS;
    this.#maxRetainedOperations = options.maxRetainedOperations ?? MAX_RETAINED_OPERATIONS;
    if (!Number.isSafeInteger(this.#maxOperations) || this.#maxOperations < 1)
      throw new Error("maxOperations must be a positive safe integer");
    if (!Number.isSafeInteger(this.#deadlineMs) || this.#deadlineMs < 1)
      throw new Error("deadlineMs must be a positive safe integer");
    if (!Number.isSafeInteger(this.#leaseMs) || this.#leaseMs < 1)
      throw new Error("leaseMs must be a positive safe integer");
    if (!Number.isSafeInteger(this.#resultTtlMs) || this.#resultTtlMs < 1)
      throw new Error("resultTtlMs must be a positive safe integer");
    if (!Number.isSafeInteger(this.#maxRetainedOperations) || this.#maxRetainedOperations < 1)
      throw new Error("maxRetainedOperations must be a positive safe integer");
  }
  get size() {
    this.#expireRetained();
    return this.#operations.size;
  }
  start(run, metadata) {
    this.#expireRetained();
    if (this.#closed)
      throw new Error("Operation lifecycle is closed");
    if (this.#pending.size >= this.#maxOperations)
      throw new Error(`Operation resource limit reached (${String(this.#maxOperations)} pending operations)`);
    const id = randomUUID5();
    const startedAt = this.#now();
    const controller = new AbortController;
    const promise = Promise.resolve().then(() => run(controller.signal, id));
    const entry = {
      id,
      startedAt,
      deadlineAt: startedAt + this.#deadlineMs,
      leaseExpiresAt: startedAt + this.#leaseMs,
      metadata,
      controller,
      promise,
      state: "running",
      settled: false,
      retainedAt: undefined,
      waiters: new Set,
      timer: undefined,
      leaseTimer: undefined
    };
    this.#operations.set(id, entry);
    this.#pending.add(promise);
    promise.finally(() => this.#pending.delete(promise)).catch(() => {
      return;
    });
    entry.timer = setTimeout(() => {
      this.#finishFailure(entry, "Operation deadline exceeded");
      controller.abort(new Error("Operation deadline exceeded"));
    }, this.#deadlineMs);
    entry.timer.unref?.();
    this.#armLease(entry);
    entry.promise.then((result) => {
      entry.settled = true;
      if (entry.timer)
        clearTimeout(entry.timer);
      entry.timer = undefined;
      if (entry.state === "running") {
        entry.state = "complete";
        entry.result = result;
        this.#retainResult(entry);
        this.#notify(entry);
      }
      return;
    }, (error) => {
      entry.settled = true;
      if (entry.timer)
        clearTimeout(entry.timer);
      entry.timer = undefined;
      if (entry.state === "running") {
        entry.state = controller.signal.aborted ? "cancelled" : "failed";
        entry.error = error;
        this.#retainResult(entry);
        this.#notify(entry);
      }
      return;
    });
    return { ...snapshot(entry), promise: entry.promise };
  }
  get(operationId) {
    this.#expireRetained();
    const entry = this.#operations.get(operationId);
    if (!entry)
      throw new Error("Operation was not found or has expired; start the query again");
    return snapshot(entry);
  }
  updateProgress(operationId, progress) {
    const entry = this.#operations.get(operationId);
    if (!entry || entry.state !== "running")
      return;
    entry.progress = { ...progress };
  }
  touch(operationId) {
    const entry = this.#operations.get(operationId);
    if (!entry)
      throw new Error("Operation was not found or has expired; start the query again");
    if (entry.state === "running")
      this.#touch(entry);
    return snapshot(entry);
  }
  async wait(operationId, timeoutMs = OPERATION_INITIAL_WAIT_MS, signal) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0)
      throw new Error("timeoutMs must be a non-negative safe integer");
    const entry = this.#operations.get(operationId);
    if (!entry)
      throw new Error("Operation was not found or has expired; start the query again");
    if (entry.state !== "running")
      return this.#settled(entry);
    this.#touch(entry);
    return new Promise((resolve, reject) => {
      let timer;
      let finished = false;
      let aborting = false;
      const onSettled = () => finish(this.#settled(entry));
      const finish = (result) => {
        if (finished || aborting)
          return;
        finished = true;
        if (timer)
          clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        entry.waiters.delete(onSettled);
        resolve(result);
      };
      const onAbort = () => {
        if (finished || aborting)
          return;
        aborting = true;
        if (timer)
          clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        entry.waiters.delete(onSettled);
        const reason = abortReason(signal);
        this.cancelAndWait(operationId, reason).then(() => {
          if (!finished) {
            finished = true;
            reject(reason);
          }
          return;
        }, (error) => {
          if (!finished) {
            finished = true;
            reject(error);
          }
          return;
        });
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => finish({ state: "running", operation: snapshot(entry) }), timeoutMs);
      timer.unref?.();
      entry.waiters.add(onSettled);
    });
  }
  cancel(operationId, reason = new Error("Operation cancelled")) {
    const entry = this.#operations.get(operationId);
    if (!entry)
      throw new Error("Operation was not found or has expired; start the query again");
    if (entry.state === "running") {
      entry.state = "cancelled";
      entry.error = reason;
      entry.controller.abort(reason);
      this.#retainResult(entry);
      this.#notify(entry);
    }
    return snapshot(entry);
  }
  async cancelAndWait(operationId, reason = new Error("Operation cancelled")) {
    const entry = this.#operations.get(operationId);
    if (!entry)
      throw new Error("Operation was not found or has expired; start the query again");
    this.cancel(operationId, reason);
    await Promise.allSettled([entry.promise]);
    return snapshot(entry);
  }
  clear(reason = new Error("Operation session closed")) {
    this.#closed = true;
    for (const entry of this.#operations.values()) {
      if (entry.state === "running")
        this.cancel(entry.id, reason);
      this.#clearTimers(entry);
    }
    this.#operations.clear();
  }
  reset(reason = new Error("Operation session reset")) {
    this.clear(reason);
    this.#closed = false;
  }
  async shutdown(reason = new Error("Operation session closed")) {
    this.clear(reason);
    await Promise.allSettled(this.#pending);
  }
  #settled(entry) {
    const current = snapshot(entry);
    if (entry.state === "complete" && entry.result !== undefined)
      return { state: "complete", operation: current, result: entry.result };
    if (entry.state === "failed")
      return { state: "failed", operation: current, error: entry.error };
    if (entry.state === "cancelled" || entry.state === "expired")
      return { state: entry.state, operation: current, error: entry.error };
    return { state: "running", operation: current };
  }
  #finishFailure(entry, message) {
    if (entry.state !== "running")
      return;
    entry.state = "failed";
    entry.error = new Error(message);
    this.#retainResult(entry);
    this.#notify(entry);
  }
  #retainResult(entry) {
    if (entry.settled && entry.timer)
      clearTimeout(entry.timer);
    if (entry.settled)
      entry.timer = undefined;
    if (entry.leaseTimer)
      clearTimeout(entry.leaseTimer);
    entry.leaseTimer = undefined;
    entry.retainedAt = this.#now();
    entry.leaseExpiresAt = this.#now() + this.#resultTtlMs;
    entry.leaseTimer = setTimeout(() => this.#evict(entry), this.#resultTtlMs);
    entry.leaseTimer.unref?.();
    this.#evictRetainedOverflow();
  }
  #notify(entry) {
    const waiters = [...entry.waiters];
    entry.waiters.clear();
    for (const waiter of waiters)
      waiter();
  }
  #touch(entry) {
    entry.leaseExpiresAt = this.#now() + this.#leaseMs;
    this.#armLease(entry);
  }
  #armLease(entry) {
    if (entry.leaseTimer)
      clearTimeout(entry.leaseTimer);
    entry.leaseTimer = setTimeout(() => {
      if (entry.state === "running") {
        entry.state = "expired";
        entry.error = new Error("Operation lease expired without a continuation");
        entry.controller.abort(entry.error);
      }
      this.#evict(entry);
    }, Math.max(1, entry.leaseExpiresAt - this.#now()));
    entry.leaseTimer.unref?.();
  }
  #evict(entry) {
    if (this.#operations.get(entry.id) !== entry)
      return;
    if (entry.state === "running") {
      entry.state = "expired";
      entry.error = new Error("Operation lease expired without a continuation");
      entry.controller.abort(entry.error);
    }
    this.#notify(entry);
    this.#clearTimers(entry);
    this.#operations.delete(entry.id);
  }
  #evictRetainedOverflow() {
    const retained = [...this.#operations.values()].filter((entry) => entry.state !== "running" && entry.retainedAt !== undefined).toSorted((left, right) => (left.retainedAt ?? left.startedAt) - (right.retainedAt ?? right.startedAt));
    while (retained.length > this.#maxRetainedOperations) {
      const candidate = retained.shift();
      if (!candidate || candidate.waiters.size > 0)
        continue;
      this.#evict(candidate);
    }
  }
  #clearTimers(entry, includeLease = true) {
    if (entry.timer)
      clearTimeout(entry.timer);
    if (includeLease && entry.leaseTimer)
      clearTimeout(entry.leaseTimer);
    entry.timer = undefined;
    if (includeLease)
      entry.leaseTimer = undefined;
  }
  #expireRetained() {
    const now = this.#now();
    for (const entry of this.#operations.values()) {
      if (entry.leaseExpiresAt <= now)
        this.#evict(entry);
    }
  }
}

// src/operation-output.ts
function operationRequest(operationId) {
  return { mode: "await", operationId };
}
function operationDetails(operation, nextRequest) {
  return {
    id: operation.id,
    mode: operation.metadata.mode,
    state: operation.state,
    startedAt: operation.startedAt,
    deadlineAt: operation.deadlineAt,
    leaseExpiresAt: operation.leaseExpiresAt,
    ...operation.progress ? { progress: operation.progress } : {},
    ...nextRequest ? { nextRequest } : {},
    ...operation.error instanceof Error ? { error: operation.error.message } : {}
  };
}
function waitingResult(operation, mode) {
  const nextRequest = operationRequest(operation.id);
  const progress = operation.progress ? ` Progress: ${JSON.stringify(operation.progress)}.` : "";
  const details = {
    version: 1,
    mode,
    status: "waiting",
    totalMatches: 0,
    storedMatches: 0,
    totalFiles: 0,
    returnedMatches: 0,
    snapshotComplete: false,
    nextRequest,
    ...operation.metadata.redact ? { redactionRequested: true } : {},
    operation: operationDetails(operation, nextRequest)
  };
  return {
    text: `Operation ${operation.id} is still running; no evidence page is available yet.${progress}

Next request: ${JSON.stringify(nextRequest)}. Copy it exactly to continue waiting; the original query will not be started again.`,
    details
  };
}
function operationStateResult(operation, mode) {
  if (operation.state === "complete" && operation.result !== undefined)
    return completeOperationResult(operation.result, operation);
  const details = {
    version: 1,
    mode,
    status: operation.state,
    totalMatches: 0,
    storedMatches: 0,
    totalFiles: 0,
    returnedMatches: 0,
    snapshotComplete: false,
    ...operation.metadata.redact ? { redactionRequested: true } : {},
    operation: operationDetails(operation)
  };
  const message = operation.error instanceof Error ? ` ${operation.error.message}.` : "";
  return {
    text: `Operation ${operation.id} ${operation.state}.${message}`,
    details
  };
}
function completeOperationResult(result, operation) {
  const stable = structuredClone(result);
  return {
    ...stable,
    text: `${stable.text}

Operation ${operation.id} complete; final result is retained for stable await re-fetch.`,
    details: {
      ...stable.details,
      ...operation.metadata.redact ? { redactionRequested: true } : {},
      operation: operationDetails(operation)
    }
  };
}
function operationOutcome(outcome, mode) {
  if (outcome.state === "running")
    return waitingResult(outcome.operation, mode);
  if (outcome.state === "complete")
    return completeOperationResult(outcome.result, outcome.operation);
  throw outcome.error;
}

// src/audit-search.ts
import { resolve as resolve21 } from "node:path";
var MAX_AUDIT_PATTERNS = 32;
var MAX_AUDIT_CHANGED_FILES = 20;
var MAX_AUDIT_EVIDENCE = 3;
var MAX_AUDIT_IGNORED_FILES = 20;
var MAX_AUDIT_REASONS = 20;
var MAX_AUDIT_REASON_PATH_SAMPLES = 3;
var MAX_AUDIT_SAMPLE_BYTES = 2048;
function validatePatterns(patterns) {
  if (!patterns?.length || patterns.length > MAX_AUDIT_PATTERNS)
    throw new SiftlightError(`mode=audit requires 1–${String(MAX_AUDIT_PATTERNS)} literal patterns`);
  const ids = new Set;
  return patterns.map((pattern) => {
    if (!pattern || typeof pattern !== "object" || Array.isArray(pattern) || Object.keys(pattern).some((key) => key !== "id" && key !== "literal"))
      throw new SiftlightError("Each audit pattern accepts only id and literal fields");
    if (!pattern || typeof pattern.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(pattern.id))
      throw new SiftlightError("Each audit pattern id must use 1–64 letters, digits, underscores or hyphens");
    if (ids.has(pattern.id))
      throw new SiftlightError("Audit pattern ids must be unique");
    ids.add(pattern.id);
    if (typeof pattern.literal !== "string" || !pattern.literal.length || pattern.literal.length > MAX_AUDIT_LITERAL_CHARACTERS || Buffer.byteLength(pattern.literal) > MAX_AUDIT_LITERAL_CHARACTERS || !pattern.literal.isWellFormed() || /[\r\n\0]/u.test(pattern.literal))
      throw new SiftlightError(`Each audit literal must be nonempty, single-line text of at most ${String(MAX_AUDIT_LITERAL_CHARACTERS)} characters and UTF-8 bytes`);
    return { id: pattern.id, literal: pattern.literal };
  });
}
async function revisionsFor(cwd, paths, signal) {
  const revisions = new Map;
  const unavailable = [];
  for (let offset = 0;offset < paths.length; offset += MAX_SOURCE_REVISION_CONCURRENCY) {
    if (signal?.aborted)
      throw signal.reason;
    const batch = paths.slice(offset, offset + MAX_SOURCE_REVISION_CONCURRENCY);
    await Promise.all(batch.map(async (path) => {
      const revision = await getSourceRevision(resolve21(cwd, path), () => unavailable.push(path));
      if (revision)
        revisions.set(path, revision);
    }));
  }
  return { revisions, unavailable };
}
function changedFiles(beforePaths, afterPaths, before, after) {
  const all = new Set([...beforePaths, ...afterPaths]);
  return [...all].filter((path) => {
    const left = before.get(path);
    const right = after.get(path);
    return left === undefined || right === undefined || !sameSourceRevision(left, right);
  }).toSorted();
}
function auditScope(input) {
  const path = input.path?.replace(/^@/u, "") || ".";
  return {
    path,
    requestedPath: path,
    glob: input.glob === undefined ? [] : Array.isArray(input.glob) ? input.glob : [input.glob],
    exclude: input.exclude === undefined ? [] : Array.isArray(input.exclude) ? input.exclude : [input.exclude],
    hidden: input.hidden ?? true,
    ignorePolicy: input.ignorePolicy ?? "respect",
    expandedToProjectRoot: false,
    assertion: path === "." ? "project-wide" : "requested-scope"
  };
}
function findingText(finding) {
  const firstEvidence = finding.evidence[0];
  const evidence = firstEvidence ? `; evidence=${JSON.stringify(`${firstEvidence.path}:${String(firstEvidence.line)}`)}${finding.evidence.length > 1 ? `; ${String(finding.evidence.length - 1)} more evidence item(s) in structured receipt` : ""}` : "";
  return `- ${finding.id}: ${finding.status}; ${String(finding.matches)} match(es) across ${String(finding.files)} file(s)${evidence}; reproduce=${JSON.stringify(finding.reproduction)}`;
}
function boundedValues(values, maxItems, maxBytes) {
  const retained = [];
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
function boundedAuditText(required, optional) {
  const requiredText = required.join(`
`);
  const omittedMarkerReserve = 128;
  if (Buffer.byteLength(requiredText) > MAX_RESULT_BYTES - omittedMarkerReserve)
    throw new SiftlightError(`Audit reproduction evidence exceeds the ${String(MAX_RESULT_BYTES)} byte result limit; narrow the scope or use fewer patterns`);
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
  const text = retained.join(`
`);
  if (Buffer.byteLength(text) > MAX_RESULT_BYTES)
    throw new SiftlightError("Audit result exceeded its byte budget");
  return text;
}
function unavailableReason(stage, paths) {
  if (paths.length === 0)
    return [];
  const omitted = Math.max(0, paths.length - MAX_AUDIT_REASON_PATH_SAMPLES);
  return [
    `${stage} metadata unavailable for ${String(paths.length)} file(s)`,
    ...paths.slice(0, MAX_AUDIT_REASON_PATH_SAMPLES).map((path) => `${stage} metadata-unavailable sample: ${JSON.stringify(path)}`),
    ...omitted ? [`${stage} metadata-unavailable samples omitted: ${String(omitted)}`] : []
  ];
}
async function runAuditSearch(input, cwd, runRipgrep, signal) {
  const patterns = validatePatterns(input.patterns);
  const scope = auditScope(input);
  const ignorePolicy = scope.ignorePolicy ?? "respect";
  const fileOptions = {
    path: scope.path,
    glob: scope.glob,
    exclude: scope.exclude,
    hidden: scope.hidden,
    ...ignorePolicy === "include" ? { ignore: false, ignoreParents: false } : {}
  };
  const [startFiles, startAllFiles] = await Promise.all([
    listWorkspaceFiles(cwd, signal, fileOptions),
    ignorePolicy === "respect" ? listWorkspaceFiles(cwd, signal, { ...fileOptions, ignore: false, ignoreParents: false }) : Promise.resolve(undefined)
  ]);
  const before = await revisionsFor(cwd, (startAllFiles ?? startFiles).paths, signal);
  const scans = [];
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
        scope: "strict"
      }),
      binaryAsText: true
    };
    scans.push(await runRipgrep(request, cwd, signal));
  }
  const [endFiles, endAllFiles] = await Promise.all([
    listWorkspaceFiles(cwd, signal, fileOptions),
    ignorePolicy === "respect" ? listWorkspaceFiles(cwd, signal, { ...fileOptions, ignore: false, ignoreParents: false }) : Promise.resolve(undefined)
  ]);
  const after = await revisionsFor(cwd, (endAllFiles ?? endFiles).paths, signal);
  const changed = changedFiles((startAllFiles ?? startFiles).paths, (endAllFiles ?? endFiles).paths, before.revisions, after.revisions);
  const startAdmitted = new Set(startFiles.paths);
  const startIgnoredPaths = startAllFiles?.paths.filter((path) => !startAdmitted.has(path)) ?? [];
  const filesDiscovered = (startAllFiles ?? startFiles).paths.length;
  const filesAdmitted = startFiles.paths.length;
  const searchedFiles = Math.min(...scans.map((scan) => scan.searchedFileCount ?? 0));
  const filesSkippedOther = Math.max(0, filesAdmitted - searchedFiles);
  const allReasons = new Set([
    ...startFiles.reasons,
    ...endFiles.reasons,
    ...startAllFiles?.reasons ?? [],
    ...endAllFiles?.reasons ?? [],
    ...unavailableReason("Initial", before.unavailable),
    ...unavailableReason("Final", after.unavailable),
    ...scans.flatMap((scan) => scan.retention?.reasons ?? [])
  ]);
  if (startIgnoredPaths.length > 0)
    allReasons.add(`${String(startIgnoredPaths.length)} file(s) excluded by ignore rules`);
  if (filesSkippedOther > 0)
    allReasons.add(`${String(filesSkippedOther)} admitted file(s) were not searched for content`);
  if (changed.length > 0)
    allReasons.add("The declared source set changed during the audit");
  const reasonList = [...allReasons];
  const boundedReasons = boundedValues(reasonList, MAX_AUDIT_REASONS, MAX_AUDIT_SAMPLE_BYTES);
  const reasons = boundedReasons.values;
  const reasonsOmitted = boundedReasons.omitted;
  const filesystemComplete = !startFiles.partial && !endFiles.partial && !(startAllFiles?.partial ?? false) && !(endAllFiles?.partial ?? false) && startIgnoredPaths.length === 0 && before.unavailable.length === 0 && after.unavailable.length === 0;
  const searchComplete = scans.every((scan) => scan.snapshotComplete && (scan.filesystemCoverage ?? "complete") === "complete");
  const stable = changed.length === 0;
  const closureComplete = filesystemComplete && searchComplete && stable && filesSkippedOther === 0;
  const findings = patterns.map((pattern, index) => {
    const scan = scans[index];
    if (!scan)
      throw new Error("Audit scan result missing");
    const status = scan.totalMatches > 0 ? "present" : closureComplete ? "absent_with_complete_coverage" : "unknown";
    return {
      id: pattern.id,
      status,
      matches: scan.totalMatches,
      files: scan.fileCounts.size,
      evidence: scan.matches.slice(0, MAX_AUDIT_EVIDENCE).map((match) => ({
        path: match.displayPath,
        line: match.lineNumber
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
        scope: "strict"
      }
    };
  });
  const stabilityStatus = before.unavailable.length || after.unavailable.length ? "unknown" : changed.length ? "changed_during_search" : "stable";
  const boundedIgnored = boundedValues(startIgnoredPaths, MAX_AUDIT_IGNORED_FILES, MAX_AUDIT_SAMPLE_BYTES);
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
      reasonsOmitted
    },
    stability: {
      status: stabilityStatus,
      changedFiles: boundedChanged.values,
      changedFilesOmitted: boundedChanged.omitted
    },
    findings
  };
  const text = boundedAuditText([
    `Audit receipt (${closureComplete ? "complete" : "PARTIAL"}).`,
    `Scope: ${JSON.stringify(scope)}.`,
    `Coverage: ${String(filesDiscovered)} discovered, ${String(filesAdmitted)} admitted, ${String(searchedFiles)} searched, ${String(startIgnoredPaths.length)} ignored, ${String(filesSkippedOther)} otherwise skipped.`,
    `Stability: ${stabilityStatus}${changed.length ? `; ${String(changed.length)} changed file(s)` : ""}.`,
    "Findings:",
    ...findings.map(findingText)
  ], [
    ...ignoredFileSamples.length ? [
      `Ignored file samples: ${ignoredFileSamples.map((path) => JSON.stringify(path)).join(", ")}${ignoredFilesOmitted ? `; ${String(ignoredFilesOmitted)} more omitted` : ""}.`
    ] : [],
    ...boundedChanged.values.length ? [
      `Changed file samples: ${boundedChanged.values.map((path) => JSON.stringify(path)).join(", ")}${boundedChanged.omitted ? `; ${String(boundedChanged.omitted)} more omitted` : ""}.`
    ] : [],
    ...reasons.length || reasonsOmitted ? [
      reasons.length ? `Reasons: ${reasons.map((reason) => JSON.stringify(reason)).join("; ")}${reasonsOmitted ? `; ${String(reasonsOmitted)} more omitted` : ""}.` : `Reasons omitted by receipt budget: ${String(reasonsOmitted)}.`
    ] : []
  ]);
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
      audit: receipt
    }
  };
}

// src/language-capabilities.ts
import { resolve as resolve22 } from "node:path";
function normalizeLists(values) {
  return values === undefined ? [] : [...values];
}
function languageAvailability(capabilities) {
  if (capabilities.length === 0)
    return "unavailable";
  if (capabilities.some((capability) => capability.availability === "conditional"))
    return "conditional";
  return "implemented";
}

class LanguageCapabilityCatalog {
  #descriptors;
  #neutral;
  constructor(descriptors = DEFAULT_LANGUAGE_CAPABILITIES, neutral = DEFAULT_NEUTRAL_CAPABILITIES) {
    this.#descriptors = [...descriptors];
    this.#neutral = [...neutral];
  }
  descriptor(language) {
    return this.#descriptors.find((item) => item.language === language);
  }
  descriptorForPath(path) {
    return descriptorForPath(this.#descriptors, path);
  }
  async inspect(request) {
    const path = request.path?.replace(/^@/, "");
    const files = await listWorkspaceFiles(request.cwd, request.signal, {
      ...path ? { path } : {},
      glob: normalizeLists(request.glob),
      exclude: normalizeLists(request.exclude),
      hidden: request.hidden ?? true
    });
    const counts = new Map;
    for (const file of files.paths) {
      const descriptor = this.descriptorForPath(file);
      if (descriptor)
        counts.set(descriptor.language, (counts.get(descriptor.language) ?? 0) + 1);
    }
    const entries = [...counts.entries()].flatMap(([language, count]) => {
      const descriptor = this.descriptor(language);
      if (!descriptor)
        return [];
      return [this.#entry(descriptor, count, "inventory")];
    });
    const target = path ? this.descriptorForPath(path) : undefined;
    if (target && !counts.has(target.language))
      entries.push(this.#entry(target, 0, "target-extension"));
    entries.sort((left, right) => left.language.localeCompare(right.language));
    const capabilityDefinitions = [
      ...new Map(entries.flatMap((entry) => this.descriptor(entry.language)?.capabilities ?? []).map((capability) => [capability.id, capability])).values()
    ];
    return {
      root: resolve22(request.cwd),
      ...path ? { path } : {},
      partial: files.partial,
      reasons: files.reasons,
      languages: entries,
      capabilityDefinitions,
      neutral: this.#neutral
    };
  }
  #entry(descriptor, files, evidence) {
    return {
      language: descriptor.language,
      files,
      extensions: descriptor.extensions,
      capabilities: descriptor.capabilities.map(({ id, name }) => ({ id, name })),
      availability: languageAvailability(descriptor.capabilities),
      readiness: "not-probed",
      evidence
    };
  }
}

// src/service.ts
function filterList(value) {
  return value === undefined ? [] : Array.isArray(value) ? [...value] : [value];
}
function capabilitiesResult(inventory) {
  const languageText = inventory.languages.length ? inventory.languages.map((entry) => {
    const providers = [
      ...new Set(inventory.capabilityDefinitions.filter((capability) => entry.capabilities.some((reference) => reference.id === capability.id)).map((capability) => capability.provider))
    ].join(" + ");
    const load = entry.capabilities.length ? "lazy" : "none";
    const names = entry.capabilities.map((reference) => reference.name).join(", ");
    return `${entry.language} (${String(entry.files)} file${entry.files === 1 ? "" : "s"}): ${names || "no language analysis capability is currently registered"}; providers=${providers || "none"}; availability=${entry.availability}; readiness=${entry.readiness}; load=${load}`;
  }).join(`
`) : "No recognized language source files were found in the requested scope.";
  const partial = inventory.partial ? "partial" : "complete";
  const reason = inventory.reasons.length ? `
Reasons: ${inventory.reasons.join("; ")}` : "";
  const text = `Project language capability inventory (${partial}; names-only; providers load lazily).
Language-specific modes:
${languageText}
Language-neutral modes: ${inventory.neutral.map((capability) => `${capability.name} [${capability.availability}; ${capability.load}]`).join(", ")}.${reason}`;
  return {
    text,
    details: {
      version: 1,
      mode: "capabilities",
      status: inventory.partial ? "partial" : "complete",
      totalMatches: 0,
      storedMatches: 0,
      totalFiles: inventory.languages.reduce((sum, entry) => sum + entry.files, 0),
      returnedMatches: 0,
      snapshotComplete: !inventory.partial,
      capabilities: inventory
    }
  };
}
function cursorPathSelection(input, cwd) {
  if (input.path !== undefined && input.paths !== undefined) {
    throw new SiftlightError("Use either path or paths with a cursor, not both");
  }
  const rawPaths = input.paths ?? (input.path === undefined ? [] : [input.path]);
  if (input.paths !== undefined && rawPaths.length === 0) {
    throw new SiftlightError("paths must contain at least one retained file");
  }
  if (rawPaths.length === 0)
    return;
  if (rawPaths.length > MAX_SELECTED_PATHS) {
    throw new SiftlightError(`paths cannot contain more than ${String(MAX_SELECTED_PATHS)} entries`);
  }
  const labels = [];
  const absolutePaths = new Set;
  const policy = new SearchPathPolicy(cwd);
  for (const rawPath of rawPaths) {
    const label = rawPath.replace(/^@/, "");
    validateSearchPath(label, input.paths !== undefined ? "paths" : "path");
    if (label.length === 0)
      throw new SiftlightError("Cursor paths cannot be empty");
    const absolutePath = resolve23(cwd, label);
    policy.assertPath(absolutePath);
    if (absolutePaths.has(absolutePath))
      continue;
    absolutePaths.add(absolutePath);
    labels.push(label);
  }
  const key = createHash4("sha256").update([...absolutePaths].toSorted((left, right) => left.localeCompare(right)).join("\x00")).digest("hex").slice(0, 16);
  return { labels, absolutePaths, key };
}
function baseDetails2(snapshot, mode) {
  const sourceUnverifiedFileCount = new Set(snapshot.matches.filter((match) => !snapshot.sourceRevisions.has(match.absolutePath)).map((match) => match.absolutePath)).size;
  return {
    version: 1,
    mode,
    status: snapshot.snapshotComplete && (snapshot.filesystemCoverage ?? "complete") === "complete" ? "complete" : "partial",
    totalMatches: snapshot.totalMatches,
    storedMatches: snapshot.matches.length,
    totalFiles: snapshot.fileCounts.size,
    returnedMatches: 0,
    snapshotComplete: snapshot.snapshotComplete,
    searchCoverage: {
      retainedMatches: snapshot.snapshotComplete ? "complete" : "partial",
      filesystem: snapshot.filesystemCoverage ?? "complete",
      ignoredFiles: snapshot.ignoredFileCount ?? 0,
      ignoredFileSamples: [...snapshot.ignoredFileSamples ?? []],
      searchedFiles: snapshot.searchedFileCount ?? 0,
      reasons: [...snapshot.filesystemCoverageReasons ?? []]
    },
    ...snapshot.retention ? { retention: snapshot.retention } : {},
    scope: searchScope2(snapshot.request),
    ...snapshot.request.redact ? { redactionRequested: true } : {},
    ...snapshot.truncatedLines > 0 ? { lineContentTruncated: snapshot.truncatedLines } : {},
    ...sourceUnverifiedFileCount > 0 ? { sourceUnverifiedFileCount } : {}
  };
}
function searchScope2(request) {
  const path = request.path ?? ".";
  const requestedPath = request.expandedFromPath ?? path;
  return {
    path,
    requestedPath,
    glob: [...request.glob],
    exclude: [...request.exclude],
    hidden: request.hidden,
    ignorePolicy: request.ignorePolicy ?? "respect",
    expandedToProjectRoot: request.expandedFromPath !== undefined,
    assertion: path === "." ? "project-wide" : "requested-scope",
    ...request.modifiedAfterMs !== undefined ? { modifiedAfterMs: request.modifiedAfterMs } : {},
    ...request.modifiedBeforeMs !== undefined ? { modifiedBeforeMs: request.modifiedBeforeMs } : {}
  };
}
function emptyResultText(details) {
  const scope = details.scope ?? {
    path: ".",
    requestedPath: ".",
    glob: [],
    exclude: [],
    hidden: true,
    ignorePolicy: "respect",
    expandedToProjectRoot: false,
    assertion: "project-wide"
  };
  const filters = scope.glob.length || scope.exclude.length || !scope.hidden || scope.modifiedAfterMs !== undefined || scope.modifiedBeforeMs !== undefined ? " Include/exclude and hidden-file filters were applied." : "";
  const expansion = scope.expandedToProjectRoot ? ` after the requested path ${JSON.stringify(scope.requestedPath)} also returned no matches` : "";
  const range = scope.assertion === "project-wide" ? "project root" : "requested path";
  const coverage = details.searchCoverage;
  const conclusion = coverage?.filesystem === "complete" ? `No matches found anywhere in ${range}` : `No matches found among files admitted in ${range}; absence is unknown outside this coverage`;
  const ignored = coverage?.ignoredFiles ? ` ${String(coverage.ignoredFiles)} file(s) were excluded by ignore rules.` : "";
  const reasons = coverage?.reasons.length ? ` Filesystem coverage reasons: ${coverage.reasons.map((reason) => JSON.stringify(reason)).join("; ")}.` : "";
  return `${conclusion} ${JSON.stringify(scope.path)}${expansion}.${filters}${ignored}${reasons}${modificationTimeBoundsText(scope.modifiedAfterMs, scope.modifiedBeforeMs)}`;
}
function scopeExpansionNote(scope, totalMatches) {
  if (!scope?.expandedToProjectRoot)
    return "";
  const outcome = totalMatches > 0 ? "returned project-wide matches" : "the project root was also searched and had no matches";
  return `

[Scope expanded: requested path ${JSON.stringify(scope.requestedPath)} had no matches; ${outcome} from ${JSON.stringify(scope.path)}.]`;
}
function completenessNote(snapshot) {
  if (snapshot.snapshotComplete && (snapshot.filesystemCoverage ?? "complete") === "complete")
    return "complete retained-match and filesystem snapshot";
  if (snapshot.snapshotComplete && snapshot.filesystemCoverage === "policy-filtered")
    return `complete retained-match snapshot; filesystem coverage is policy-filtered because ${String(snapshot.ignoredFileCount ?? 0)} file(s) were excluded by ignore rules`;
  const reasons = [
    ...snapshot.retention?.reasons ?? [],
    ...snapshot.filesystemCoverageReasons ?? []
  ].join("; ");
  if (snapshot.snapshotComplete)
    return `complete retained-match snapshot; PARTIAL filesystem coverage${reasons ? `: ${reasons}` : ""}`;
  return `PARTIAL snapshot: retained ${snapshot.matches.length} of ${snapshot.totalMatches} matches; ${reasons ? `${reasons}; ` : ""}narrow the search to retrieve all matches`;
}
function lineExcerptNote(snapshot) {
  return snapshot.truncatedLines > 0 ? `

[Line excerpts truncated: ${String(snapshot.truncatedLines)} matching lines in this snapshot; maximum ${String(MAX_LINE_CHARACTERS)} source characters per line. Complete snapshot describes retained matches, not complete source text.]` : "";
}
function sourceVerificationNote(details) {
  return details.sourceUnverifiedFileCount ? `

[Source revision unverified for ${String(details.sourceUnverifiedFileCount)} retained file(s); context and snapshot-scoped inspection require verified source.]` : "";
}
function selectContextBudget(input, mode, candidate) {
  if (mode !== "auto" || input.limit !== undefined || input.cursor)
    return;
  return candidate;
}
function matchPageOptions(budget) {
  if (!budget)
    return {};
  return { resultTokenBudget: budget.resultTokenBudget };
}
function pageMatchesOccurrences(snapshot, first, last) {
  return snapshot.matches.slice(first, last + 1).reduce((total, match) => total + match.occurrences.length, 0);
}
function attachContextBudget(result, budget, totalMatches) {
  if (!budget || totalMatches === 0)
    return result;
  let text = result.text;
  if (budget.tier !== "full") {
    text = `${result.text}

[Budget: ${budget.tier}; context remainder ${budget.contextRemainderPercent}%; auto detail target ${budget.resultTokenBudget} estimated tokens.]`;
  }
  return {
    ...result,
    text,
    details: {
      ...result.details,
      budgetTier: budget.tier,
      contextRemainderPercent: budget.contextRemainderPercent,
      resultTokenBudget: budget.resultTokenBudget
    }
  };
}
async function waitForSourceRefresh(signal, delayMs) {
  if (signal.aborted)
    throw signal.reason instanceof Error ? signal.reason : new Error("Operation aborted");
  await new Promise((resolveDelay, rejectDelay) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolveDelay();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      rejectDelay(signal.reason instanceof Error ? signal.reason : new Error("Operation aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

class SiftlightService {
  #runRipgrep;
  #snapshots;
  #summaryFileLimit;
  #capabilities = new LanguageCapabilityCatalog;
  #evidence;
  #lifecycle = new AbortController;
  #active = new Set;
  #operations;
  #reusableSummarySnapshots = new WeakSet;
  constructor(options) {
    this.#runRipgrep = options.runRipgrep;
    this.#snapshots = options.snapshots ?? new SnapshotStore;
    this.#summaryFileLimit = options.summaryFileLimit ?? DEFAULT_SUMMARY_FILE_LIMIT;
    this.#operations = new OperationLifecycle({ deadlineMs: resolveConceptTimeoutMs() });
    this.#evidence = new EvidenceService(this.#runRipgrep, this.#snapshots, options.structure, options.conceptSearch, options.semanticJudge);
  }
  async search(input, cwd, signal, options = {}) {
    validateRawSearchInput(input);
    validateRequestContract(input);
    let request;
    if (input.mode === "await" || input.mode === "cancel") {
      request = this.#operationCommand(input, cwd, signal);
    } else {
      if (input.operationId !== undefined)
        throw new SiftlightError("operationId is only valid with mode=await or mode=cancel");
      for (const path of input.paths ?? [])
        validateSearchPath(path, "paths");
      for (const target of input.targets ?? []) {
        if (target && typeof target.path === "string")
          validateSearchPath(target.path, "targets.path");
      }
      const combined = signal ? AbortSignal.any([signal, this.#lifecycle.signal]) : this.#lifecycle.signal;
      request = this.#isLongRunningQuery(input) ? this.#searchOperation(input, cwd, signal, options) : this.#search(input, cwd, combined, options);
    }
    this.#active.add(request);
    try {
      const result = await request;
      return input.redact || result.details.redactionRequested ? redactSiftlightResult(result) : result;
    } finally {
      this.#active.delete(request);
    }
  }
  #isLongRunningQuery(input) {
    return (input.mode === "concept" || input.mode === "hybrid") && input.operationId === undefined && input.cursor === undefined;
  }
  async#searchOperation(input, cwd, signal, options) {
    const started = this.#operations.start(async (operationSignal, operationId) => {
      const combined = AbortSignal.any([operationSignal, this.#lifecycle.signal]);
      const deadlineAt = this.#operations.get(operationId).deadlineAt;
      this.#operations.updateProgress(operationId, { phase: "queued" });
      let refreshAttempt = 0;
      let workerRestarted = false;
      while (true) {
        try {
          this.#operations.updateProgress(operationId, { phase: "running" });
          return await this.#search(input, cwd, combined, {
            ...options,
            onProgress: (progress) => this.#operations.updateProgress(operationId, progress)
          });
        } catch (error) {
          if (error instanceof ConceptWorkerExitError) {
            if (workerRestarted || combined.aborted)
              throw error;
            const remaining = deadlineAt - Date.now();
            if (remaining <= 0)
              throw error;
            workerRestarted = true;
            this.#operations.updateProgress(operationId, {
              phase: "refreshing",
              detail: "worker restart 1 after unexpected worker termination; completed cache entries are reusable"
            });
            await waitForSourceRefresh(combined, Math.min(100, remaining));
            continue;
          }
          if (!(error instanceof ConceptSourceChangedError))
            throw error;
          if (combined.aborted)
            throw error;
          const remaining = deadlineAt - Date.now();
          if (remaining <= 0)
            throw new SiftlightError("Source did not stabilize before the operation deadline", {
              cause: error
            });
          this.#operations.updateProgress(operationId, {
            phase: "refreshing",
            detail: `generation retry ${String(++refreshAttempt)}: ${error.message}`
          });
          await waitForSourceRefresh(combined, Math.min(100, remaining));
        }
      }
    }, { mode: input.mode, redact: input.redact ?? false, cwd });
    const outcome = await this.#operations.wait(started.id, OPERATION_INITIAL_WAIT_MS, signal);
    return operationOutcome(outcome, input.mode);
  }
  async#operationCommand(input, cwd, signal) {
    if (!input.operationId || typeof input.operationId !== "string")
      throw new SiftlightError("mode=await and mode=cancel require operationId");
    const existing = this.#operations.get(input.operationId);
    const mode = existing.metadata.mode;
    if (resolve23(cwd) !== resolve23(existing.metadata.cwd))
      throw new SiftlightError("Operation belongs to a different working directory");
    const forbidden = Object.keys(input).filter((key) => key !== "mode" && key !== "operationId");
    if (forbidden.length > 0)
      throw new SiftlightError(`${input.mode} accepts only operationId; remove ${forbidden.join(", ")} and copy the returned nextRequest exactly`);
    if (input.mode === "cancel") {
      const cancelled = await this.#operations.cancelAndWait(input.operationId);
      if (cancelled.state === "complete" && cancelled.result !== undefined)
        return completeOperationResult(cancelled.result, cancelled);
      return operationStateResult(cancelled, mode);
    }
    const outcome = await this.#operations.wait(input.operationId, OPERATION_INITIAL_WAIT_MS, signal);
    return operationOutcome(outcome, mode);
  }
  async#search(input, cwd, signal, options = {}) {
    if (input.cursor !== undefined && (typeof input.cursor !== "string" || input.cursor.trim().length === 0)) {
      throw new CursorError("Invalid cursor. Copy a nonempty cursor from a previous result.");
    }
    const mode = input.mode ?? "auto";
    if (mode === "capabilities") {
      const inventory = await this.#capabilities.inspect({
        cwd,
        ...input.path !== undefined ? { path: input.path } : {},
        glob: filterList(input.glob),
        exclude: filterList(input.exclude),
        ...input.hidden !== undefined ? { hidden: input.hidden } : {},
        ...signal ? { signal } : {}
      });
      return capabilitiesResult(inventory);
    }
    if (mode === "audit")
      return runAuditSearch(input, cwd, this.#runRipgrep, signal);
    const contextBudget = selectContextBudget(input, mode, options.contextBudget);
    if (isEvidenceRequest(input))
      return this.#evidence.search(input, cwd, signal, options);
    if (input.query !== undefined)
      throw new SiftlightError(DISCOVERY_MODE_REQUIRED_ERROR);
    if (input.maxFilesToParse !== undefined) {
      throw new SiftlightError("maxFilesToParse is only valid for structural analysis requests");
    }
    if (input.cursor)
      return this.#continue(input, cwd, signal, options);
    if (input.paths !== undefined) {
      throw new SiftlightError("paths can only select retained files from a cursor");
    }
    if (input.matchIndex !== undefined) {
      throw new SiftlightError("matchIndex requires mode=inspect with a cursor");
    }
    if (input.matchIndices !== undefined || input.targets !== undefined) {
      throw new SiftlightError("matchIndices and targets require mode=inspect");
    }
    if (input.line !== undefined)
      throw new SiftlightError("line requires mode=inspect");
    const request = normalizeRequest(input);
    let scan = await this.#runRipgrep(request, cwd, signal);
    if (scan.totalMatches === 0 && request.path !== undefined && request.scope !== "strict") {
      const { path: requestedPath, ...projectRequest } = request;
      scan = await this.#runRipgrep({ ...projectRequest, expandedFromPath: requestedPath }, cwd, signal);
    }
    const snapshot = this.#snapshots.create(scan);
    try {
      let result;
      if (snapshot.totalMatches === 0) {
        const details = baseDetails2(snapshot, mode);
        result = {
          text: emptyResultText(details),
          details
        };
      } else if (snapshot.matches.length === 0) {
        result = await this.#summary(snapshot, mode, cwd, signal);
      } else if (mode === "summary") {
        result = await this.#summary(snapshot, mode, cwd, signal);
      } else if (mode === "matches") {
        result = await this.#page(snapshot, 0, mode, signal, undefined, options);
      } else {
        if (input.limit !== undefined) {
          result = await this.#page(snapshot, 0, mode, signal, undefined, options);
        } else if (contextBudget !== undefined && contextBudget.tier !== "full" && input.limit === undefined) {
          result = await this.#summary(snapshot, mode, cwd, signal, 0, contextBudget);
        } else {
          try {
            const page = await formatMatchPage(snapshot, 0, signal, matchPageOptions(input.limit === undefined ? contextBudget : undefined));
            result = snapshot.snapshotComplete && page.nextOffset === snapshot.matches.length ? this.#pageResult(snapshot, 0, mode, page) : await this.#summary(snapshot, mode, cwd, signal, 0, contextBudget);
          } catch (error) {
            if (!(error instanceof MatchPageSoftLimitError))
              throw error;
            result = await this.#summary(snapshot, mode, cwd, signal, 0, contextBudget);
          }
        }
      }
      result = {
        ...result,
        text: `${scopeExpansionNote(result.details.scope, result.details.totalMatches).trim()}${result.details.scope?.expandedToProjectRoot ? `

` : ""}${result.text}`
      };
      const budgetedResult = attachContextBudget(result, contextBudget, snapshot.totalMatches);
      return this.#finalize(snapshot, budgetedResult);
    } catch (error) {
      this.#snapshots.delete(snapshot);
      throw error;
    }
  }
  clear() {
    this.#lifecycle.abort();
    this.#lifecycle = new AbortController;
    this.#operations.reset();
    this.#snapshots.clear();
    this.#evidence.clear();
  }
  async shutdown() {
    this.#lifecycle.abort();
    this.#operations.clear();
    const pending = [...this.#active];
    await Promise.allSettled(pending);
    await this.#operations.shutdown();
    this.#snapshots.clear();
    this.#evidence.clear();
    await this.#evidence.shutdown();
  }
  get snapshotCount() {
    return this.#snapshots.size;
  }
  get storedMatches() {
    return this.#snapshots.storedMatches;
  }
  async#continue(input, cwd, signal, options = {}) {
    const cursor = input.cursor;
    if (!cursor)
      throw new CursorError("A cursor is required to continue a search");
    const { snapshot, offset, kind, selectionKey } = this.#snapshots.resolve(cursor);
    const mode = input.mode ?? "auto";
    if (mode === "summary") {
      if (input.path !== undefined || input.paths !== undefined) {
        throw new SiftlightError("path and paths are not valid while paging a file summary");
      }
      if (kind !== "summary") {
        throw new CursorError("A summary cursor is required to continue a file summary.", "E_CURSOR_WRONG_KIND");
      }
      if (offset >= snapshot.fileCounts.size) {
        throw new CursorError("Cursor is already at the end of the file summary.");
      }
      return this.#summary(snapshot, mode, cwd, signal, offset);
    }
    const selection = cursorPathSelection(input, cwd);
    const requestedSelectionKey = selection?.key ?? "all";
    if (kind === "matches" && selectionKey !== requestedSelectionKey) {
      throw new CursorError("A match cursor must continue with the same path selection.", "E_CURSOR_OPTIONS_CONFLICT");
    }
    const pageOffset = kind === "summary" ? 0 : offset;
    const result = await this.#page(snapshot, pageOffset, "matches", signal, selection, options);
    return this.#finalize(snapshot, result, kind === "summary" || selection !== undefined);
  }
  #finalize(snapshot, result, retainSnapshot = false) {
    if (!result.details.cursor && !result.details.inspectRequest && !retainSnapshot && !this.#reusableSummarySnapshots.has(snapshot)) {
      this.#snapshots.delete(snapshot);
    }
    return result;
  }
  async#summary(snapshot, mode, cwd, signal, offset = 0, budget) {
    this.#reusableSummarySnapshots.add(snapshot);
    const summary = formatSummary(snapshot, this.#summaryFileLimit, offset, budget?.resultTokenBudget);
    const details = baseDetails2(snapshot, mode);
    const cursor = snapshot.fileCounts.size > 0 ? this.#snapshots.cursor(snapshot, summary.nextOffset, "summary") : undefined;
    const fileRange = summary.shown > 0 ? `Files ${String(summary.offset + 1)}-${String(summary.nextOffset)} of ${String(snapshot.fileCounts.size)}, ordered by match count.` : "No retained file summaries are available.";
    const omitted = summary.omitted > 0 ? `
… ${String(summary.omitted)} lower-ranked files remain.` : "";
    const preview = await summarySourcePreviews(snapshot, summary.shownPaths, summary.previewByteBudget, cwd, signal);
    const sampleText = preview.text;
    const indices = preview.indices;
    const samples = sampleText ? `

Samples: first retained match; bounded source windows; not relevance-ranked or exhaustive.
${sampleText}` : "";
    const sampleOmissions = `
[Preview limits: at most 5 source files, 2 non-overlapping windows/file, 7 lines/window. File rows and navigation take priority; shown ${preview.text ? preview.windows : summary.previewsShown} previews.]${preview.reasons.length ? `
[${preview.reasons.map((reason) => reason.slice(0, 200)).join("; ")}]` : ""}`;
    const redaction = snapshot.request.redact ? { redact: true } : {};
    const nextRequest = cursor && summary.hasNext ? { cursor, mode: "summary", ...redaction } : undefined;
    const inspectRequest = cursor && indices.length ? {
      mode: "inspect",
      cursor,
      matchIndices: indices.slice(0, MAX_INSPECT_TARGETS),
      ...redaction
    } : undefined;
    const matchesRequest = cursor && snapshot.matches.length > 0 && summary.shownPaths.length ? { cursor, paths: summary.shownPaths.slice(0, 1), ...redaction } : undefined;
    const followUp = cursor ? `

Snapshot cursor="${cursor}". Snapshot cursor available: ${cursor}.${inspectRequest ? `
Inspect samples: ${JSON.stringify(inspectRequest)}` : ""}${matchesRequest ? `
Retrieve matching lines: ${JSON.stringify(matchesRequest)}` : ""}${nextRequest ? `
Next request: ${JSON.stringify(nextRequest)}` : ""}` : "";
    const complete = snapshot.snapshotComplete && (snapshot.filesystemCoverage ?? "complete") === "complete";
    const text = `Search summary (${complete ? "complete" : "PARTIAL"}). ${snapshot.totalMatches} matches across ${snapshot.fileCounts.size} files (${completenessNote(snapshot)}).
${fileRange}

${summary.body}${omitted}${samples}${sampleOmissions}${lineExcerptNote(snapshot)}${modificationTimeBoundsText(details.scope?.modifiedAfterMs, details.scope?.modifiedBeforeMs)}${followUp}${sourceVerificationNote(details)}`;
    return {
      text,
      details: {
        ...details,
        ...cursor ? { cursor } : {},
        ...nextRequest ? { nextRequest } : {},
        summaryOffset: summary.offset,
        summaryFilesShown: summary.shown,
        summaryFilesOmitted: summary.omitted,
        summaryPreviewsShown: preview.text ? preview.windows : summary.previewsShown,
        summaryPreviewsOmitted: Math.max(0, summary.shown - (preview.text ? new Set(indices.map((index) => snapshot.matches[index - 1]?.displayPath)).size : summary.previewsShown))
      }
    };
  }
  async#page(snapshot, offset, mode, signal, selection, options = {}) {
    if (offset === snapshot.matches.length) {
      throw new CursorError("Cursor is already at the end of the retained snapshot.");
    }
    const pageOptions = selection ? {
      metadataReserveBytes: 1536 + Buffer.byteLength(JSON.stringify({ paths: selection.labels })),
      include: (match) => selection.absolutePaths.has(match.absolutePath)
    } : {};
    let page;
    if (!options.modelSource) {
      page = await formatMatchMetadataPage(snapshot, offset, signal, pageOptions);
    } else {
      try {
        page = await formatMatchPage(snapshot, offset, signal, pageOptions);
      } catch (error) {
        if (!(error instanceof MatchPageSoftLimitError))
          throw error;
        page = await formatMatchMetadataPage(snapshot, offset, signal, pageOptions);
      }
    }
    if (page.returnedMatches === 0 && selection) {
      throw new CursorError("No retained matches exist for the selected paths.");
    }
    const missingPaths = [];
    if (selection) {
      const matchedAbsolutePaths = new Set;
      for (const match of snapshot.matches) {
        if (selection.absolutePaths.has(match.absolutePath)) {
          matchedAbsolutePaths.add(match.absolutePath);
        }
      }
      const selectedAbsolutePaths = [...selection.absolutePaths];
      for (const [index, label] of selection.labels.entries()) {
        const absolutePath = selectedAbsolutePaths[index];
        if (absolutePath !== undefined && !matchedAbsolutePaths.has(absolutePath)) {
          missingPaths.push(label);
        }
      }
    }
    return this.#pageResult(snapshot, offset, mode, page, selection?.labels, missingPaths, selection?.key ?? "all");
  }
  #pageResult(snapshot, offset, mode, page, selectedPaths, selectionMissingPaths = [], selectionKey = "all") {
    if (page.returnedMatches === 0) {
      throw new SiftlightError("The output budget could not fit a single match");
    }
    const cursor = page.hasNext ? this.#snapshots.cursor(snapshot, page.nextOffset, "matches", selectionKey) : undefined;
    const firstMatch = page.firstMatchIndex ?? offset;
    const lastMatch = page.lastMatchIndex ?? firstMatch;
    const range = `${firstMatch + 1}-${lastMatch + 1}`;
    const selection = selectedPaths ? `; selected ${String(selectedPaths.length)} path(s)` : "";
    const missingSelectionNote = selectionMissingPaths.length > 0 ? `

[${String(selectionMissingPaths.length)} selected path(s) had no retained matches.]` : "";
    const details = baseDetails2(snapshot, mode);
    const next = cursor ? `

Continue with cursor="${cursor}".
Next request: ${JSON.stringify({ cursor, ...selectedPaths ? { paths: selectedPaths } : {}, ...snapshot.request.redact ? { redact: true } : {} })}` : "";
    const rangeNote = page.hasMatchRanges ? `

[Match columns are 1-based UTF-16 positions${page.hasByteRanges ? "; b ranges use raw UTF-8 bytes" : ""}.]` : "";
    const contextNotes = [];
    if (page.contextChangedFiles.length > 0)
      contextNotes.push(`Context omitted for ${String(page.contextChangedFiles.length)} changed file(s); refresh the search before relying on surrounding lines.`);
    if (page.contextOmittedFiles.length > 0)
      contextNotes.push(`Context unavailable for ${String(page.contextOmittedFiles.length)} file(s); retained matching lines are still shown.`);
    const contextNote = contextNotes.length > 0 ? `

[${contextNotes.join(" ")}]` : "";
    const inspectRequest = snapshot.truncatedLines > 0 ? {
      mode: "inspect",
      cursor: this.#snapshots.cursor(snapshot, 0, "matches"),
      matchIndex: firstMatch + 1,
      ...snapshot.request.redact ? { redact: true } : {}
    } : undefined;
    const inspectNote = inspectRequest ? `
Inspect source (choose a visible matchIndex): ${JSON.stringify(inspectRequest)}` : "";
    return {
      text: `Match metadata ${range} of ${snapshot.totalMatches}${selection}; ${page.returnedMatches} returned.
Occurrences: ${pageMatchesOccurrences(snapshot, firstMatch, lastMatch)} occurrences.

${page.body}${rangeNote}${contextNote}${missingSelectionNote}

[Matches ${range} of ${snapshot.totalMatches}${selection}; ${completenessNote(snapshot)}.]${lineExcerptNote(snapshot)}${inspectNote}${modificationTimeBoundsText(details.scope?.modifiedAfterMs, details.scope?.modifiedBeforeMs)}${next}${sourceVerificationNote(details)}`,
      details: {
        ...details,
        returnedMatches: page.returnedMatches,
        ...inspectRequest ? { inspectRequest } : {},
        ...page.occurrenceRangesOmitted > 0 ? { occurrenceRangesOmitted: page.occurrenceRangesOmitted } : {},
        ...page.occurrenceMatchesTruncated > 0 ? { occurrenceMatchesTruncated: page.occurrenceMatchesTruncated } : {},
        ...cursor ? { cursor } : {},
        ...cursor ? {
          nextRequest: {
            cursor,
            ...selectedPaths ? { paths: selectedPaths } : {},
            ...snapshot.request.redact ? { redact: true } : {}
          }
        } : {},
        ...selectedPaths ? { selectedPaths } : {},
        ...selectionMissingPaths.length > 0 ? { selectionMissingPaths } : {},
        ...page.contextOmittedFiles.length > 0 ? { contextOmittedFiles: page.contextOmittedFiles } : {},
        ...page.contextChangedFiles.length > 0 ? { contextChangedFiles: page.contextChangedFiles } : {}
      }
    };
  }
}

// src/config-reader.ts
import { readFile as readFile3 } from "node:fs/promises";
var SIFTLIGHT_CONFIG_ENV = "SIFTLIGHT_CONFIG";
var SEMANTIC_JUDGE_API_KEY_ENVS = ["TYPESAFE_API_KEY", "SIFTLIGHT_JEV_API_KEY"];
var DEFAULT_SEMANTIC_JUDGE_CONFIG = {
  enabled: false,
  provider: "jev",
  endpoint: "https://api.typesafe.ai/v1/systemone",
  apiKeyEnv: SEMANTIC_JUDGE_API_KEY_ENVS[0],
  model: "jev-latest",
  timeoutMs: 120000,
  maxCandidates: 20,
  maxRetries: 2
};
var DEFAULT_SIFTLIGHT_CONFIG = {
  locale: "en",
  enforceSearch: "hard",
  semanticJudge: DEFAULT_SEMANTIC_JUDGE_CONFIG
};
function hasErrorCode(error, codes) {
  return error instanceof Error && "code" in error && codes.includes(String(error.code));
}
function isMissingFile(error) {
  return hasErrorCode(error, ["ENOENT"]);
}
function isRawSiftlightConfig(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isRawSemanticJudgeConfig(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function boundedInteger2(value, fallback, minimum, maximum, field) {
  const candidate = value ?? fallback;
  if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new Error(`Invalid siftlight ${field}: expected an integer from ${String(minimum)} through ${String(maximum)}`);
  }
  return candidate;
}
function parseSemanticJudge(value, path) {
  if (value === undefined)
    return { ...DEFAULT_SEMANTIC_JUDGE_CONFIG };
  if (!isRawSemanticJudgeConfig(value)) {
    throw new Error(`Invalid siftlight config at ${path}: semanticJudge must be an object`);
  }
  const unknown = Object.keys(value).filter((key) => ![
    "enabled",
    "provider",
    "endpoint",
    "apiKeyEnv",
    "model",
    "timeoutMs",
    "maxCandidates",
    "maxRetries"
  ].includes(key));
  if (unknown.length > 0) {
    throw new Error(`Invalid siftlight config at ${path}: unsupported semanticJudge fields; accepted fields are enabled, provider, endpoint, apiKeyEnv, model, timeoutMs, maxCandidates and maxRetries`);
  }
  const enabled = value.enabled ?? DEFAULT_SEMANTIC_JUDGE_CONFIG.enabled;
  if (typeof enabled !== "boolean") {
    throw new Error(`Invalid siftlight config at ${path}: semanticJudge.enabled must be a boolean`);
  }
  const provider = value.provider ?? DEFAULT_SEMANTIC_JUDGE_CONFIG.provider;
  if (provider !== "jev") {
    throw new Error(`Invalid siftlight config at ${path}: semanticJudge.provider must be "jev"`);
  }
  const endpoint = value.endpoint ?? DEFAULT_SEMANTIC_JUDGE_CONFIG.endpoint;
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 2048) {
    throw new Error(`Invalid siftlight config at ${path}: semanticJudge.endpoint must be a nonempty URL`);
  }
  let parsedEndpoint;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch (error) {
    throw new Error(`Invalid siftlight config at ${path}: semanticJudge.endpoint must be a URL`, {
      cause: error
    });
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const secureEndpoint = parsedEndpoint.protocol === "https:" || parsedEndpoint.protocol === "http:" && loopbackHosts.has(parsedEndpoint.hostname);
  if (!secureEndpoint || parsedEndpoint.username || parsedEndpoint.password) {
    throw new Error(`Invalid siftlight config at ${path}: semanticJudge.endpoint must use HTTPS, except that HTTP is allowed for localhost loopback development; URL credentials are not allowed`);
  }
  const apiKeyEnv = value.apiKeyEnv ?? DEFAULT_SEMANTIC_JUDGE_CONFIG.apiKeyEnv;
  if (typeof apiKeyEnv !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/u.test(apiKeyEnv)) {
    throw new Error(`Invalid siftlight config at ${path}: semanticJudge.apiKeyEnv must be an uppercase environment variable name`);
  }
  const model = value.model ?? DEFAULT_SEMANTIC_JUDGE_CONFIG.model;
  if (typeof model !== "string" || model.length === 0 || model.length > 128 || /[\r\n\0]/u.test(model)) {
    throw new Error(`Invalid siftlight config at ${path}: semanticJudge.model must be bounded single-line text`);
  }
  return {
    enabled,
    provider,
    endpoint,
    apiKeyEnv,
    model,
    timeoutMs: boundedInteger2(value.timeoutMs, DEFAULT_SEMANTIC_JUDGE_CONFIG.timeoutMs, 1000, 1200000, `config at ${path}: semanticJudge.timeoutMs`),
    maxCandidates: boundedInteger2(value.maxCandidates, DEFAULT_SEMANTIC_JUDGE_CONFIG.maxCandidates, 1, 20, `config at ${path}: semanticJudge.maxCandidates`),
    maxRetries: boundedInteger2(value.maxRetries, DEFAULT_SEMANTIC_JUDGE_CONFIG.maxRetries, 0, 5, `config at ${path}: semanticJudge.maxRetries`)
  };
}
function parseConfig(value, path) {
  if (!isRawSiftlightConfig(value)) {
    throw new Error(`Invalid siftlight config at ${path}: expected a JSON object`);
  }
  const unknown = Object.keys(value).filter((key) => !["locale", "enforceSearch", "semanticJudge"].includes(key));
  if (unknown.length > 0) {
    throw new Error(`Invalid siftlight config at ${path}: unsupported configuration fields; only locale, enforceSearch and semanticJudge are accepted`);
  }
  const { locale, enforceSearch } = value;
  if (locale !== undefined && locale !== "en" && locale !== "zh-CN") {
    throw new Error(`Invalid siftlight config at ${path}: locale must be "en" or "zh-CN"`);
  }
  const enforcement = normalizeSearchEnforcement(enforceSearch, `config at ${path}`);
  return {
    locale: locale ?? DEFAULT_SIFTLIGHT_CONFIG.locale,
    enforceSearch: enforcement,
    semanticJudge: parseSemanticJudge(value.semanticJudge, path)
  };
}
function normalizeSearchEnforcement(value, source) {
  if (value === undefined || value === "hard")
    return "hard";
  if (value === "prefer")
    return "prefer";
  if (value === "off")
    return "off";
  throw new Error(`Invalid siftlight ${source}: enforceSearch must be "hard", "prefer", or "off"`);
}
async function readSiftlightConfigFile(path, options = {}) {
  try {
    const content = await readFile3(path, "utf8");
    return parseConfig(JSON.parse(content), path);
  } catch (error) {
    if (isMissingFile(error)) {
      if (options.missing === "error") {
        throw new Error(`siftlight config was not found at ${path}; create it or unset ${SIFTLIGHT_CONFIG_ENV}`, { cause: error });
      }
      return { ...DEFAULT_SIFTLIGHT_CONFIG };
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid siftlight config at ${path}: ${error.message}`, {
        cause: error
      });
    }
    throw error;
  }
}

// src/prompt-guidelines.ts
var SOURCE_OUTPUT_GUIDANCE = "Auto/summary text may include bounded source excerpts; ordinary matches text is metadata-only. Inspect may return bounded source windows covering an entire small file. Analysis text may include semantic passages; structured details may retain excerpts, names and signatures. Follow output limits, coverage and continuations.";
function siftlightPromptGuidelines(structuredOutput = true) {
  return [
    `Use siftlight for read-only content search. ${SOURCE_OUTPUT_GUIDANCE} Omit mode and limit for automatic detail/summary selection; use mode="matches" for ordinary match metadata.`,
    `An omitted path searches the project cwd. Use scope:"strict" for a question restricted to one path; otherwise, if an explicit subpath has zero matches, ordinary and content-analysis searches retry from cwd and return project-wide counts with an expansion notice. Explicit absolute paths and .. traversal can search outside cwd, except protected external system areas and .git internals. Git changes mode remains cwd-scoped.`,
    `Search output includes counts, categories, ranked paths, coverage and continuation metadata. Source excerpts may contain the searched text. Use mode="inspect" or the host read capability when exact source is required for an edit or verification.`,
    `Use file and directory distributions to choose evidence. Reuse the visible cursor with path or paths for match metadata; mode="summary" pages the remaining file statistics. Match counts are not relevance scores.`,
    `Mode="inspect" with a direct path/line or ordinary retained match returns bounded source windows and source-revision metadata. Some retained analysis selectors return only revision metadata; use direct path/line or the host read capability when source is needed. Do not use inspection merely to obtain a citation.`,
    `Use allOf:["term1","term2"] for explicit same-file literal AND. Add within:"function" only together with allOf to restrict that conjunction to one own-implementation JS/TS/TSX function; omit within for ordinary single-pattern searches. Use roles:["declaration"] or roles:["call"] with a single pattern for JS/TS/TSX/Go syntactic occurrence statistics.`,
    `Use anyOf:["term1","term2"] when every exact occurrence of 2-64 literals is needed in one version-bound result. It is case-sensitive, reports anonymized condition counts, and runs requests above eight terms as bounded parallel chunks. Large condition inventories have separate continuation pages; copy those requests to retrieve the complete counts.`,
    `For a changed-code question, add changes:{base:"HEAD",scope:"lines",side:"new"}; omit target for the working tree, use side:"old" for deleted-side statistics. Copy returned continuation requests to preserve source versions.`,
    `Use mode:"capabilities" when the language or requested operation is unclear to get a compact lazy inventory. Use mode:"outline" with a concrete source file path for symbol counts and locations, mode:"imports" for static relationships, and mode:"tests" for related-test candidates. Their text pages summarize metadata; structured details can retain source evidence.`,
    `Use mode:"files" plus query for unknown filenames and fuzzy paths. Multi-word filename queries require each word literally in the path; business concepts belong in hybrid/concept. Use wholeWord:true for a single-pattern whole-word search. exclude contains file globs, not content negation.`,
    `Use mode:"structure" only for JS/TS/TSX/Go, with a required nonempty ast-grep pattern such as "compare($X, $X)" or "send()" for code shapes across whitespace; the text page reports structural counts and locations; structured details can retain matched source evidence.`,
    `Use mode:"concept" plus a natural-language query when names are unknown. It runs a pinned local multilingual model only after explicit installation; no search downloads weights or sends code to a remote model. Results expose candidate counts, score statistics, paths and the bounded ranked passage behind each candidate. Similarity scores identify candidates, not correctness.`,
    `Use mode:"hybrid" plus query when wording may differ from the source. It reports exact and semantic counts separately, removes overlap, and retains one pageable evidence snapshot. conceptLimit changes only the semantic candidate count; retained candidates keep their bounded source passages.`,
    `If an operation is waiting or partial, follow its visible continuation request and read coverage/reasons. Never treat a partial result as complete, and never restart solely to obtain source text.`,
    `If a request is rejected, keep the strongest applicable mode and follow its repair instruction exactly once. Do not paste the error or rejected request into the retry, repeat an unchanged request, or switch to a weaker search because of a fixable argument error. Only an explicit capability-unavailable result permits a bounded alternative, which remains partial and must not be presented as complete.`,
    structuredOutput ? `When status=partial, read details.analysis.coverage to see which conclusion is incomplete; an exact occurrence count may remain complete even when syntax or related-test analysis is partial.` : `When status=partial, read the visible Coverage and bracketed reasons to see which conclusion is incomplete; an exact occurrence count may remain complete even when syntax or related-test analysis is partial.`
  ];
}
function siftlightModelGuidelines() {
  return [
    `Search with pattern and optional path. ${SOURCE_OUTPUT_GUIDANCE} Omit mode/limit for automatic detail/summary selection. Compact model analysis pages may defer source excerpts to inspect.`,
    `Use ranked paths and condition counts to choose evidence. Cursor continuation pages the retained snapshot; summary file selection returns ordinary match metadata. Use mode="inspect" when an edit requires exact source.`,
    `Modes: capabilities for language prerequisites; files+query for filenames; anyOf/allOf for literal condition statistics; outline/imports/tests for structural and relationship summaries; structure for AST match statistics; concept/hybrid for semantic candidate statistics. Similarity and static links are not proof.`,
    `On rejection keep the strongest applicable mode and apply the stated repair once. Do not repeat the rejected request or include its error. Only explicit capability-unavailable permits a visibly partial alternative.`
  ];
}
function siftlightMcpInstructions(outputMode = DEFAULT_MCP_OUTPUT_MODE) {
  const outputInstruction = outputMode === "structured" ? "Successful MCP results provide text and details with statistics, categories, paths, locations, coverage and continuation metadata, plus the bounded excerpts or source windows the requested mode retains. content[].text and structuredContent.text contain the same final text; structuredContent.details also carries structured evidence." : outputMode === "model" ? "Returns one compact model-facing evidence page: paths, locations, classifications and any retained excerpts; copy continuation requests exactly." : "Successful MCP results provide one complete evidence page with statistics, coverage, continuation selectors and any bounded excerpts the requested mode retains.";
  return [
    "Use siftlight for read-only local search with bounded source evidence from the configured project cwd.",
    outputInstruction,
    ...outputMode === "model" ? siftlightModelGuidelines() : siftlightPromptGuidelines(outputMode === "structured")
  ].join(`
`);
}

// src/tool-schema.ts
import { Type } from "typebox";
function stringEnum(values, options) {
  return Type.Unsafe({
    type: "string",
    enum: values,
    ...options?.description ? { description: options.description } : {}
  });
}
var SIFTLIGHT_DESCRIPTION = `Search and navigate code with bounded, verifiable evidence. Ordinary pattern searches use auto detail/summary; pattern is regex by default and literal=true matches source text exactly. A path selects an existing exact file or root; use mode=files with query to discover an unknown name. scope=strict prevents zero-result path expansion and wholeWord requires word boundaries. mode=capabilities returns a compact names-only project language inventory and the modes available for each detected language; capability providers are loaded only when the requested analysis runs. It never starts a parser, compiler, model or language server. mode=concept accepts a natural-language query, path and source filters; mode=hybrid uses one natural-language query for exact and local concept evidence, ranks exact evidence first, and retains a bounded semantic supplement. An explicitly enabled semantic judge may classify hybrid candidates, but it is disabled by default and never turns classification into a runtime proof. Slow concept/hybrid requests return status=waiting or running with operationId, progress, and an exact nextRequest using mode=await; copy that request unchanged to continue the same computation. Await expiry never downgrades evidence to literal-only or partial, and final results remain stable for the operation retention window. mode=cancel explicitly stops one operation. allOf and anyOf are explicit literal variants and cannot be mixed with pattern/literal; limit and context are output intent and are never silently dropped. modifiedAfter/modifiedBefore filter worktree files by inclusive/exclusive modification-time bounds in Unix milliseconds. structure requires a nonempty AST pattern and JS/TS/TSX/Go sources; lang is not a field. Outline uses a concrete source file path (not a directory) or retained cursor+matchIndex and follows declared syntax capabilities. imports/tests return bounded static module and related-test candidates without proving runtime execution. validate checks saved source evidence against its recorded origin. Partial coverage stays explicit. ${REQUEST_USAGE_GUIDANCE}`;
var SIFTLIGHT_MODEL_DESCRIPTION = `Bounded local evidence search. ${MODEL_USAGE_GUIDANCE}. Copy cursors; analysis is evidence, not proof.`;
var siftlightSchema = Type.Object({
  query: Type.Optional(Type.String({
    maxLength: 256,
    description: `${fieldGuidance("query")}. Hybrid uses the same query as exact literal text and as the local concept query. Discovery modes preserve their requested path. Concept and hybrid require an explicitly installed local model. A semantic judge is optional and remains disabled unless the active configuration explicitly enables it.`
  })),
  scope: Type.Optional(stringEnum(["strict", "expand"], {
    description: `${fieldGuidance("scope")}; expand (default) retries ordinary content search from project cwd. Applies to ordinary, multi-term and role searches.`
  })),
  wholeWord: Type.Optional(Type.Boolean({
    description: "Single-pattern search only: require ripgrep Unicode word boundaries around the match. Works with regex or literal=true."
  })),
  anyOf: Type.Optional(Type.Array(Type.String({ maxLength: MAX_LITERAL_TERM_BYTES }), {
    minItems: MIN_ANY_OF_TERMS,
    maxItems: MAX_ANY_OF_TOTAL_TERMS,
    description: `${fieldGuidance("anyOf")}. ${String(MIN_ANY_OF_TERMS)}-${String(MAX_ANY_OF_TOTAL_TERMS)} distinct case-sensitive single-line terms, at most ${String(MAX_LITERAL_TERM_BYTES)} UTF-8 bytes each. Requests above ${String(MAX_ANY_OF_TERMS)} terms are split into version-checked chunks and merged. Returns every retained occurrence attributed to its term.`
  })),
  allOf: Type.Optional(Type.Array(Type.String({ maxLength: MAX_PATH_CHARACTERS }), {
    minItems: 2,
    maxItems: 3,
    description: `${fieldGuidance("allOf")}. 2-3 distinct terms must occur in one file (default) or one function.`
  })),
  within: Type.Optional(stringEnum(["file", "function"], {
    description: "Only valid with allOf; omit for ordinary single-pattern searches. function requires JS/TS/TSX and counts only that implementation's own code, excluding nested callbacks, strings/comments/types. Not proof of a shared execution path."
  })),
  roles: Type.Optional(Type.Array(stringEnum([
    "declaration",
    "call",
    "import",
    "export",
    "comment",
    "string",
    "jsx-text",
    "code",
    "unknown"
  ]), {
    minItems: 1,
    description: "Filter each single-pattern occurrence by syntax role (JS/TS/TSX/Go). Roles may be candidates, especially Go call/conversion ambiguity. Cannot combine with allOf."
  })),
  changes: Type.Optional(Type.Object({
    base: Type.Optional(Type.String({
      description: "Git base commit/ref; default HEAD, pinned to a commit at query time."
    })),
    target: Type.Optional(Type.String({
      description: "Optional target commit/ref. Omit for final working-tree contents including unignored untracked files, not just the staged index."
    })),
    scope: stringEnum(["files", "lines"], {
      description: "Search changed files or only changed lines. With allOf every term must lie on the chosen side's changed lines."
    }),
    side: stringEnum(["new", "old"], {
      description: "Choose final/new content or deleted/old content. Historical inspect and continuation remain bound to that commit/blob."
    })
  })),
  sourceCursor: Type.Optional(Type.String({
    description: "Missing-source continuation token. Copy nextRequest exactly: mode=inspect plus sourceCursor only. Same token replays the same page; changed or expired sources fail clearly."
  })),
  symbol: Type.Optional(Type.String({
    description: "Syntax name for outline/imports/tests; use a concrete source file and line to narrow repeated names."
  })),
  pattern: Type.Optional(Type.String({
    maxLength: MAX_PATTERN_CHARACTERS,
    description: `${fieldGuidance("pattern")}. mode=structure requires a nonempty ast-grep code pattern for JS/TS/TSX/Go (no lang field), at most 4 KiB, including $NAME and $$$ARGS metavariables; no regex/literal options. Omit for discovery, syntax navigation, inspection and cursors.`
  })),
  path: Type.Optional(Type.String({
    maxLength: MAX_PATH_CHARACTERS,
    description: `${fieldGuidance("path")}. A zero-result content search expands from cwd unless scope=strict. outline and compiler navigation require a concrete file, not a directory. Compiler navigation stays within admitted workspace sources. Absolute paths and .. traversal may resolve outside cwd, except protected external system areas and .git internals; Git changes mode remains cwd-scoped.`
  })),
  paths: Type.Optional(Type.Array(Type.String(), {
    minItems: 1,
    maxItems: MAX_SELECTED_PATHS,
    description: "Exact retained files to select together from a cursor. A new search accepts one path; split multiple roots into separate requests."
  })),
  glob: Type.Optional(Type.Union([
    Type.String({ maxLength: MAX_PATH_CHARACTERS }),
    Type.Array(Type.String({ maxLength: MAX_PATH_CHARACTERS }), {
      maxItems: MAX_FILE_FILTER_ITEMS
    })
  ], {
    description: "Include glob or globs, for example '*.ts' or 'src/**'."
  })),
  exclude: Type.Optional(Type.Union([
    Type.String({ maxLength: MAX_PATH_CHARACTERS }),
    Type.Array(Type.String({ maxLength: MAX_PATH_CHARACTERS }), {
      maxItems: MAX_FILE_FILTER_ITEMS
    })
  ], {
    description: "Exclude file/path globs (not content negation); applied after include globs. A leading ! is optional."
  })),
  literal: Type.Optional(Type.Boolean({ description: fieldGuidance("literal") })),
  ignoreCase: Type.Optional(Type.Boolean({
    description: "true for insensitive, false for sensitive; omitted uses smart-case."
  })),
  hidden: Type.Optional(Type.Boolean({ description: "Search hidden files (default true; .git is always excluded)." })),
  ignorePolicy: Type.Optional(stringEnum(["respect", "include"], {
    description: "respect (default) honors ignore rules and reports policy-filtered coverage when files are omitted. include searches ignored files while still excluding .git internals and protected paths."
  })),
  patterns: Type.Optional(Type.Array(Type.Object({
    id: Type.String({ minLength: 1, maxLength: 64 }),
    literal: Type.String({
      minLength: 1,
      maxLength: MAX_AUDIT_LITERAL_CHARACTERS,
      description: `Single-line exact text, limited to ${String(MAX_AUDIT_LITERAL_CHARACTERS)} characters and UTF-8 bytes.`
    })
  }, { additionalProperties: false }), {
    minItems: 1,
    maxItems: 32,
    description: "Named exact-literal checks for mode=audit. Each finding is present, absent_with_complete_coverage, or unknown."
  })),
  redact: Type.Optional(Type.Boolean({
    description: "Optional display-only masking for credential-like values and private-key bodies. Default false. It never changes searched files, admitted matches, counts, or cursor completeness."
  })),
  modifiedAfter: Type.Optional(Type.Integer({
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    description: "Worktree modification-time lower bound, inclusive, as a Unix timestamp in milliseconds. Not valid with Git changes."
  })),
  modifiedBefore: Type.Optional(Type.Integer({
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    description: "Worktree modification-time upper bound, exclusive, as a Unix timestamp in milliseconds. Not valid with Git changes."
  })),
  maxFilesToParse: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: MAX_CONFIGURABLE_STRUCTURE_FILES,
    description: `Maximum source files parsed by one structural analysis request (default 200, max ${String(MAX_CONFIGURABLE_STRUCTURE_FILES)}). Candidate discovery still searches the full requested scope.`
  })),
  conceptLimit: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: MAX_HYBRID_CONCEPT_LIMIT,
    description: `mode=hybrid only: retain the top semantic candidates after overlap deduplication (default ${String(DEFAULT_HYBRID_CONCEPT_LIMIT)}, max ${String(MAX_HYBRID_CONCEPT_LIMIT)}). Literal evidence has an independent retention budget and is never displaced by this limit.`
  })),
  context: Type.Optional(Type.Integer({
    minimum: 0,
    maximum: MAX_CONTEXT_LINES,
    description: `${fieldGuidance("context")}. New search only: nearby lines (0-20). MUST be omitted for inspect, which selects its own bounded source window.`
  })),
  limit: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    description: `${fieldGuidance("limit")}. Ordinary search only: explicit detail-page match limit (max 100). Normally omit to preserve automatic summarization; analysis and inspect modes reject it.`
  })),
  mode: Type.Optional(stringEnum(SIFTLIGHT_MODES, {
    description: `Ordinary search defaults to auto; summary/matches request explicit pages. capabilities returns a compact names-only project inventory and per-language supported modes without loading providers. files uses query, structure uses an AST pattern, concept uses a required natural-language query, and hybrid uses one query for exact literal plus concept evidence in a single snapshot. validate rechecks saved search or analysis sources against their recorded origin. await waits for an existing long-running concept or hybrid operation without restarting it; cancel explicitly cancels one and waits for owned cleanup. Copy the returned nextRequest exactly and do not repeat the original query. Waiting is an operation state, not evidence. Validation details report the requested scope, comparison target, coverage, and freshness as current, stale, or unknown; partial coverage is retained during validation. inspect/outline/imports/tests retain their documented location selectors. Syntax results are static evidence; concept and related-test results remain candidates. ${MODE_CONTRACT_DESCRIPTION}`
  })),
  line: Type.Optional(Type.Number({
    description: "1-indexed source line for path inspection/navigation. Omit with matchIndex, matchIndices or targets."
  })),
  matchIndex: Type.Optional(Type.Number({
    description: "1-based retained match index for cursor-scoped inspect; replaces path and line."
  })),
  matchIndices: Type.Optional(Type.Array(Type.Integer({ minimum: 1 }), {
    minItems: 1,
    maxItems: MAX_INSPECT_TARGETS,
    description: "Inspect up to five visible match numbers together using the same cursor; mutually exclusive with matchIndex, path, line and targets."
  })),
  targets: Type.Optional(Type.Array(Type.Object({
    path: Type.String({ maxLength: MAX_PATH_CHARACTERS }),
    line: Type.Integer({ minimum: 1 })
  }), {
    minItems: 1,
    maxItems: MAX_INSPECT_TARGETS,
    description: "Inspect known path/line locations together without a cursor. The complete batch shares one 16 KiB response budget."
  })),
  cursor: Type.Optional(Type.String({ description: "Opaque cursor from a previous stable search snapshot." })),
  operationId: Type.Optional(Type.String({
    minLength: 1,
    maxLength: 128,
    description: "Operation handle returned by a waiting concept/hybrid result. Required with mode=await or mode=cancel; copy it exactly and do not start a new query."
  }))
});

// src/mcp.ts
var SIFTLIGHT_MCP_PATH = "/mcp";
var DEFAULT_MCP_HOST = "127.0.0.1";
var DEFAULT_MCP_PORT = 3000;
var DEFAULT_MCP_MAX_SESSIONS = 100;
var DEFAULT_MCP_SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
var MAX_MCP_BODY_BYTES = 16 * 1024 * 1024;
var SIFTLIGHT_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    text: {
      type: "string",
      description: "Complete formatted result page, including statistics, coverage and continuation requests; may contain bounded source excerpts or inspection windows."
    },
    details: { type: "object" }
  },
  required: ["text", "details"]
};
function siftlightTool(outputMode) {
  const tool = {
    name: "siftlight",
    title: "siftlight",
    description: outputMode === "model" ? SIFTLIGHT_MODEL_DESCRIPTION : SIFTLIGHT_DESCRIPTION,
    inputSchema: siftlightSchema,
    annotations: {
      title: "siftlight",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  };
  if (outputMode === "structured")
    tool.outputSchema = SIFTLIGHT_OUTPUT_SCHEMA;
  return tool;
}
function createDefaultSiftlightMcpService(semanticJudge) {
  const resolvedSemanticJudge = semanticJudge ?? createDisabledSemanticJudgeIntegration(DEFAULT_SEMANTIC_JUDGE_CONFIG);
  return new SiftlightService({
    runRipgrep: createRipgrepRunner(),
    structure: createCtagsStructureProvider(),
    semanticJudge: resolvedSemanticJudge
  });
}
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}
function validationError(value) {
  if (Value.Check(siftlightSchema, value))
    return;
  const first = Value.Errors(siftlightSchema, value)[0];
  return schemaContractError(value, first?.instancePath, first ? `expected ${first.message}` : "the request does not match the advertised schema");
}
function parseSiftlightInput(value) {
  const failure = validationError(value);
  if (failure)
    throw failure;
  return value;
}
function toolError(error, outputMode) {
  const contractProjection = isSiftlightDiagnosticError(error) ? requestContractProjection(error) : undefined;
  const text = contractProjection?.text ?? modelErrorText(error);
  const structuredError = contractProjection?.details;
  return {
    content: [{ type: "text", text }],
    isError: true,
    ...outputMode === "structured" && structuredError ? {
      structuredContent: {
        text,
        details: {
          version: 1,
          mode: structuredError.mode ?? "auto",
          status: "failed",
          totalMatches: 0,
          storedMatches: 0,
          totalFiles: 0,
          returnedMatches: 0,
          snapshotComplete: false,
          error: structuredError
        }
      }
    } : {}
  };
}
function createSiftlightMcpServer(service, cwd, outputMode = DEFAULT_MCP_OUTPUT_MODE) {
  const resolvedOutputMode = parseSiftlightMcpOutputMode(outputMode);
  const tool = siftlightTool(resolvedOutputMode);
  const server = new McpServer({ name: "siftlight", version: SIFTLIGHT_VERSION }, {
    capabilities: { tools: {} },
    instructions: siftlightMcpInstructions(resolvedOutputMode)
  });
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [tool]
  }));
  server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (request.params.name !== tool.name) {
      return toolError(new Error(`Unknown tool: ${request.params.name}`), resolvedOutputMode);
    }
    try {
      const input = parseSiftlightInput(request.params.arguments ?? {});
      const result = await service.search(input, cwd, extra.signal, {
        modelOutput: resolvedOutputMode === "model",
        modelSource: resolvedOutputMode === "model" && (input.cursor !== undefined || input.limit !== undefined)
      });
      const text = resolvedOutputMode === "model" ? compactMcpModelText(result) : result.text;
      const content = [{ type: "text", text }];
      if (resolvedOutputMode !== "structured")
        return { content };
      return { content, structuredContent: { text: result.text, details: result.details } };
    } catch (error) {
      return toolError(error, resolvedOutputMode);
    }
  });
  return server;
}
function settledErrors(results) {
  return results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
}
function cleanupSession(sessions, session) {
  if (session.cleanup)
    return session.cleanup;
  session.cleanup = Promise.resolve().then(async () => {
    const sessionId = session.transport.sessionId;
    if (sessionId && sessions.get(sessionId) === session)
      sessions.delete(sessionId);
    const errors = settledErrors(await Promise.allSettled([session.protocol.close(), session.service.shutdown()]));
    if (errors.length > 0)
      throw new AggregateError(errors, "MCP session cleanup failed");
    return;
  });
  return session.cleanup;
}
function recordCleanupError(state, error) {
  state.cleanupErrors.push(error);
}
function ignoreCleanupError() {}
function cleanupOwnedSession(state, session) {
  return cleanupSession(state.sessions, session).finally(() => state.ownedSessions.delete(session));
}
async function sweepIdleSessions(state, now = Date.now()) {
  const expired = [...state.sessions.values()].filter((session) => session.activeRequests === 0 && now - session.lastAccessedAt >= state.idleTimeoutMs);
  const errors = settledErrors(await Promise.allSettled(expired.map((session) => cleanupOwnedSession(state, session))));
  state.cleanupErrors.push(...errors);
}
async function useSession(session, operation) {
  session.activeRequests += 1;
  session.lastAccessedAt = Date.now();
  try {
    await operation();
  } finally {
    session.activeRequests -= 1;
    session.lastAccessedAt = Date.now();
  }
}
function requestHeader(request, name) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
function admitOrigin(request, response, allowedOrigins) {
  const origin = requestHeader(request, "origin");
  if (origin === undefined)
    return true;
  if (!allowedOrigins.has(origin)) {
    writeJsonError(response, 403, "MCP request Origin is not allowed");
    return false;
  }
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-expose-headers", "Mcp-Session-Id, MCP-Protocol-Version");
  response.setHeader("vary", "Origin");
  return true;
}
async function readJsonBody(request) {
  const contentLength = request.headers["content-length"];
  if (contentLength !== undefined) {
    const length = Number(contentLength);
    if (!Number.isSafeInteger(length) || length < 0)
      return { ok: false, message: "Invalid Content-Length" };
    if (length > MAX_MCP_BODY_BYTES)
      return { ok: false, message: "MCP request body exceeds the size limit" };
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > MAX_MCP_BODY_BYTES)
      return { ok: false, message: "MCP request body exceeds the size limit" };
    chunks.push(bytes);
  }
  if (chunks.length === 0)
    return { ok: true, value: undefined };
  let body;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    return { ok: false, message: "MCP request body must be valid UTF-8" };
  }
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false, message: "MCP request body must be valid JSON" };
  }
}
function writeJsonError(response, status, message) {
  if (response.headersSent)
    return;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null
  });
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
}
function reportHttpFailure(response, error) {
  process.stderr.write(`siftlight MCP request failed: ${errorMessage2(error)}
`);
  if (!response.headersSent)
    writeJsonError(response, 500, "MCP request failed");
  else
    response.destroy();
}
function requestPath(request) {
  return new URL2(request.url ?? SIFTLIGHT_MCP_PATH, "http://siftlight.local").pathname;
}
async function handleMcpRequest(request, response, state, createService, cwd) {
  if (!admitOrigin(request, response, state.allowedOrigins))
    return;
  if (state.closing) {
    writeJsonError(response, 503, "MCP server is shutting down");
    return;
  }
  let path;
  try {
    path = requestPath(request);
  } catch {
    writeJsonError(response, 400, "MCP request URL is invalid");
    return;
  }
  if (path !== SIFTLIGHT_MCP_PATH) {
    writeJsonError(response, 404, "MCP endpoint not found");
    return;
  }
  if (request.method === "OPTIONS") {
    response.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
    const requestedHeaders = requestHeader(request, "access-control-request-headers");
    if (requestedHeaders)
      response.setHeader("access-control-allow-headers", requestedHeaders);
    response.statusCode = 204;
    response.end();
    return;
  }
  const sessionId = requestHeader(request, "mcp-session-id");
  if (request.method === "POST") {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody.ok) {
      writeJsonError(response, 400, parsedBody.message);
      return;
    }
    const body = parsedBody.value;
    let session = sessionId ? state.sessions.get(sessionId) : undefined;
    let createdSession;
    let initializationReserved = false;
    if (!session) {
      if (sessionId) {
        writeJsonError(response, 404, "MCP session not found");
        return;
      }
      if (!isInitializeRequest(body)) {
        writeJsonError(response, 400, "MCP initialization is required before tool calls");
        return;
      }
      await sweepIdleSessions(state);
      if (state.closing) {
        writeJsonError(response, 503, "MCP server is shutting down");
        return;
      }
      if (state.sessions.size + state.pendingInitializations >= state.maxSessions) {
        writeJsonError(response, 503, "MCP session limit reached; retry after an idle session expires");
        return;
      }
      state.pendingInitializations += 1;
      initializationReserved = true;
      let pendingSession;
      try {
        const service = createService();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID6(),
          onsessioninitialized: (initializedSessionId) => {
            if (!pendingSession)
              throw new Error("MCP session initialized before registration");
            state.sessions.set(initializedSessionId, pendingSession);
            if (initializationReserved) {
              state.pendingInitializations -= 1;
              initializationReserved = false;
            }
          }
        });
        const protocol = createSiftlightMcpServer(service, cwd, state.outputMode);
        pendingSession = {
          protocol,
          service,
          transport,
          lastAccessedAt: Date.now(),
          activeRequests: 0
        };
        createdSession = pendingSession;
        state.ownedSessions.add(pendingSession);
        transport.onclose = () => {
          const closedSession = pendingSession;
          if (!closedSession)
            return;
          const cleanupAlreadyOwned = closedSession.cleanup !== undefined;
          const cleanup = cleanupOwnedSession(state, closedSession);
          cleanup.catch(cleanupAlreadyOwned ? ignoreCleanupError : (error) => recordCleanupError(state, error));
        };
        await protocol.connect(transport);
        session = pendingSession;
      } catch (error) {
        if (initializationReserved) {
          state.pendingInitializations -= 1;
          initializationReserved = false;
        }
        if (pendingSession) {
          try {
            await cleanupOwnedSession(state, pendingSession);
          } catch (cleanupError) {
            recordCleanupError(state, cleanupError);
          }
        }
        reportHttpFailure(response, error);
        return;
      }
    }
    let requestFailed = false;
    try {
      await useSession(session, () => session.transport.handleRequest(request, response, body));
    } catch (error) {
      requestFailed = true;
      reportHttpFailure(response, error);
    } finally {
      if (createdSession && (requestFailed || createdSession.transport.sessionId === undefined)) {
        try {
          await cleanupOwnedSession(state, createdSession);
        } catch (cleanupError) {
          recordCleanupError(state, cleanupError);
        }
      }
      if (initializationReserved)
        state.pendingInitializations -= 1;
    }
    return;
  }
  if (request.method === "GET" || request.method === "DELETE") {
    if (!sessionId) {
      writeJsonError(response, 400, "MCP session ID is required");
      return;
    }
    const session = state.sessions.get(sessionId);
    if (!session) {
      writeJsonError(response, 404, "MCP session not found");
      return;
    }
    try {
      await useSession(session, () => session.transport.handleRequest(request, response));
    } catch (error) {
      reportHttpFailure(response, error);
    }
    return;
  }
  response.setHeader("allow", "GET, POST, DELETE, OPTIONS");
  writeJsonError(response, 405, "MCP method not allowed");
}
async function startSiftlightMcpServer(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const maxSessions = options.maxSessions ?? DEFAULT_MCP_MAX_SESSIONS;
  const idleTimeoutMs = options.sessionIdleTimeoutMs ?? DEFAULT_MCP_SESSION_IDLE_TIMEOUT_MS;
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1)
    throw new Error("maxSessions must be a positive safe integer");
  if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1)
    throw new Error("sessionIdleTimeoutMs must be a positive safe integer");
  const state = {
    sessions: new Map,
    ownedSessions: new Set,
    maxSessions,
    idleTimeoutMs,
    allowedOrigins: new Set(options.allowedOrigins ?? []),
    outputMode: parseSiftlightMcpOutputMode(options.outputMode),
    cleanupErrors: [],
    pendingInitializations: 0,
    closing: false
  };
  const createService = options.createService ?? createDefaultSiftlightMcpService;
  const httpServer = createServer((request, response) => {
    handleMcpRequest(request, response, state, createService, cwd).catch((error) => {
      reportHttpFailure(response, error);
    });
  });
  const host = options.host ?? DEFAULT_MCP_HOST;
  const port = options.port ?? DEFAULT_MCP_PORT;
  try {
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        httpServer.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        httpServer.off("error", onError);
        resolve();
      };
      httpServer.once("error", onError);
      httpServer.once("listening", onListening);
      httpServer.listen(port, host);
    });
  } catch (error) {
    state.closing = true;
    throw error;
  }
  const sweepIntervalMs = Math.min(Math.max(Math.floor(idleTimeoutMs / 2), 10), 60000);
  const sweepTimer = setInterval(() => {
    sweepIdleSessions(state);
  }, sweepIntervalMs);
  sweepTimer.unref();
  let closePromise;
  const close = () => {
    if (closePromise)
      return closePromise;
    closePromise = (async () => {
      state.closing = true;
      clearInterval(sweepTimer);
      const stopListening = new Promise((resolve, reject) => {
        httpServer.close((error) => error ? reject(error) : resolve());
      });
      const initialCleanup = await Promise.allSettled([
        ...[...state.ownedSessions].map((session) => cleanupOwnedSession(state, session)),
        stopListening
      ]);
      const finalCleanup = await Promise.allSettled([...state.ownedSessions].map((session) => cleanupOwnedSession(state, session)));
      const errors = [
        ...state.cleanupErrors,
        ...settledErrors(initialCleanup),
        ...settledErrors(finalCleanup)
      ];
      if (errors.length > 0)
        throw new AggregateError(errors, "MCP server shutdown failed");
    })();
    return closePromise;
  };
  return {
    httpServer,
    cwd,
    close
  };
}

// src/mcp-semantic-judge.ts
function configuredPath(environment) {
  const value = environment[SIFTLIGHT_CONFIG_ENV]?.trim();
  return value || undefined;
}
async function createMcpSemanticJudgeIntegration(environment = process.env) {
  const path = configuredPath(environment);
  if (!path)
    return createDisabledSemanticJudgeIntegration(DEFAULT_SEMANTIC_JUDGE_CONFIG);
  const config = await readSiftlightConfigFile(path, { missing: "error" });
  return createSemanticJudgeIntegration(config.semanticJudge ?? DEFAULT_SEMANTIC_JUDGE_CONFIG, environment);
}
function mcpSemanticJudgeConfigSource(environment = process.env) {
  return configuredPath(environment) ? "explicit-config" : "not-configured";
}

// src/mcp-cli.ts
var SIFTLIGHT_MCP_USAGE = `Usage: siftlight-mcp [--http | --stdio]

Transports:
  --http   Start the Streamable HTTP server (default)
  --stdio  Serve one local MCP client over stdin/stdout
`;
function parseSiftlightMcpTransport(arguments_) {
  if (arguments_.length === 0 || arguments_.length === 1 && arguments_[0] === "--http") {
    return "http";
  }
  if (arguments_.length === 1 && arguments_[0] === "--stdio")
    return "stdio";
  if (arguments_.length === 1 && (arguments_[0] === "--help" || arguments_[0] === "-h")) {
    return "help";
  }
  throw new Error(`Unknown arguments: ${arguments_.join(" ")}
${SIFTLIGHT_MCP_USAGE}`);
}

// src/mcp-stdio.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
function rejectedReasons(results) {
  return results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
}
async function startSiftlightMcpStdioServer(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const outputMode = parseSiftlightMcpOutputMode(options.outputMode ?? DEFAULT_MCP_OUTPUT_MODE);
  const service = (options.createService ?? createDefaultSiftlightMcpService)();
  const protocol = createSiftlightMcpServer(service, cwd, outputMode);
  const lifecycle = Promise.withResolvers();
  let closePromise;
  let transportFailure;
  const requestClose = () => {
    close();
  };
  const requestFailure = (error) => {
    transportFailure ??= error;
    close();
  };
  const removeLifecycleListeners = () => {
    input.off("end", requestClose);
    input.off("close", requestClose);
    input.off("error", requestFailure);
    output.off("error", requestFailure);
  };
  const close = () => {
    if (closePromise)
      return closePromise;
    input.off("end", requestClose);
    input.off("close", requestClose);
    closePromise = lifecycle.promise;
    const performClose = async () => {
      const cleanupErrors = rejectedReasons(await Promise.allSettled([protocol.close(), service.shutdown()]));
      removeLifecycleListeners();
      const errors = transportFailure ? [transportFailure, ...cleanupErrors] : cleanupErrors;
      if (errors.length > 0) {
        lifecycle.reject(new AggregateError(errors, transportFailure ? "MCP stdio transport failed" : "MCP stdio shutdown failed"));
      } else {
        lifecycle.resolve();
      }
    };
    performClose();
    return closePromise;
  };
  const transport = new StdioServerTransport(input, output);
  try {
    if (!Reflect.set(transport, "onclose", requestClose)) {
      throw new Error("Unable to attach the MCP stdio close handler");
    }
    input.once("end", requestClose);
    input.once("close", requestClose);
    input.once("error", requestFailure);
    output.once("error", requestFailure);
    await protocol.connect(transport);
  } catch (error) {
    let cleanupFailure;
    try {
      await close();
    } catch (closeError) {
      cleanupFailure = closeError instanceof Error ? closeError : new Error("MCP stdio startup cleanup failed", { cause: closeError });
    }
    if (cleanupFailure) {
      throw new AggregateError([error, cleanupFailure], "MCP stdio startup failed", {
        cause: error
      });
    }
    throw error;
  }
  return { cwd, closed: lifecycle.promise, close };
}

// src/mcp-server.ts
function environmentInteger(name, fallback, minimum, maximum) {
  const value = process.env[name];
  if (value === undefined)
    return fallback;
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < minimum || port > maximum) {
    throw new Error(`${name} must be an integer from ${String(minimum)} through ${String(maximum)}`);
  }
  return port;
}
function allowedOrigins() {
  return (process.env.SIFTLIGHT_MCP_ALLOWED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter((origin) => origin.length > 0);
}
async function configuredSemanticJudge() {
  return createMcpSemanticJudgeIntegration();
}
function logSemanticJudgeStatus(integration) {
  const status = integration.config.enabled ? "enabled" : "disabled";
  process.stderr.write(`siftlight MCP semantic judge: ${status}; source=${mcpSemanticJudgeConfigSource()}
`);
}
async function runHttpServer(outputMode, semanticJudge) {
  const running = await startSiftlightMcpServer({
    cwd: process.env.SIFTLIGHT_MCP_CWD ?? process.cwd(),
    host: process.env.SIFTLIGHT_MCP_HOST ?? DEFAULT_MCP_HOST,
    port: environmentInteger("SIFTLIGHT_MCP_PORT", DEFAULT_MCP_PORT, 0, 65535),
    createService: () => createDefaultSiftlightMcpService(semanticJudge),
    maxSessions: environmentInteger("SIFTLIGHT_MCP_MAX_SESSIONS", DEFAULT_MCP_MAX_SESSIONS, 1, Number.MAX_SAFE_INTEGER),
    sessionIdleTimeoutMs: environmentInteger("SIFTLIGHT_MCP_SESSION_IDLE_MS", DEFAULT_MCP_SESSION_IDLE_TIMEOUT_MS, 1, Number.MAX_SAFE_INTEGER),
    allowedOrigins: allowedOrigins(),
    outputMode
  });
  const address = running.httpServer.address();
  if (!address || !(address instanceof Object)) {
    throw new Error("MCP TCP listener is unavailable");
  }
  const displayHost = address.family === "IPv6" ? `[${address.address}]` : address.address;
  process.stderr.write(`siftlight MCP listening on http://${displayHost}:${String(address.port)}${SIFTLIGHT_MCP_PATH}
`);
  process.stderr.write(`siftlight MCP working directory: ${running.cwd}
`);
  let shuttingDown = false;
  const closeAfterSignal = async () => {
    try {
      await running.close();
    } catch (error) {
      process.stderr.write(`siftlight MCP shutdown failed: ${String(error)}
`);
      process.exitCode = 1;
    }
  };
  const shutdown = () => {
    if (shuttingDown)
      return;
    shuttingDown = true;
    closeAfterSignal();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
async function runStdioServer(outputMode, semanticJudge) {
  const running = await startSiftlightMcpStdioServer({
    cwd: process.env.SIFTLIGHT_MCP_CWD ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    outputMode,
    createService: () => createDefaultSiftlightMcpService(semanticJudge)
  });
  process.stderr.write(`siftlight MCP serving one local client over stdio
`);
  process.stderr.write(`siftlight MCP working directory: ${running.cwd}
`);
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown)
      return;
    shuttingDown = true;
    running.close();
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
async function main() {
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
  process.stderr.write(`siftlight MCP failed: ${String(error)}
`);
  process.exitCode = 1;
}
