import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import { ToolRegistry, type Tool } from "../packages/ai-runtime/tools/tool";
import { PolicyToolRegistry, defaultAllowlist, resolveToolPolicy } from "../packages/agent-runtime/policy";
import { createDelegateTool } from "../packages/agent-runtime/delegation";
import { digestTrace, sourcesFromTrace } from "../packages/agent-runtime/research";
import type { StepTrace } from "../packages/ai-runtime/planner/planner";

function fakeTool(name: string, mutating = false): Tool {
  return {
    name,
    description: `${name} tool`,
    schema: z.object({}),
    metadata: { category: "test", mutating, version: "1.0.0" },
    async execute() { return "{}"; },
  };
}

function baseRegistry(): ToolRegistry {
  return new ToolRegistry()
    .register(fakeTool("calculator"))
    .register(fakeTool("http_request"))
    .register(fakeTool("knowledge_search"))
    .register(fakeTool("purchase_order", true))
    .register(fakeTool("send_email", true));
}

const CTX = { toolPermissions: { purchase_order: true, send_email: true } };

test("resolveToolPolicy defaults; invalid shapes rejected", () => {
  const p = resolveToolPolicy({});
  assert.deepEqual(p, { allow: [], deny: [], allowDelegation: false });
  assert.deepEqual(resolveToolPolicy(null).allow, []);
  assert.throws(() => resolveToolPolicy({ allow: "nope" }));
});

test("default allowlist per worker type; research includes browser", () => {
  assert.ok(defaultAllowlist("research").includes("browser_extract"));
  assert.ok(defaultAllowlist("research").includes("knowledge_search"));
  assert.ok(!defaultAllowlist("ops").includes("browser_execute"));
  assert.ok(!defaultAllowlist("general").includes("http_request"));
});

test("empty policy → worker-type defaults; non-allowlisted tools hidden", () => {
  const reg = new PolicyToolRegistry(baseRegistry(), resolveToolPolicy({}), { workerType: "general", shadow: false });
  assert.ok(reg.get("calculator"));
  assert.equal(reg.get("http_request"), undefined, "not in general default allowlist");
  assert.equal(reg.get("purchase_order"), undefined, "mutating tools invisible to general workers");
  const names = reg.specsFor(CTX).map((s) => s.name);
  assert.ok(names.includes("knowledge_search"));
  assert.ok(!names.includes("http_request"));
});

test("explicit allow overrides defaults; deny wins over allow", () => {
  const reg = new PolicyToolRegistry(
    baseRegistry(),
    resolveToolPolicy({ allow: ["calculator", "http_request", "send_email"], deny: ["send_email"] }),
    { workerType: "ops", shadow: true } // even SHADOW keeps explicitly allowed non-mutating tools
  );
  assert.ok(reg.get("calculator"));
  assert.ok(reg.get("http_request"));
  assert.equal(reg.get("send_email"), undefined, "deny beats allow");
  assert.equal(reg.get("knowledge_search"), undefined, "not allowed even though ops-default has it");
});

test("SHADOW strips mutating tools even when workspace enabled them", () => {
  const live = new PolicyToolRegistry(baseRegistry(), resolveToolPolicy({ allow: ["calculator", "purchase_order"] }), { workerType: "ops", shadow: false });
  assert.ok(live.get("purchase_order"));
  const shadow = new PolicyToolRegistry(baseRegistry(), resolveToolPolicy({ allow: ["calculator", "purchase_order"] }), { workerType: "ops", shadow: true });
  assert.equal(shadow.get("purchase_order"), undefined);
  assert.ok(!shadow.specsFor(CTX).some((s) => s.name === "purchase_order"));
  assert.ok(shadow.get("calculator"));
});

test("capability tool (agent_delegate) bypasses allowlists only when injected", () => {
  const delegateTool = createDelegateTool(
    { delegate: async () => ({ runId: "r", agentId: "a", status: "SUCCEEDED", summary: "ok" }) },
    { runId: "parent", agentId: "boss", workspaceId: "ws" }
  );
  const without = new PolicyToolRegistry(baseRegistry(), resolveToolPolicy({}), { workerType: "general", shadow: false });
  assert.equal(without.get("agent_delegate"), undefined, "not in default allowlist, not injected");

  const withCap = new PolicyToolRegistry(baseRegistry(), resolveToolPolicy({ allowDelegation: true }), {
    workerType: "general", shadow: false, extraTools: [delegateTool],
  });
  assert.ok(withCap.get("agent_delegate"), "injected capability visible");
  assert.ok(withCap.specsFor(CTX).some((s) => s.name === "agent_delegate"));
});

test("sourcesFromTrace extracts deduped url/title pairs from nested outputs", () => {
  const trace: StepTrace[] = [
    { step: { description: "open page", tool: "browser_extract", requiresApproval: false },
      status: "succeeded", attempts: 1,
      output: { url: "https://a.example/x", title: "Alpha", links: [{ url: "https://b.example", title: "Beta" }] } },
    { step: { description: "again", tool: "http_request", requiresApproval: false },
      status: "succeeded", attempts: 1,
      output: { data: { url: "https://a.example/x", title: "Alpha dup" }, other: "ftp://ignore" } },
    { step: { description: "no source", requiresApproval: false }, status: "succeeded", attempts: 1, output: { url: "not-a-url" } },
  ];
  const sources = sourcesFromTrace(trace);
  assert.equal(sources.length, 2);
  assert.deepEqual(sources[0], { url: "https://a.example/x", title: "Alpha" });
  assert.deepEqual(sources[1], { url: "https://b.example", title: "Beta" });
});

test("digestTrace renders a bounded per-step digest", () => {
  const trace: StepTrace[] = [
    { step: { description: "Gather sources", tool: "browser_extract", requiresApproval: false }, status: "succeeded", attempts: 1 },
    { step: { description: "Broke step", requiresApproval: false }, status: "failed", attempts: 2, error: "boom" },
  ];
  const digest = digestTrace(trace);
  assert.ok(digest.includes("1. succeeded [browser_extract] Gather sources"));
  assert.ok(digest.includes("2. failed Broke step — error: boom"));
  const huge: StepTrace[] = Array.from({ length: 200 }, (_, i) => ({
    step: { description: `step ${i} `.repeat(20).slice(0, 400), requiresApproval: false },
    status: "succeeded", attempts: 1,
  }));
  assert.ok(digestTrace(huge).length <= 6000);
});
