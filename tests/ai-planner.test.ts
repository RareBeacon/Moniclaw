import { test } from "node:test";
import assert from "node:assert/strict";

import { Planner, type ApprovalGate, planSchema } from "../packages/ai-runtime/planner/planner";
import type { ModelRouter } from "../packages/ai-runtime/model-router/router";
import { ToolRegistry } from "../packages/ai-runtime/tools/tool";
import { ToolExecutor } from "../packages/ai-runtime/tools/executor";
import { calculatorTool } from "../packages/ai-runtime/tools/builtin/utility";
import type { ChatResponse, UsageStats } from "../packages/ai-runtime/types";

const USAGE: UsageStats = {
  promptTokens: 1,
  completionTokens: 1,
  totalTokens: 2,
  latencyMs: 1,
  costMicros: 0,
};

/** Router double whose chat() replies are scripted per call (decompose → repair… → reflect). */
function scriptedRouter(replies: string[]): ModelRouter & { calls: string[][] } {
  const calls: string[][] = [];
  let i = 0;
  const router = {
    calls,
    chat: async (_ctx: unknown, req: { messages: Array<{ content: string }> }): Promise<ChatResponse> => {
      calls.push(req.messages.map((m) => m.content));
      const content = replies[Math.min(i++, replies.length - 1)]!;
      return {
        content,
        toolCalls: [],
        model: "fake-1",
        provider: "fake",
        usage: USAGE,
        finishReason: "stop",
        attempt: 1,
      };
    },
  };
  return router as unknown as ModelRouter & { calls: string[][] };
}

function makeHarness(replies: string[]) {
  const tools = new ToolRegistry().register(calculatorTool);
  const approvalRequests: Array<{ goal: string; stepIndex: number }> = [];
  const gate: ApprovalGate = {
    async request(input) {
      approvalRequests.push({ goal: input.goal, stepIndex: input.stepIndex });
      return { approvalId: `appr_${approvalRequests.length}` };
    },
  };
  const router = scriptedRouter(replies);
  const planner = new Planner(router, tools, new ToolExecutor(tools), gate);
  return { planner, approvalRequests, router };
}

const CTX = { workspaceId: "w1", userId: "u1", toolPermissions: {} };

const PLAN_OK = JSON.stringify({
  reasoning: "Need the arithmetic, then state the result.",
  steps: [
    { description: "Compute the quarterly delta.", tool: "calculator", input: { expression: "(220-180)/4" }, requiresApproval: false },
    { description: "Summarize the finding for the operator.", requiresApproval: false },
  ],
});

test("valid plans execute tool steps and finish with a reflection", async () => {
  const { planner, router } = makeHarness([
    PLAN_OK,
    "Outcome: computed 10. Evidence: calculator returned {\"value\":10}. Next: none.",
  ]);
  const result = await planner.run(CTX, "Quarterly delta with commentary");
  assert.equal(result.status, "completed");
  assert.equal(result.trace.length, 2);
  assert.equal(result.trace[0]!.status, "succeeded");
  assert.match(JSON.stringify(result.trace[0]!.output), /"value":10/);
  assert.equal(result.trace[1]!.status, "succeeded"); // reasoning-only step
  assert.equal(result.trace[1]!.attempts, 0);
  assert.match(result.reflection ?? "", /Outcome: computed 10/);
  // Two model calls: decompose + reflect.
  assert.equal(router.calls.length, 2);
});

test("a bare steps-array decomposition is normalized (model drift tolerance)", async () => {
  // OpenRouter free-tier models emit [ {description...} ] with no wrapper.
  const arrayRoot = JSON.stringify([
    { description: "Compute the quarterly delta.", tool: "calculator", input: { expression: "(220-180)/4" } },
    { description: "Summarize the finding for the operator." },
  ]);
  const { planner } = makeHarness([
    arrayRoot,
    "Outcome: computed 10. Evidence: calculator returned {\"value\":10}. Next: none.",
  ]);
  const result = await planner.run(CTX, "Quarterly delta");
  assert.equal(result.status, "completed");
  assert.equal(result.trace.length, 2);
});

test("requiresApproval pauses the run through the gate", async () => {
  const plan = JSON.stringify({
    steps: [
      { description: "Send the weekly summary email to finance.", tool: "calculator", input: { expression: "1+1" }, requiresApproval: true },
    ],
  });
  const { planner, approvalRequests } = makeHarness([plan]);
  const result = await planner.run(CTX, "Email finance");
  assert.equal(result.status, "awaiting_approval");
  assert.equal(result.approvalId, "appr_1");
  assert.equal(approvalRequests.length, 1);
  assert.equal(result.reflection, undefined);
  assert.equal(result.trace[0]!.status, "awaiting_approval");
});

test("a failing step is repaired once via the model, then succeeds", async () => {
  const plan = JSON.stringify({
    steps: [
      { description: "Compute something.", tool: "calculator", input: { expression: "not math at all" }, requiresApproval: false },
    ],
  });
  const { planner, router } = makeHarness([
    plan,
    JSON.stringify({ expression: "6*7" }), // repaired arguments
    "reflection text",
  ]);
  const result = await planner.run(CTX, "Compute");
  assert.equal(result.status, "completed");
  assert.equal(result.trace[0]!.attempts, 2);
  assert.match(JSON.stringify(result.trace[0]!.output), /"value":42/);
  // decompose + repair + reflect
  assert.equal(router.calls.length, 3);
});

test("unrecoverable steps fail the run with the trace attached", async () => {
  const plan = JSON.stringify({
    steps: [
      { description: "Divide by zero.", tool: "calculator", input: { expression: "1/0" }, requiresApproval: false },
    ],
  });
  const { planner } = makeHarness([
    plan,
    JSON.stringify({ expression: "1/0" }), // repair returns the same broken input
    "failure reflection",
  ]);
  const result = await planner.run(CTX, "Impossible math");
  assert.equal(result.status, "failed");
  assert.equal(result.trace[0]!.attempts, 2);
  assert.match(result.trace[0]!.error ?? "", /Division by zero/);
  assert.match(result.reflection ?? "", /failure reflection/);
});

test("plans referencing unregistered tools are rejected", async () => {
  const plan = JSON.stringify({
    steps: [
      { description: "Nuke the prod database.", tool: "nuke_db", requiresApproval: false },
    ],
  });
  const { planner } = makeHarness([plan]);
  await assert.rejects(() => planner.run(CTX, "Do damage"), /unavailable tool/);
});

test("non-JSON decomposition raises a planner error", async () => {
  const { planner } = makeHarness(["sure, here is your plan!"]);
  await assert.rejects(() => planner.run(CTX, "Anything"), /non-JSON decomposition/);
});

test("planSchema enforces its own bounds", () => {
  assert.equal(planSchema.safeParse({ steps: [] }).success, false);
  assert.equal(
    planSchema.safeParse({
      steps: [{ description: "ab" }],
    }).success,
    false // description too short
  );
  assert.equal(
    planSchema.safeParse({
      steps: [{ description: "Long enough description." }],
    }).success,
    true
  );
});
