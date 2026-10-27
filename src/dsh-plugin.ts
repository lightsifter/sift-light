import { resolve } from "node:path";
import { createDefaultSiftLightMcpService, parseSiftLightInput } from "./mcp.js";
import { compactMcpModelText } from "./mcp-model-output.js";
import { createMcpSearchFeatures } from "./mcp-semantic-judge.js";
import { SearchPolicy } from "./search-policy.js";
import { SIFT_LIGHT_MODEL_DESCRIPTION, siftLightSchema } from "./tool-schema.js";
import { dashboard } from "./tui/dashboard.js";

interface DshSearchOutput {
  text: string;
  presentation: string;
}

interface Execution {
  readonly name: string;
  readonly arguments: unknown;
  readonly signal: AbortSignal;
  readonly agent?: object;
  readonly token: symbol;
}

type Decision = { kind: "allow" | "cancel" | "ask" } | { kind: "deny"; reason: string };

interface DshContext {
  workingDirectory: { ensure(agent: object, signal: AbortSignal): Promise<string> };
  tools: {
    register(definition: {
      name: string;
      description: string;
      parameters: unknown;
      output: {
        schema: object;
        render(args: unknown, value: DshSearchOutput): { type: "text"; text: string }[];
        presentationMeta(args: unknown, value: DshSearchOutput): unknown;
      };
      execute(args: unknown, exec: Execution): Promise<DshSearchOutput>;
    }): void;
    guard(guard: (exec: Execution) => string | undefined): void;
  };
  on(
    event: "tools/pre-execute",
    listener: (exec: Execution, next: () => Promise<Decision>) => Promise<Decision>,
  ): void;
  on(event: "tools/result", listener: (exec: Execution) => void): void;
  effect(effect: () => () => Promise<void>): void;
}

export const name = "sift-light";
export const inject = ["tools", "workingDirectory"];

const shellNames = new Set(["bash", "pwsh", "powershell"]);
const terminalNames = new Set(["terminal_send"]);

function isInputRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function apply(ctx: DshContext): Promise<void> {
  const features = await createMcpSearchFeatures();
  const service = createDefaultSiftLightMcpService(
    features.semanticJudge,
    features.vectorSearchEnabled,
    features.dataSources,
    features.nativeText,
    features.nativeMedia,
    features.media,
    features.answerSupport,
  );
  ctx.effect(() => () => service.shutdown());
  const policy = new SearchPolicy(new URL("./hooks/", import.meta.url), true);
  const approved = new Set<symbol>();

  ctx.tools.register({
    name: "sift_light",
    description: SIFT_LIGHT_MODEL_DESCRIPTION,
    // TypeBox schemas carry symbols that DSH rejects in model-facing JSON schemas.
    parameters: JSON.parse(JSON.stringify(siftLightSchema)) as unknown,
    output: {
      schema: {
        type: "object",
        properties: { text: { type: "string" }, presentation: { type: "string" } },
        required: ["text", "presentation"],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: "text", text: value.text }],
      presentationMeta: (_args, value) => JSON.parse(value.presentation) as unknown,
    },
    async execute(args, exec) {
      const cwd = exec.agent
        ? await ctx.workingDirectory.ensure(exec.agent, exec.signal)
        : process.cwd();
      const input = parseSiftLightInput(args);
      const result = await service.search(input, cwd, exec.signal, {
        modelOutput: true,
        modelSource: input.cursor !== undefined || input.limit !== undefined,
      });
      return {
        text: compactMcpModelText(result),
        presentation: JSON.stringify(dashboard(result.text, result.details) ?? null),
      };
    },
  });

  ctx.on("tools/pre-execute", async (exec, next) => {
    const shell = shellNames.has(exec.name);
    let args = exec.arguments;
    if (shell && exec.agent && isInputRecord(args)) {
      const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal);
      const fields = args;
      const workdir = typeof fields.workdir === "string" ? resolve(cwd, fields.workdir) : cwd;
      args = { ...fields, workdir };
    }
    const decision = await policy.check(
      exec.name === "pwsh" ? "powershell" : exec.name,
      args,
      exec.signal,
    );
    if (decision) return { kind: "deny", reason: decision.reason };
    const downstream = await next();
    if (shell && downstream.kind !== "deny" && downstream.kind !== "cancel")
      approved.add(exec.token);
    return downstream;
  });
  ctx.tools.guard((exec) => {
    if (["run_code", "workflow", "ralph"].includes(exec.name)) {
      return "Programmatic execution is disabled by sift-light search policy; use native tools.";
    }
    if (terminalNames.has(exec.name))
      return "Persistent terminal input is disabled by sift-light search policy.";
    if (exec.name === "grep" || exec.name === "glob") {
      return `sift-light search policy blocks ${exec.name}; use sift_light instead.`;
    }
    if (shellNames.has(exec.name) && !approved.delete(exec.token)) {
      return "sift-light could not check this shell call; the command was not run.";
    }
    return undefined;
  });
  ctx.on("tools/result", (exec) => {
    approved.delete(exec.token);
  });
}
