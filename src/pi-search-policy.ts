import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SearchEnforcementMode } from "./config-reader.js";
import {
  PI_REPLACED_SEARCH_TOOLS,
  PREFERRED_SEARCH_GUIDANCE,
  SEARCH_POLICY_GUIDANCE,
  SearchPolicy,
} from "./search-policy.js";

export function registerPiSearchPolicy(
  pi: ExtensionAPI,
  mode: Exclude<SearchEnforcementMode, "off">,
): void {
  const policy = new SearchPolicy(new URL("../plugins/sift-light/hooks/", import.meta.url));
  const selectTools = () => {
    const current = pi.getActiveTools();
    const next =
      mode === "hard"
        ? current.filter((tool) => !PI_REPLACED_SEARCH_TOOLS.has(tool))
        : [...current];
    if (!next.includes("sift-light")) next.push("sift-light");
    if (next.length !== current.length || next.some((tool, index) => tool !== current[index]))
      pi.setActiveTools(next);
  };
  pi.on("session_start", selectTools);
  pi.on("before_agent_start", (event) => {
    selectTools();
    const guidance = mode === "hard" ? SEARCH_POLICY_GUIDANCE : PREFERRED_SEARCH_GUIDANCE;
    // Returning systemPrompt makes Pi collapse tool history into the request prefix.
    // A section preserves the placement of later tool additions in the transcript.
    event.systemPromptOptions.sections.sift_search_policy = guidance;
  });
  if (mode === "hard")
    pi.on("tool_call", async (event, ctx) => policy.check(event.toolName, event.input, ctx.signal));
}
