import { SIFT_LIGHT_DESCRIPTION, siftLightSchema } from "./tool-schema.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { normalizeSearchEnforcement, readSiftLightConfig, type SiftLightConfig } from "./config.js";
import { resolveContextBudget } from "./context-budget.js";
import { createRipgrepRunner } from "./rg.js";
import { createCtagsStructureProvider } from "./structure.js";
import { SiftLightRuntime } from "./runtime.js";
import { SESSION_STATUS_KEY } from "./session-summary.js";
import { SiftLightService } from "./service.js";
import { siftLightPromptGuidelines } from "./prompt-guidelines.js";
import type { SiftLightDetails } from "./types.js";
import { renderSiftLightCall, renderSiftLightResult } from "./tui/renderers.js";
import { registerPiSearchPolicy } from "./pi-search-policy.js";
import { modelErrorText } from "./model-error.js";
import { createConfiguredSemanticJudgeIntegration } from "./semantic-judge.js";

const SIFT_LIGHT_LABEL = "sift-light";

export { siftLightPromptGuidelines };

export async function registerSiftLightExtension(
  pi: ExtensionAPI,
  config: SiftLightConfig,
): Promise<void> {
  const semanticJudge = createConfiguredSemanticJudgeIntegration(config);
  const runtime = new SiftLightRuntime(
    new SiftLightService({
      runRipgrep: createRipgrepRunner(),
      structure: createCtagsStructureProvider(),
      vectorSearchEnabled: config.vectorSearchEnabled === true,
      semanticJudge,
    }),
  );
  const { locale } = config;

  pi.registerTool<typeof siftLightSchema, SiftLightDetails>({
    name: "sift-light",
    label: SIFT_LIGHT_LABEL,
    description: SIFT_LIGHT_DESCRIPTION,
    promptSnippet: "Search file contents without flooding context",
    promptGuidelines: siftLightPromptGuidelines(),
    parameters: siftLightSchema,

    renderCall(params, theme) {
      return renderSiftLightCall(params, locale, theme);
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      return renderSiftLightResult(
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

export default async function siftLightExtension(pi: ExtensionAPI) {
  await registerSiftLightExtension(pi, await readSiftLightConfig());
}
