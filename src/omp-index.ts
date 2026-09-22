import { homedir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_SEMANTIC_JUDGE_CONFIG,
  normalizeSearchEnforcement,
  readSiftlightConfigFile,
  resolveSiftlightConfigPath,
  SIFTLIGHT_CONFIG_ENV,
  type SiftlightConfig,
} from "./config-reader.js";
import { resolveContextBudget } from "./context-budget.js";
import { createRipgrepRunner } from "./rg.js";
import { createCtagsStructureProvider } from "./structure.js";
import { SiftlightRuntime } from "./runtime.js";
import { SESSION_STATUS_KEY } from "./session-summary.js";
import { SiftlightService, type SiftlightInput } from "./service.js";
import { siftlightPromptGuidelines } from "./prompt-guidelines.js";
import {
  renderSiftlightCall,
  renderSiftlightResult,
  type SiftlightToolResult,
} from "./tui/renderers.js";
import {
  PREFERRED_SEARCH_GUIDANCE,
  SEARCH_POLICY_GUIDANCE,
  SearchPolicy,
} from "./search-policy.js";
import { siftlightSchema } from "./tool-schema.js";
import { modelErrorText } from "./model-error.js";
import { createSemanticJudgeIntegration } from "./semantic-judge.js";

const SIFTLIGHT_LABEL = "siftlight";
const OMP_REPLACED_SEARCH_TOOLS = new Set(["grep", "glob"]);
type OmpToolInput = SiftlightInput & { i?: unknown };

function normalizeOmpToolInput(params: OmpToolInput): SiftlightInput {
  if (!Object.hasOwn(params, "i")) return params;
  const input = { ...params };
  delete input.i;
  return input;
}

interface OmpTheme {
  bold(value: string): string;
  fg(color: string, value: string): string;
}

interface OmpContextUsage {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

interface OmpExtensionContext {
  cwd: string;
  getContextUsage(): OmpContextUsage | undefined;
  ui: {
    setStatus(key: string, text: string | undefined): void;
  };
}

interface OmpToolCallEvent {
  toolName: string;
  input: unknown;
}

interface OmpBeforeAgentStartEvent {
  systemPrompt: string[];
}

interface OmpRenderOptions {
  expanded: boolean;
  isPartial: boolean;
}

interface OmpToolDefinition {
  name: string;
  label: string;
  description: string;
  approval?: "read" | "write" | "exec";
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: unknown;
  execute(
    toolCallId: string,
    params: OmpToolInput,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: OmpExtensionContext,
  ): Promise<SiftlightToolResult>;
  renderCall?(
    params: SiftlightInput,
    options: unknown,
    theme: OmpTheme,
  ): ReturnType<typeof renderSiftlightCall>;
  renderResult?(
    result: SiftlightToolResult,
    options: OmpRenderOptions,
    theme: OmpTheme,
    args?: SiftlightInput,
  ): ReturnType<typeof renderSiftlightResult>;
}

interface OmpExtensionAPI {
  registerTool(tool: OmpToolDefinition): void;
  on(
    event: "session_start",
    handler: (event: unknown, ctx: OmpExtensionContext) => void | Promise<void>,
  ): void;
  on(
    event: "before_agent_start",
    handler: (
      event: OmpBeforeAgentStartEvent,
      ctx: OmpExtensionContext,
    ) => void | { systemPrompt?: string[] } | Promise<void | { systemPrompt?: string[] }>,
  ): void;
  on(
    event: "tool_call",
    handler: (
      event: OmpToolCallEvent,
      ctx: OmpExtensionContext,
    ) => void | { block: true; reason: string } | Promise<void | { block: true; reason: string }>,
  ): void;
  on(
    event: "session_shutdown",
    handler: (event: unknown, ctx: OmpExtensionContext) => void | Promise<void>,
  ): void;
  getActiveTools(): string[];
  setActiveTools(toolNames: string[]): Promise<void>;
}

function expandTilde(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function ompProfile(): string | undefined {
  const value = process.env.OMP_PROFILE ?? process.env.PI_PROFILE;
  if (value === undefined) return undefined;
  const profile = value.trim();
  if (!profile || profile === "default") return undefined;
  // OMP validates this before loading extensions. Keep direct SDK imports safe
  // as well, without allowing an environment value to escape the profile root.
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(profile) || profile.endsWith(".")) return undefined;
  return profile;
}

/** Resolve the same profile-scoped config directory that OMP exposes to extensions. */
function ompAgentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR;
  if (configured) return expandTilde(configured);
  const configDir = process.env.PI_CONFIG_DIR || ".omp";
  const profile = ompProfile();
  return profile
    ? join(homedir(), configDir, "profiles", profile, "agent")
    : join(homedir(), configDir, "agent");
}

