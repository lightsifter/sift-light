import { describe, expect, test } from "bun:test";
import { isDirectPtcToolCall } from "../src/dsh-ptc-policy.js";

describe("DSH PTC policy", () => {
  test("accepts direct calls with JSON arguments and rejects programs", () => {
    for (const code of [
      'return await tools.sift_light({"path":".","pattern":"needle"})',
      'console.log(await tools.bash({"command":"pwd"}));',
      'console.log(JSON.stringify(await tools.sift_light({"pattern":"}); evil()"})))',
      "await tools.sift_light({})",
      `return await tools.sift_light({path: '.', pattern: 'marker'})`,
      `console.log(await Promise.all([tools.sift_light({path: '.', pattern: 'a}b'}), tools.bash({command: 'pwd'})]))`,
      String.raw`return await tools.sift_light({pattern: 'don\'t say "hello"'})`,
      String.raw`return await tools.sift_light({pattern: '\u0061'})`,
      'return await Promise.all([tools.sift_light({path:".", pattern:"x"}),])',
      'return await Promise.all([tools.sift_light({path: ".", pattern: "x", literal: true}), tools.bash({command: "pwd"})])',
      'return await tools.sift_light({pattern: "{unquoted: text}", nested: {key: 1}})',
      "return await tools.visualize({fragment: `<div>\n<script>const x = {a: 1};</script>\n</div>`})",
      'return await Promise.all([tools.visualize({fragment: `<div>{}</div>`}), tools.read({path: "."})])',
      "return await tools.visualize({fragment: `escaped \\` and \\${literal}`})",
      'return await Promise.all([tools.sift_light({"pattern":"x"}), tools.bash({"command":"pwd"})])',
      'return await Promise.all([tools.sift_light({"pattern":"} , \\""})])',
    ])
      expect(isDirectPtcToolCall({ code }), code).toBe(true);
    for (const code of [
      'await tools.sift_light({}); await tools.bash({"command":"pwd"})',
      'return await tools.sift_light({"pattern": process.cwd()})',
      "console.log(await tools.constructor({}))",
      'return await tools.sift_light({"x":1}); require("fs").readdirSync(".")',
      'return await tools.sift_light({"x":1,})',
      "return await tools.sift_light([])",
      `return await tools.sift_light({pattern: 'x' + process.cwd()})`,
      `console.log(await Promise.all([tools.sift_light({pattern: 'x'}), process.exit()]))`,
      String.raw`return await tools.sift_light({pattern: '\x41'})`,
      "return await tools.visualize({fragment: `${process.exit()}`})",
      "return await tools.visualize({fragment: `\\\\${process.exit()}`})",
      "return await tools.visualize({fragment: `unclosed})",
      'return await Promise.all([tools.bash({"command": process.cwd()})])',
      "return await Promise.all([tools.sift_light({}), process.exit()])",
      "return await Promise.all([tools.constructor({})])",
      `return await Promise.all([${Array(11).fill("tools.sift_light({})").join(",")}])`,
    ])
      expect(isDirectPtcToolCall({ code }), code).toBe(false);
    expect(isDirectPtcToolCall(null)).toBe(false);
  });
});
