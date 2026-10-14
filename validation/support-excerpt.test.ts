import { expect, test } from "bun:test";
import { SourceDocument } from "../src/source-document.js";
import { supportExcerpt } from "../src/support-excerpt.js";
import { createAnswerSupportIntegration } from "../src/answer-support.js";

function document(text: string): SourceDocument {
  return new SourceDocument(
    { path: "policy.txt", origin: { kind: "git", commit: "fixture", blob: "fixture" } },
    Buffer.from(text),
  );
}

for (const ending of ["\n", "\r\n", ""]) {
  test(`context preserves Unicode and line boundaries with ${JSON.stringify(ending)}`, () => {
    const text = `之前\n退款😀，但礼品卡除外${ending}`;
    const doc = document(text);
    const start = Buffer.byteLength("之前\n");
    const end = start + Buffer.byteLength("退款😀");
    const result = supportExcerpt(doc, { start, end }, 2);
    expect(result.selectedExcerpt).toBe("退款😀");
    expect(result.contextBefore).toBe("之前\n");
    expect(result.contextAfter).toBe(`，但礼品卡除外${ending}`);
    expect(result.contextBeforeLines).toBe(1);
    expect(result.contextAfterLines).toBe(0);
    expect(result.hasContext).toBe(true);
    expect(result.excerpt).toBe(text);
    expect(supportExcerpt(doc, { start, end }, 0)).toMatchObject({
      excerpt: "退款😀",
      selectedExcerpt: "退款😀",
      hasContext: false,
    });
  });
}

test("same-line qualifiers count as context even without adjacent lines", () => {
  const result = supportExcerpt(
    document("Refund allowed; except gifts."),
    { start: 0, end: 14 },
    2,
  );
  expect(result.contextAfter).toBe("; except gifts.");
  expect(result.hasContext).toBe(true);
  expect(result.contextAfterLines).toBe(0);
});

test("trailing CR and empty ranges preserve valid document bounds", () => {
  const doc = document("first\nlast\r");
  expect(supportExcerpt(doc, { start: 6, end: 10 }, 2).excerpt).toBe(doc.text);
  const empty = document("");
  expect(supportExcerpt(empty, { start: 0, end: 0 }, 2).excerpt).toBe("");
  const terminal = document("last\n");
  expect(supportExcerpt(terminal, { start: 5, end: 5 }, 2).excerpt).toBe("last\n");
});

for (const provider of ["http-json", "jev"] as const) {
  test(`${provider} transports complete context and rejects excessive evidence before networking`, async () => {
    let body: { state?: { evidence?: unknown }; evidence?: unknown } | undefined;
    let calls = 0;
    const integration = createAnswerSupportIntegration(
      {
        enabled: true,
        provider,
        endpoint: "http://127.0.0.1:8787/support",
        model: "test",
        maxEvidenceItems: 5,
        timeoutMs: 1000,
        maxRetries: 0,
      },
      {},
      async (_url, init) => {
        calls += 1;
        if (typeof init?.body !== "string") throw new Error("Expected string request body");
        body = JSON.parse(init.body);
        return Response.json({ status: "insufficient", model: "test", evidenceIds: ["one"] });
      },
    );
    const evidence = [
      {
        id: "one",
        excerpt: "allow except gifts",
        selectedExcerpt: "allow",
        contextAfter: " except gifts",
      },
    ];
    await integration.runner!("Refund?", "All purchases", evidence);
    const received = provider === "jev" ? body?.state?.evidence : body?.evidence;
    expect(received).toEqual(evidence);
    await expectFailure(
      integration.runner!("Refund?", "All purchases", [{ id: "one", excerpt: "a".repeat(4001) }]),
      "4000-character",
    );
    await expectFailure(
      integration.runner!("Refund?", "All purchases", [
        { id: "one", excerpt: "a".repeat(2500), selectedExcerpt: "b".repeat(1600) },
      ]),
      "4000-character",
    );
    expect(calls).toBe(1);
  });
}

async function expectFailure(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain(message);
    return;
  }
  throw new Error(`Expected failure containing ${message}`);
}