function selectSearchTools(pi: OmpExtensionAPI, replaceAlternatives: boolean): string[] {
  const current = pi.getActiveTools();
  const next = replaceAlternatives
    ? current.filter((tool) => !OMP_REPLACED_SEARCH_TOOLS.has(tool))
    : [...current];
  if (!next.includes(SIFTLIGHT_LABEL)) next.push(SIFTLIGHT_LABEL);
  return next;
}

function toolSelectionChanged(current: string[], next: string[]): boolean {
  return current.length !== next.length || next.some((tool, index) => tool !== current[index]);
}

function resultOptions(
  options: OmpRenderOptions,
  result: SiftlightToolResult,
): OmpRenderOptions & { isError: boolean } {
  return { ...options, isError: result.isError === true };
}

export async function registerOmpSiftlightExtension(
  pi: OmpExtensionAPI,
  searchPolicyAssets = new URL("../plugins/siftlight/hooks/", import.meta.url),
  config?: SiftlightConfig,
): Promise<void> {
  const policy = new SearchPolicy(searchPolicyAssets);
  const resolvedConfig =
    config ??
    (await readSiftlightConfigFile(resolveSiftlightConfigPath(ompAgentDir()), {
      missing: process.env[SIFTLIGHT_CONFIG_ENV]?.trim() ? "error" : "defaults",
    }));
  const semanticJudge = createSemanticJudgeIntegration(
    resolvedConfig.semanticJudge ?? DEFAULT_SEMANTIC_JUDGE_CONFIG,
  );
  const runtime = new SiftlightRuntime(
    new SiftlightService({
      runRipgrep: createRipgrepRunner(),
      structure: createCtagsStructureProvider(),
      semanticJudge,
    }),
  );
  const { locale } = resolvedConfig;
  const enforcement = normalizeSearchEnforcement(
    resolvedConfig.enforceSearch,
    "OMP extension config",
  );
  let selection = Promise.resolve();
  const updateSelection = async (): Promise<void> => {
    const current = pi.getActiveTools();
    const next = selectSearchTools(pi, enforcement === "hard");
    if (toolSelectionChanged(current, next)) await pi.setActiveTools(next);
  };
  const selectTools = (): Promise<void> => {
    selection = selection.then(updateSelection);
    return selection;
  };

  pi.registerTool({
    name: SIFTLIGHT_LABEL,
    label: SIFTLIGHT_LABEL,
    description:
      "Search and navigate code with bounded, verifiable evidence. Use pattern for content or mode=files with query for filenames.",
    approval: "read",
    promptSnippet: "Search file contents without flooding context",
    promptGuidelines: siftlightPromptGuidelines(),
    parameters: siftlightSchema,

    renderCall(params, _options, theme) {
      return renderSiftlightCall(params, locale, theme);
    },

    renderResult(result, options, theme) {
      return renderSiftlightResult(result, resultOptions(options, result), locale, theme);
    },

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      try {
        const result = await runtime.search(
          normalizeOmpToolInput(params),
          ctx.cwd,
          signal,
          resolveContextBudget(ctx.getContextUsage()),
        );
        ctx.ui.setStatus(SESSION_STATUS_KEY, runtime.formatSessionStatus(locale));
        return {
          content: [{ type: "text", text: result.text }],
          details: result.details,
        };
      } catch (error) {
        if (signal?.aborted) throw error;
        runtime.recordFailure();
        ctx.ui.setStatus(SESSION_STATUS_KEY, runtime.formatSessionStatus(locale));
        // oxlint-disable-next-line preserve-caught-error -- the model boundary must not expose a recursive cause chain
        throw new Error(modelErrorText(error));
      }
    },
  });

  if (enforcement !== "off") {
    pi.on("session_start", selectTools);
    pi.on("before_agent_start", async (event) => {
      await selectTools();
      const guidance = enforcement === "hard" ? SEARCH_POLICY_GUIDANCE : PREFERRED_SEARCH_GUIDANCE;
      return { systemPrompt: [...event.systemPrompt, guidance] };
    });
    if (enforcement === "hard")
      pi.on("tool_call", (event) => policy.check(event.toolName, event.input));
  }

  pi.on("session_shutdown", async (_event, ctx) => {
    await runtime.shutdown();
    ctx.ui.setStatus(SESSION_STATUS_KEY, undefined);
  });
}

export default async function siftlightOmpExtension(pi: OmpExtensionAPI): Promise<void> {
  await registerOmpSiftlightExtension(pi);
}
