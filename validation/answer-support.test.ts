import { afterEach, expect, test, spyOn } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCtagsStructureProvider } from "../src/structure.js";
import { createRipgrepRunner } from "../src/rg.js";
import { SiftLightService } from "../src/service.js";
import type { AnswerSupportIntegration } from "../src/answer-support.js";
import { SourceAccess } from "../src/source-access.js";
import { compactMcpModelText } from "../src/mcp-model-output.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function supportIntegration(
  runner: NonNullable<AnswerSupportIntegration["runner"]>,
): AnswerSupportIntegration {
  return {
    config: {
      enabled: true,
      provider: "http-json",
      endpoint: "http://127.0.0.1:8787/answer-support",
      model: "fixture-support-model",
      timeoutMs: 1_000,
      maxRetries: 0,
      maxEvidenceItems: 5,
    },
    runner,
  };
}

test("support evaluates only current retained source ranges and preserves inspection", async () => {
  const root = await mkdtemp(join(tmpdir(), "sift-answer-support-"));
  roots.push(root);
  await writeFile(
    join(root, "auth.ts"),
    "export function authorize(user) { if (!user.allowed) throw new Error('denied'); }\n",
  );
  const service = new SiftLightService({
    runRipgrep: createRipgrepRunner(),
    structure: createCtagsStructureProvider(),
    answerSupport: supportIntegration(async (_question, _claim, evidence) => ({
      status: "supported",
      model: "fixture-support-model",
      evidenceIds: evidence.map((item) => item.id),
      elapsedMs: 1,
    })),
  });
  try {
    const outline = await service.search({ mode: "outline", path: "auth.ts" }, root);
    const cursor = outline.details.cursor;
    if (!cursor) throw new Error("outline did not retain a cursor");
    const support = await service.search(
      {
        mode: "support",
        cursor,
        matchIndex: 1,
        supportQuestion: "Will a disallowed user be rejected?",
        supportClaim: "The function rejects a user when user.allowed is false.",
      },
      root,
    );
    expect(support.details.analysis?.answerSupport).toMatchObject({
      status: "complete",
      assessment: "supported",
      evidenceItems: [1],
      model: "fixture-support-model",
    });
    expect(support.details.analysis?.items[0]?.inspect?.matchIndex).toBe(1);
    expect(support.text).toContain("Answer support: complete (supported)");
    const modelSupport = await service.search(
      {
        mode: "support",
        cursor,
        matchIndex: 1,
        supportQuestion: "Will a disallowed user be rejected?",
        supportClaim: "The function rejects a user when user.allowed is false.",
      },
      root,
      undefined,
      { modelOutput: true },
    );
    expect(compactMcpModelText(modelSupport)).toContain("Answer support:");

    await writeFile(join(root, "auth.ts"), "export function authorize(user) { return true; }\n");
    const stale = await service.search(
      {
        mode: "support",
        cursor,
        matchIndex: 1,
        supportQuestion: "Will a disallowed user be rejected?",
        supportClaim: "The function rejects a user when user.allowed is false.",
      },
      root,
    );
    expect(stale.details.analysis?.answerSupport).toMatchObject({
      assessment: "unknown",
      status: "complete",
    });
    expect(stale.text).toContain("requires current source bytes");
  } finally {
    await service.shutdown();
  }
});

test("support remains explicit when its provider is disabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "sift-answer-support-disabled-"));
  roots.push(root);
  await writeFile(join(root, "auth.ts"), "export function authorize() { return true; }\n");
  const service = new SiftLightService({
    runRipgrep: createRipgrepRunner(),
    structure: createCtagsStructureProvider(),
  });
  try {
    const outline = await service.search({ mode: "outline", path: "auth.ts" }, root);
    const cursor = outline.details.cursor;
    if (!cursor) throw new Error("Outline omitted its saved source cursor");
    const support = await service.search(
      {
        mode: "support",
        cursor,
        matchIndex: 1,
        supportQuestion: "Does this function reject callers?",
        supportClaim: "The function rejects callers.",
      },
      root,
    );
    expect(support.details.analysis?.answerSupport).toMatchObject({
      status: "failed",
      assessment: "unknown",
    });
    expect(support.text).toContain("provider is disabled");
  } finally {
    await service.shutdown();
  }
});

