import { test } from "node:test";
import assert from "node:assert/strict";

import {
  WorkflowExecutor,
  workflowDefinitionSchema,
  evaluateCondition,
  type WorkflowDefinition,
} from "../packages/ai-runtime/workflows/executor";
import type { ModelRouter } from "../packages/ai-runtime/model-router/router";
import { ToolRegistry } from "../packages/ai-runtime/tools/tool";
import { ToolExecutor } from "../packages/ai-runtime/tools/executor";
import { calculatorTool, jsonTransformTool } from "../packages/ai-runtime/tools/builtin/utility";
import type { MemoryService } from "../packages/ai-runtime/memory/service";
import type { ChatResponse, UsageStats } from "../packages/ai-runtime/types";

const USAGE: UsageStats = {
  promptTokens: 1,
  completionTokens: 1,
  totalTokens: 2,
  latencyMs: 1,
  costMicros: 0,
};

function fakeRouter(reply: string): ModelRouter {
  return {
    chat: async (): Promise<ChatResponse> => ({
      content: reply,
      toolCalls: [],
      model: "fake-1",
      provider: "fake",
      usage: USAGE,
      finishReason: "stop",
      attempt: 1,
    }),
  } as unknown as ModelRouter;
}

function fakeMemory(): { service: MemoryService; stored: string[] } {
  const stored: string[] = [];
  const service = {
    async recall() {
      return [
        { id: "m1", content: "Refunds need manager sign-off above ₦50,000.", scope: "LONG_TERM", importance: 0.8, tags: [], createdAt: new Date() },
      ];
    },
    async remember(input: { content: string }) {
      stored.push(input.content);
      return { id: "m-new" };
    },
  } as unknown as MemoryService;
  return { service, stored };
}

function makeExecutor(memory: MemoryService, reply = "Briefing ready.") {
  const tools = new ToolRegistry().register(calculatorTool).register(jsonTransformTool);
  return new WorkflowExecutor({
    router: fakeRouter(reply),
    tools,
    executor: new ToolExecutor(tools),
    memory,
  });
}

const CTX = { workspaceId: "w1", userId: "u1", toolPermissions: {} };

test("rejects invalid graphs at the schema layer", () => {
  // duplicate ids
  assert.throws(() =>
    workflowDefinitionSchema.parse({
      nodes: [
        { id: "a", type: "prompt", config: { template: "x" } },
        { id: "a", type: "output", config: { template: "y" } },
      ],
      edges: [{ from: "a", to: "a" }],
    })
  );
  // missing output node
  assert.throws(() =>
    workflowDefinitionSchema.parse({
      nodes: [{ id: "a", type: "prompt", config: { template: "x" } }],
      edges: [],
    })
  );
  // two outputs
  assert.throws(() =>
    workflowDefinitionSchema.parse({
      nodes: [
        { id: "a", type: "output", config: { template: "1" } },
        { id: "b", type: "output", config: { template: "2" } },
      ],
      edges: [{ from: "a", to: "b" }],
    })
  );
  // unreachable node (a disconnected cycle — plain orphans are valid roots)
  assert.throws(() =>
    workflowDefinitionSchema.parse({
      nodes: [
        { id: "a", type: "prompt", config: { template: "x" } },
        { id: "b", type: "prompt", config: { template: "y" } },
        { id: "c", type: "prompt", config: { template: "z" } },
        { id: "o", type: "output", config: { template: "{{a}}" } },
      ],
      edges: [
        { from: "a", to: "o" },
        { from: "b", to: "c" },
        { from: "c", to: "b" },
      ],
    })
  );
  // edge to unknown node
  assert.throws(() =>
    workflowDefinitionSchema.parse({
      nodes: [{ id: "a", type: "output", config: { template: "x" } }],
      edges: [{ from: "a", to: "void" }],
    })
  );
});

test("memory → ai → output pipeline renders templates end-to-end", async () => {
  const { service } = fakeMemory();
  const executor = makeExecutor(service, "Use the refund rule.");
  const result = await executor.run(
    CTX,
    {
      nodes: [
        { id: "recall", type: "memory", config: { action: "read", scope: "LONG_TERM", limit: 3 } },
        {
          id: "draft",
          type: "ai",
          config: {
            system: "Ground on: {{recall.content}}",
            message: "Topic: {{input.topic}}",
            json: false,
          },
        },
        { id: "done", type: "output", config: { template: "OUT:{{draft.content}}" } },
      ],
      edges: [
        { from: "recall", to: "draft" },
        { from: "draft", to: "done" },
      ],
    },
    { topic: "refunds" }
  );
  assert.equal(result.status, "succeeded");
  assert.equal(result.output, "OUT:Use the refund rule.");
  assert.deepEqual(
    result.trace.map((t) => [t.nodeId, t.status]),
    [
      ["recall", "succeeded"],
      ["draft", "succeeded"],
      ["done", "succeeded"],
    ]
  );
});

