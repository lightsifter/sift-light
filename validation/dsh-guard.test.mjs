import { expect, test } from "bun:test";
import { apply } from "../plugins/sift-light/dsh-entry.mjs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const call = (name, args) => ({
  name,
  arguments: args,
  token: Symbol(),
  signal: new AbortController().signal,
});

test("DSH guard permits ordinary inline file operations while blocking searches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sift-125-"));
  let preExecute;
  let cleanup;
  try {
    await writeFile(join(directory, "items.json"), '[{"name":"item","kind":"y"}]');
    await apply({
      tools: { register() {}, guard() {} },
      workingDirectory: { ensure: async () => directory },
      on(event, listener) {
        if (event === "tools/pre-execute") preExecute = listener;
      },
      effect(fn) {
        cleanup = fn();
      },
    });
    const run = async (command) => {
      const decision = await preExecute(
        call("bash", { command, workdir: directory }),
        async () => ({ kind: "allow" }),
      );
      return decision.kind === "allow"
        ? execFileSync("bash", ["-c", command], { cwd: directory, encoding: "utf8" })
        : decision.kind;
    };
    expect(
      await run(
        `python3 -c "open('probe.txt','w').write(chr(10).join('line %d' % i for i in range(3)))"`,
      ),
    ).toBe("");
    expect(await readFile(join(directory, "probe.txt"), "utf8")).toBe("line 0\nline 1\nline 2");
    expect(
      await run(
        `python3 -c "import json; d=json.load(open('items.json')); print([r['name'] for r in d if r['kind']=='y'])"`,
      ),
    ).toContain("item");
    expect(await run(`python3 -c 'print("marker" in open("probe.txt").read())'`)).toBe("deny");
    expect(await run("printf before; find . -type f")).toBe("deny");
  } finally {
    await cleanup?.();
    await rm(directory, { recursive: true, force: true });
  }
});

test("nested calls still pass through the DSH search guard", async () => {
  let guard;
  let preExecute;
  let cleanup;
  const ctx = {
    tools: {
      register() {},
      guard(fn) {
        guard = fn;
      },
    },
    workingDirectory: { ensure: async () => "/tmp" },
    on(event, listener) {
      if (event === "tools/pre-execute") preExecute = listener;
    },
    effect(fn) {
      cleanup = fn();
    },
  };
  await apply(ctx);
  try {
    expect(guard).toBeDefined();
    expect(preExecute).toBeDefined();
    expect(
      guard(call("run_code", { code: 'return await tools.bash({"command":"pwd"})' })),
    ).toBeUndefined();
    expect(
      guard(
        call("run_code", {
          code: "console.log(await Promise.all([tools.sift_light({pattern: 'needle'}), tools.bash({command: 'pwd'})]))",
        }),
      ),
    ).toBeUndefined();
    expect(
      guard(call("run_code", { code: "return await tools.bash({command: process.cwd()})" })),
    ).toContain("must contain a direct call");
    expect(guard(call("grep", {}))).toContain("blocks grep");
    const shell = call("bash", { command: "pwd", workdir: "/tmp" });
    expect((await preExecute(shell, async () => ({ kind: "allow" }))).kind).toBe("allow");
    expect(guard(shell)).toBeUndefined();
    const blocked = call("bash", { command: "rg needle .", workdir: "/tmp" });
    expect((await preExecute(blocked, async () => ({ kind: "allow" }))).kind).toBe("deny");
    expect(guard(blocked)).toContain("could not check");
  } finally {
    await cleanup?.();
  }
});
