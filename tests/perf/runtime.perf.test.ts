import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Performance guardrails for hot paths of the AI runtime. These are NOT
 * micro-benchmarks — they're regression fences with generous ceilings that
 * catch accidental O(n²) regressions while staying stable on shared CI.
 */

import { chunkText } from "../../packages/ai-runtime/knowledge/chunker";
import { evaluateExpression } from "../../packages/ai-runtime/tools/builtin/expression";
import { renderPrompt } from "../../packages/ai-runtime/prompts/renderer";
import { WorkflowExecutor } from "../../packages/ai-runtime/workflows/executor";
import { ToolRegistry } from "../../packages/ai-runtime/tools/tool";
import { ToolExecutor } from "../../packages/ai-runtime/tools/executor";
import type { ModelRouter } from "../../packages/ai-runtime/model-router/router";
import type { MemoryService } from "../../packages/ai-runtime/memory/service";

function elapsed(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

test("chunker processes 100KB of prose within 500ms", () => {
  const paragraph = "The quick brown fox jumps over the lazy dog. ".repeat(20).trim();
  const text = Array.from({ length: 110 }, () => paragraph).join("\n\n"); // ~100KB
  assert.ok(text.length > 95_000);

  const start = process.hrtime.bigint();
  const chunks = chunkText(text);
  const ms = elapsed(start);

  assert.ok(chunks.length > 10);
  assert.ok(ms < 500, `chunker took ${ms.toFixed(1)}ms`);
});

test("expression evaluator sustains 10k ops under 200ms", () => {
  const start = process.hrtime.bigint();
  let acc = 0;
  for (let i = 0; i < 10_000; i++) acc += evaluateExpression("(12*8)+4^2-16/4");
  const ms = elapsed(start);
  assert.equal(acc / 10_000, 108);
  assert.ok(ms < 200, `10k evals took ${ms.toFixed(1)}ms`);
});

test("prompt renderer sustains 10k renders under 250ms", () => {
  const declared = [
    { name: "topic", required: true },
    { name: "audience", default: "operators", required: false },
  ];
  const start = process.hrtime.bigint();
  for (let i = 0; i < 10_000; i++) {
    renderPrompt("Brief {{audience}} on {{topic}}. Twice: {{topic}}.", declared, {
      topic: "refunds",
    });
  }
  const ms = elapsed(start);
  assert.ok(ms < 250, `10k renders took ${ms.toFixed(1)}ms`);
});

test("a 30-node sequential workflow completes under 1s (no model calls)", async () => {
  const router = {} as ModelRouter; // never touched — prompt-only graph
  const memory = {
    async recall() {
      return [];
    },
  } as unknown as MemoryService;
  const tools = new ToolRegistry();
  const executor = new WorkflowExecutor({
    router,
    tools,
    executor: new ToolExecutor(tools),
    memory,
  });

  const nodeCount = 30;
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: i === nodeCount - 1 ? "out" : `n${i}`,
    type: (i === nodeCount - 1 ? "output" : "prompt") as "output" | "prompt",
    config:
      i === nodeCount - 1
        ? { template: "final:{{v28}}" }
        : { template: `v${i}`, saveAs: `v${i}` },
  }));
  const edges = Array.from({ length: nodeCount - 1 }, (_, i) => ({
    from: i === 0 ? "n0" : `n${i}`,
    to: i + 1 === nodeCount - 1 ? "out" : `n${i + 1}`,
  }));

  const start = process.hrtime.bigint();
  const result = await executor.run(
    { workspaceId: "w-perf", userId: null, toolPermissions: {} },
    { nodes: nodes as never, edges },
    {}
  );
  const ms = elapsed(start);

  assert.equal(result.status, "succeeded");
  assert.equal(result.output, "final:v28");
  assert.equal(result.trace.length, nodeCount);
  assert.ok(ms < 1000, `30-node workflow took ${ms.toFixed(1)}ms`);
});

test("variable-heavy template rendering in workflows stays linear", async () => {
  const router = {} as ModelRouter;
  const memory = { async recall() { return []; } } as unknown as MemoryService;
  const tools = new ToolRegistry();
  const executor = new WorkflowExecutor({ router, tools, executor: new ToolExecutor(tools), memory });

  const longTemplate = Array.from({ length: 200 }, (_, i) => `{{input.k${i}}}`).join(" ");
  const input = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, i]));

  const start = process.hrtime.bigint();
  const result = await executor.run(
    { workspaceId: "w-perf", userId: null, toolPermissions: {} },
    {
      nodes: [
        { id: "p", type: "prompt", config: { template: longTemplate, saveAs: "blob" } },
        { id: "out", type: "output", config: { template: "{{blob}}" } },
      ],
      edges: [{ from: "p", to: "out" }],
    },
    input
  );
  const ms = elapsed(start);

  assert.equal(result.status, "succeeded");
  assert.match(result.output ?? "", /0 1 2 3/);
  assert.ok(ms < 500, `heavy render took ${ms.toFixed(1)}ms`);
});
