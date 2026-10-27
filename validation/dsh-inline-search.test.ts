import { describe, expect, test } from "bun:test";
import { SearchPolicy } from "../src/search-policy.js";

const assets = new URL("../plugins/sift-light/hooks/", import.meta.url);
const policy = new SearchPolicy(assets, true);
const check = (command: string) => policy.check("bash", { command, workdir: "/tmp" });

describe("DSH inline search detection", () => {
  test("denies recognized inline content and filename searches", async () => {
    const commands = [
      `node -e 'const f=require("fs"); console.log(f.readFileSync("sample.txt","utf8").includes("marker"))'`,
      `env node --eval 'const s = require("fs").readFileSync("sample.txt", "utf8"); console.log(/marker/.test(s))'`,
      `bash -c 'node -e "fs.readdirSync()"'`,
      `python3 -c 'print("marker" in open("sample.txt").read())'`,
      `python3 -c 'import re; print(re.search("marker", open("sample.txt").read()))'`,
      `python3 -c 'import os; print(list(os.walk("src")))'`,
      `python3 -c 'import glob; print(glob.glob("src/*.ts"))'`,
    ];
    const decisions = await Promise.all(commands.map((command) => check(command)));
    for (const [index, decision] of decisions.entries())
      expect(decision, commands[index]).toMatchObject({ block: true });
  });

  test("keeps ordinary inline programs, reads, builds, and script files available", async () => {
    const commands = [
      `node -e 'console.log("marker".includes("mark"))'`,
      `node -e 'console.log(require("fs").readFileSync("sample.txt", "utf8"))'`,
      `python3 -c 'print("marker" in "marker")'`,
      `python3 -c 'print(open("sample.txt").read())'`,
      "node scripts/build.js",
      "python3 scripts/check.py",
      "bun test",
      "printf shell_ok",
    ];
    const decisions = await Promise.all(commands.map((command) => check(command)));
    for (const [index, decision] of decisions.entries())
      expect(decision, commands[index]).toBeUndefined();
  });

  test("does not change the default policy used by other integrations", async () => {
    const defaultPolicy = new SearchPolicy(assets);
    const command = `node -e 'require("fs").readFileSync("sample.txt").includes("marker")'`;
    expect(await defaultPolicy.check("bash", { command })).toBeUndefined();
    expect(await check(command)).toMatchObject({ block: true });
  });
});
