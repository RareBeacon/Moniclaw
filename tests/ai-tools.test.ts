import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import {
  ToolRegistry,
  isToolEnabled,
  type Tool,
} from "../packages/ai-runtime/tools/tool";
import {
  ToolExecutor,
  type AuditPort,
  type ToolUsagePort,
} from "../packages/ai-runtime/tools/executor";
import {
  calculatorTool,
  datetimeTool,
  jsonTransformTool,
} from "../packages/ai-runtime/tools/builtin/utility";

const CTX = { workspaceId: "w1", userId: "u1", toolPermissions: {} as Record<string, boolean> };

function registry() {
  return new ToolRegistry()
    .register(calculatorTool)
    .register(datetimeTool)
    .register(jsonTransformTool);
}

const mutatingTool: Tool = {
  name: "delete_everything",
  description: "A mutating test double.",
  schema: z.object({ confirm: z.boolean() }),
  metadata: { category: "danger", mutating: true, version: "1.0.0" },
  async execute() {
    return { done: true };
  },
};

function ports() {
  const audited: string[] = [];
  const used: Array<{ tool: string; ok: boolean; error?: string }> = [];
  const audit: AuditPort = {
    async log(entry) {
      audited.push(`${entry.action}:${entry.target}`);
    },
  };
  const usage: ToolUsagePort = {
    async recordToolCall(e) {
      used.push({ tool: e.tool, ok: e.ok, error: e.error });
    },
  };
  return { audited, used, audit, usage };
}

test("registry rejects duplicates and unknown lookups", () => {
  const r = registry();
  assert.throws(() => r.register(calculatorTool), /Duplicate tool registration/);
  assert.equal(r.get("nope"), undefined);
  assert.equal(r.get("calculator")?.name, "calculator");
});

test("read-only tools default-enabled, mutating tools default-disabled", () => {
  assert.equal(isToolEnabled(calculatorTool, {}), true);
  assert.equal(isToolEnabled(mutatingTool, {}), false);
  assert.equal(isToolEnabled(mutatingTool, { delete_everything: true }), true);
  assert.equal(isToolEnabled(calculatorTool, { calculator: false }), false);
  // Grants can only narrow, never widen: ungranted tools are hidden.
  assert.equal(isToolEnabled(calculatorTool, {}, ["datetime"]), false);
  assert.equal(isToolEnabled(calculatorTool, {}, ["calculator"]), true);
});

test("executor runs a valid call and records audit + usage", async () => {
  const { audited, used, audit, usage } = ports();
  const executor = new ToolExecutor(registry(), audit, usage);
  const result = await executor.execute(
    { id: "c1", name: "calculator", arguments: { expression: "2+2" } },
    CTX
  );
  assert.ok(!result.isError);
  assert.match(result.content, /"value":4/);
  assert.deepEqual(audited, ["ai.tool.execute:calculator"]);
  assert.deepEqual(used, [{ tool: "calculator", ok: true, error: undefined }]);
});

test("invalid arguments fail validation before execute runs", async () => {
  const { audited, audit } = ports();
  const executor = new ToolExecutor(registry(), audit);
  const result = await executor.execute(
    { id: "c2", name: "calculator", arguments: { expression: "" } },
    CTX
  );
  assert.equal(result.isError, true);
  assert.match(result.content, /expression/);
  assert.deepEqual(audited, ["ai.tool.error:calculator"]);
});

test("runtime errors inside the tool become isError results", async () => {
  const executor = new ToolExecutor(registry());
  const result = await executor.execute(
    { id: "c3", name: "calculator", arguments: { expression: "1/0" } },
    CTX
  );
  assert.equal(result.isError, true);
  assert.match(result.content, /Division by zero/);
});

test("disabled tools are blocked before execution", async () => {
  const r = registry().register(mutatingTool);
  const executor = new ToolExecutor(r);
  const result = await executor.execute(
    { id: "c4", name: "delete_everything", arguments: { confirm: true } },
    CTX // toolPermissions {} → mutating tool disabled
  );
  assert.equal(result.isError, true);
  assert.match(result.content, /disabled/);

  const allowed = await executor.execute(
    { id: "c5", name: "delete_everything", arguments: { confirm: true } },
    { ...CTX, toolPermissions: { delete_everything: true } }
  );
  assert.ok(!allowed.isError);
});

test("unknown tools produce a structured isError, not a throw", async () => {
  const executor = new ToolExecutor(registry());
  const result = await executor.execute({ id: "c6", name: "ghost", arguments: {} }, CTX);
  assert.equal(result.isError, true);
  assert.match(result.content, /Unknown tool/);
});

test("tool timeouts are enforced", async () => {
  const slow: Tool = {
    name: "slow",
    description: "sleeps",
    schema: z.object({}),
    metadata: { category: "test", mutating: false, version: "1.0.0", defaultTimeoutMs: 25 },
    async execute() {
      await new Promise((r) => setTimeout(r, 500));
      return { done: true };
    },
  };
  const r = registry().register(slow);
  const executor = new ToolExecutor(r);
  const result = await executor.execute({ id: "c7", name: "slow", arguments: {} }, CTX);
  assert.equal(result.isError, true);
  assert.match(result.content, /Timed out/);
});

test("json_transform and datetime behave sanely", async () => {
  const executor = new ToolExecutor(registry());
  const got = await executor.execute(
    { id: "c8", name: "json_transform", arguments: { data: { a: { b: [1, 2, 3] } }, operation: "get", path: "a.b.1" } },
    CTX
  );
  assert.ok(!got.isError);
  assert.match(got.content, /"value":2/);

  const iso = await executor.execute(
    { id: "c9", name: "datetime", arguments: { format: "unix" } },
    CTX
  );
  assert.ok(!iso.isError);
  assert.match(iso.content, /"unix":1[0-9]{9}/);
});
