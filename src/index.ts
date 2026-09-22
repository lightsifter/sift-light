import { SIFTLIGHT_DESCRIPTION, siftlightSchema } from "./tool-schema.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  normalizeSearchEnforcement,
  readSiftlightConfig,
  DEFAULT_SEMANTIC_JUDGE_CONFIG,
  type SiftlightConfig,
} from "./config.js";
import { resolveContextBudget } from "./context-budget.js";
import { createRipgrepRunner } from "./rg.js";
import { createCtagsStructureProvider } from "./structure.js";
import { SiftlightRuntime } from "./runtime.js";
import { SESSION_STATUS_KEY } from "./session-summary.js";
import { SiftlightService } from "./service.js";
import { siftlightPromptGuidelines } from "./prompt-guidelines.js";
import type { SiftlightDetails } from "./types.js";
import { renderSiftlightCall, renderSiftlightResult } from "./tui/renderers.js";
import { registerPiSearchPolicy } from "./pi-search-policy.js";
import { modelErrorText } from "./model-error.js";
import { createSemanticJudgeIntegration } from "./semantic-judge.js";

const SIFTLIGHT_LABEL = "siftlight";

export { siftlightPromptGuidelines };

export async function registerSiftlightExtension(
  pi: ExtensionAPI,
  config: SiftlightConfig,
): Promise<void> {
  const semanticJudge = createSemanticJudgeIntegration(
    config.semanticJudge ?? DEFAULT_SEMANTIC_JUDGE_CONFIG,
  );
  const runtime = new SiftlightRuntime(
    new SiftlightService({
      runRipgrep: createRipgrepRunner(),
      structure: createCtagsStructureProvider(),
      semanticJudge,
    }),
  );
  const { locale } = config;

  pi.registerTool<typeof siftlightSchema, SiftlightDetails>({
    name: "siftlight",
    label: SIFTLIGHT_LABEL,
    description: SIFTLIGHT_DESCRIPTION,
    promptSnippet: "Search file contents without flooding context",
    promptGuidelines: siftlightPromptGuidelines(),
    parameters: siftlightSchema,

    renderCall(params, theme) {
      return renderSiftlightCall(params, locale, theme);
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      return renderSiftlightResult(
        result,
        { expanded, isPartial, isError: context.isError },
        locale,
        theme,
      );
    },

    async execute(...[_toolCallId, params, signal, _onUpdate, ctx]) {
      try {
        const result = await runtime.search(
          params,
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

  const enforcement = normalizeSearchEnforcement(config.enforceSearch, "extension config");
  if (enforcement !== "off") registerPiSearchPolicy(pi, enforcement);

  pi.on("session_shutdown", async (_event, ctx) => {
    await runtime.shutdown();
    ctx.ui.setStatus(SESSION_STATUS_KEY, undefined);
  });
}

export default async function siftlightExtension(pi: ExtensionAPI) {
  await registerSiftlightExtension(pi, await readSiftlightConfig());
}
