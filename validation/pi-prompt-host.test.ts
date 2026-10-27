import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { registerPiSearchPolicy } from "../src/pi-search-policy.js";
import { PREFERRED_SEARCH_GUIDANCE, SEARCH_POLICY_GUIDANCE } from "../src/search-policy.js";

const { fauxAssistantMessage, fauxProvider } = await import(
  import.meta.resolve(
    "@earendil-works/pi-ai",
    import.meta.resolve("@earendil-works/pi-coding-agent"),
  )
);

for (const [mode, guidance] of [
  ["hard", SEARCH_POLICY_GUIDANCE],
  ["prefer", PREFERRED_SEARCH_GUIDANCE],
] as const) {
  for (const forceBefore of [false, true]) {
    test(`Pi sends ${mode} guidance with ${forceBefore ? "a preceding forced prompt" : "structured sections"}`, async () => {
      const root = await mkdtemp(join(tmpdir(), "sift-pi-prompt-"));
      const agentDir = join(root, "agent");
      await mkdir(agentDir);
      const modelRuntime = await ModelRuntime.create({
        authPath: join(agentDir, "auth.json"),
        modelsPath: null,
        modelsStorePath: join(agentDir, "models.json"),
        allowModelNetwork: false,
        refreshOnCreate: false,
      });
      const faux = fauxProvider({ provider: "sift-prompt-test", tokensPerSecond: Infinity });
      modelRuntime.registerNativeProvider(faux.provider);
      let sent = "";
      faux.setResponses([
        (context: { messages: unknown }) => {
          sent = JSON.stringify(context.messages);
          return fauxAssistantMessage("done");
        },
      ]);
      const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
      const loader = new DefaultResourceLoader({
        cwd: root,
        agentDir,
        settingsManager,
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        extensionFactories: [
          (pi) => {
            if (forceBefore) pi.on("before_agent_start", () => ({ systemPrompt: "custom prompt" }));
            pi.registerTool({
              name: "sift-light",
              label: "sift-light",
              description: "fixture",
              parameters: Type.Object({}),
              execute: async () => ({ content: [{ type: "text", text: "ok" }], details: {} }),
            });
            registerPiSearchPolicy(pi, mode);
          },
        ],
      });
      await loader.reload();
      const { session } = await createAgentSession({
        cwd: root,
        agentDir,
        modelRuntime,
        model: faux.getModel(),
        settingsManager,
        sessionManager: SessionManager.inMemory(root),
        resourceLoader: loader,
        tools: ["bash", "sift-light"],
      });
      try {
        await session.bindExtensions({});
        await session.prompt("test");
        expect(JSON.stringify(session.agent.state.messages)).toContain('"stopReason":"stop"');
        expect(sent).toContain(guidance);
        if (forceBefore) expect(sent).toContain("custom prompt");
        else expect(sent).toContain("sift_search_policy");
      } finally {
        await session.abort();
        session.dispose();
        await rm(root, { recursive: true, force: true });
      }
    }, 15_000);
  }
}