test("condition node gates its true/false arms", async () => {
  const { service } = fakeMemory();
  const executor = makeExecutor(service);
  const graph = (n: number): WorkflowDefinition => ({
    nodes: [
      { id: "calc", type: "tool", config: { tool: "calculator", arguments: { expression: String(n) } } },
      { id: "check", type: "condition", config: { expression: "{{calc.content.value}} >= 10" } },
      { id: "big", type: "prompt", config: { template: "BIG" } },
      { id: "small", type: "prompt", config: { template: "SMALL" } },
      { id: "out", type: "output", config: { template: "{{big}}{{small}}" } },
    ],
    edges: [
      { from: "calc", to: "check" },
      { from: "check", to: "big", when: "true" },
      { from: "check", to: "small", when: "false" },
      { from: "big", to: "out" },
      { from: "small", to: "out" },
    ],
  });

  const bigRun = await executor.run(CTX, graph(42));
  assert.equal(bigRun.status, "succeeded");
  assert.equal(bigRun.output, "BIG");

  const smallRun = await executor.run(CTX, graph(3));
  assert.equal(smallRun.output, "SMALL");
});

test("loop node iterates the body then exits", async () => {
  const { service } = fakeMemory();
  const executor = makeExecutor(service);
  // Note the entry node: the schema requires a root, so the cycle target
  // (loop) is entered from `start`, then re-entered from the body arm.
  const result = await executor.run(CTX, {
    nodes: [
      { id: "start", type: "prompt", config: { template: "go", saveAs: "boot" } },
      { id: "loop", type: "loop", config: { times: 3, saveAs: "i" } },
      { id: "note", type: "prompt", config: { template: "step {{i}};", saveAs: "last" } },
      { id: "out", type: "output", config: { template: "done at {{i}}" } },
    ],
    edges: [
      { from: "start", to: "loop" },
      { from: "loop", to: "note", when: "true" },
      { from: "note", to: "loop" },
      { from: "loop", to: "out", when: "false" },
    ],
  });
  assert.equal(result.status, "succeeded");
  assert.equal(result.output, "done at 3");
  // Body runs exactly `times` (3), plus one exit visit of the loop node.
  assert.equal(result.trace.filter((t) => t.nodeId === "loop").length, 4);
  assert.equal(result.trace.filter((t) => t.nodeId === "note").length, 3);
});

test("a failing node stops the run with a failed trace", async () => {
  const { service } = fakeMemory();
  const executor = makeExecutor(service);
  const result = await executor.run(CTX, {
    nodes: [
      { id: "boom", type: "tool", config: { tool: "calculator", arguments: { expression: "1/0" } } },
      { id: "out", type: "output", config: { template: "never" } },
    ],
    edges: [{ from: "boom", to: "out" }],
  });
  assert.equal(result.status, "failed");
  assert.equal(result.output, null);
  const failed = result.trace.find((t) => t.status === "failed");
  assert.equal(failed?.nodeId, "boom");
  assert.match(failed?.error ?? "", /Division by zero/);
  assert.equal(result.trace.some((t) => t.nodeId === "out"), false);
});

test("memory write node stores rendered content", async () => {
  const { service, stored } = fakeMemory();
  const executor = makeExecutor(service);
  const result = await executor.run(
    CTX,
    {
      nodes: [
        { id: "save", type: "memory", config: { action: "write" as const, content: "Fact from {{input.source}}", scope: "WORKSPACE" as const, limit: 5 } },
        { id: "out", type: "output", config: { template: "saved {{save.id}}" } },
      ],
      edges: [{ from: "save", to: "out" }],
    },
    { source: "playground" }
  );
  assert.equal(result.status, "succeeded");
  assert.deepEqual(stored, ["Fact from playground"]);
  assert.equal(result.output, "saved m-new");
});

test("evaluateCondition supports comparisons and truthiness", () => {
  assert.equal(evaluateCondition("5 >= 10"), false);
  assert.equal(evaluateCondition("5 >= 5"), true);
  assert.equal(evaluateCondition("3 < 4"), true);
  assert.equal(evaluateCondition("2 == 2"), true);
  assert.equal(evaluateCondition("2 != 2"), false);
  assert.equal(evaluateCondition("ok"), true);
  assert.equal(evaluateCondition(""), false);
});