test("support reuses adjacent source qualifiers without losing the exact range", async () => {
  const root = await mkdtemp(join(tmpdir(), "sift-answer-support-context-"));
  roots.push(root);
  await writeFile(
    join(root, "refund.ts"),
    'export const refundWindow = "refunds are allowed within 30 days";\n' +
      'export const giftCardException = "except gift cards";\n',
  );
  const evidenceSeen: Array<{
    excerpt: string;
    selectedExcerpt?: string;
    contextBefore?: string;
    contextAfter?: string;
  }> = [];
  const service = new SiftLightService({
    runRipgrep: createRipgrepRunner(),
    structure: createCtagsStructureProvider(),
    answerSupport: supportIntegration(async (_question, _claim, evidence) => {
      evidenceSeen.push(...evidence);
      return {
        status: "insufficient",
        model: "fixture-support-model",
        evidenceIds: evidence.map((item) => item.id),
        elapsedMs: 1,
      };
    }),
  });
  try {
    const outline = await service.search({ mode: "outline", path: "refund.ts" }, root);
    const cursor = outline.details.cursor;
    if (!cursor) throw new Error("outline did not retain a cursor");
    expect(outline.details.analysis?.evidenceScope).toMatchObject({
      status: "range-only",
      exactItems: 2,
    });

    const support = await service.search(
      {
        mode: "support",
        cursor,
        matchIndex: 1,
        supportQuestion: "Are all purchases refundable within 30 days?",
        supportClaim: "All purchases are refundable within 30 days.",
      },
      root,
    );
    expect(evidenceSeen).toHaveLength(1);
    expect(evidenceSeen[0]?.selectedExcerpt).toContain("refunds are allowed within 30 days");
    expect(evidenceSeen[0]?.contextAfter).toContain("except gift cards");
    expect(evidenceSeen[0]?.excerpt).toContain("except gift cards");
    expect(support.details.analysis?.answerSupport).toMatchObject({
      status: "complete",
      assessment: "insufficient",
      contextLines: 2,
      contextAfterLines: 1,
    });
    expect(support.details.analysis?.evidenceScope).toMatchObject({
      status: "range-with-context",
      exactItems: 1,
      contextLines: 2,
    });
    expect(support.details.analysis?.items[0]?.details).toMatchObject({
      evidenceScope: "range-with-context",
      contextAfterLines: 1,
    });

    evidenceSeen.length = 0;
    const exactOnly = await service.search(
      {
        mode: "support",
        cursor,
        matchIndex: 1,
        supportContextLines: 0,
        supportQuestion: "Are all purchases refundable within 30 days?",
        supportClaim: "All purchases are refundable within 30 days.",
      },
      root,
    );
    expect(evidenceSeen).toHaveLength(1);
    expect(evidenceSeen[0]?.contextAfter).toBeUndefined();
    expect(exactOnly.details.analysis?.evidenceScope).toMatchObject({
      status: "range-only",
      exactItems: 1,
      contextLines: 0,
    });
  } finally {
    await service.shutdown();
  }
});

test("support shares current file reads across selections and rechecks each new request", async () => {
  const root = await mkdtemp(join(tmpdir(), "sift-support-reads-"));
  roots.push(root);
  const path = join(root, "policy.ts");
  await writeFile(
    path,
    'export const allowed = "refund allowed";\nexport const exception = "except gifts";\n',
  );
  let providerCalls = 0;
  const service = new SiftLightService({
    runRipgrep: createRipgrepRunner(),
    structure: createCtagsStructureProvider(),
    answerSupport: supportIntegration(async (_question, _claim, evidence) => {
      providerCalls += 1;
      expect(evidence).toHaveLength(2);
      return { status: "insufficient", model: "fixture", elapsedMs: 1 };
    }),
  });
  const refresh = spyOn(SourceAccess.prototype, "refresh");
  try {
    const outline = await service.search({ mode: "outline", path: "policy.ts" }, root);
    refresh.mockClear();
    const input = {
      mode: "support" as const,
      cursor: outline.details.cursor!,
      matchIndices: [1, 2],
      supportQuestion: "Are all purchases refundable?",
      supportClaim: "All purchases are refundable.",
    };
    const result = await service.search(input, root);
    expect(result.details.analysis?.answerSupport?.assessment).toBe("insufficient");
    expect(refresh).toHaveBeenCalledTimes(2);
    // One current-source validation and one shared context read, independent of selection count.
    const item = result.details.analysis?.items[0];
    const inspected = await service.search(item!.inspect!, root);
    expect(inspected.details.source?.complete).toBe(true);
    await writeFile(
      path,
      'export const allowed = "no refunds";\nexport const exception = "no gifts";\n',
    );
    const stale = await service.search(input, root);
    expect(stale.details.analysis?.answerSupport?.assessment).toBe("unknown");
    expect(providerCalls).toBe(1);
  } finally {
    refresh.mockRestore();
    await service.shutdown();
  }
});

test("support does not invoke its provider on oversized evidence or hide cancellation", async () => {
  const root = await mkdtemp(join(tmpdir(), "sift-support-bounds-"));
  roots.push(root);
  await writeFile(join(root, "policy.ts"), `export const policy = "${"x".repeat(4100)}";\n`);
  let calls = 0;
  const service = new SiftLightService({
    runRipgrep: createRipgrepRunner(),
    structure: createCtagsStructureProvider(),
    answerSupport: supportIntegration(async () => {
      calls += 1;
      throw new DOMException("Cancelled", "AbortError");
    }),
  });
  try {
    let outline = await service.search({ mode: "outline", path: "policy.ts" }, root);
    const base = {
      mode: "support" as const,
      matchIndex: 1,
      supportQuestion: "Refund?",
      supportClaim: "Allowed",
    };
    const oversized = await service.search({ ...base, cursor: outline.details.cursor! }, root);
    expect(oversized.details.analysis?.answerSupport?.assessment).toBe("unknown");
    expect(oversized.text).toContain("4000-character");
    expect(calls).toBe(0);
    await writeFile(join(root, "policy.ts"), 'export const policy = "allowed";\n');
    outline = await service.search({ mode: "outline", path: "policy.ts" }, root);
    await expectFailure(
      service.search({ ...base, cursor: outline.details.cursor! }, root),
      "Cancelled",
    );
    expect(calls).toBe(1);
    await expectFailure(
      service.search({ ...base, cursor: outline.details.cursor!, supportContextLines: 21 }, root),
      "supportContextLines",
    );
  } finally {
    await service.shutdown();
  }
});

async function expectFailure(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain(message);
    return;
  }
  throw new Error(`Expected failure containing ${message}`);
}
