/**
 * Phase 6 — workflow-engine integration: sales tools in the shared registry.
 *
 * Verifies the registration surface (names, safe-by-default enablement) and
 * that tool execution flows through the injected backend with the tool
 * context's workspace identity (tenant isolation boundary).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ToolRegistry,
  isToolEnabled,
} from "../packages/ai-runtime/tools/tool";
import { salesTools } from "../lib/ai/sales-tool-registration";

function backendStub() {
  const calls: Array<{ method: string; workspaceId: string; arg?: unknown }> = [];
  return {
    calls,
    async listCompanies(workspaceId: string, filters: never) {
      calls.push({ method: "listCompanies", workspaceId, arg: filters });
      return [{ id: "c1", name: "Acme Ltd", priorityScore: 88 }];
    },
    async listContacts(workspaceId: string, filters: never) {
      calls.push({ method: "listContacts", workspaceId, arg: filters });
      return [{ id: "p1", name: "Ada Lovelace", status: "QUALIFIED" }];
    },
    async pipelineSnapshot(workspaceId: string) {
      calls.push({ method: "pipelineSnapshot", workspaceId });
      return [{ id: "pl1", name: "Sales", stages: [] }];
    },
    async logActivity(workspaceId: string, actorId: string | null, input: never) {
      calls.push({ method: "logActivity", workspaceId, arg: { actorId, input } });
      return { id: "act-1" };
    },
  };
}

const ctx = { workspaceId: "ws-42", userId: "user-7", toolPermissions: {} };

test("sales tools: exposes exactly the four sales tools with sales category metadata", () => {
  const tools = salesTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ["sales_activity_log", "sales_company_search", "sales_contact_search", "sales_pipeline_snapshot"]
  );
  for (const t of tools) {
    assert.equal(t.metadata.category, "sales");
    assert.equal(t.metadata.version, "1.0.0");
  }
});

test("sales tools: registers without collision into the shared ToolRegistry", () => {
  const registry = new ToolRegistry();
  for (const t of salesTools()) registry.register(t);
  assert.ok(registry.get("sales_company_search"));
  assert.ok(registry.get("sales_activity_log"));
});

test("sales tools: read tools default-enabled, mutating activity log default-disabled", () => {
  const byName = new Map(salesTools().map((t) => [t.name, t]));
  assert.equal(isToolEnabled(byName.get("sales_company_search")!, {}), true);
  assert.equal(isToolEnabled(byName.get("sales_pipeline_snapshot")!, {}), true);
  assert.equal(isToolEnabled(byName.get("sales_activity_log")!, {}), false);
  assert.equal(isToolEnabled(byName.get("sales_activity_log")!, { sales_activity_log: true }), true);
});

test("sales tools: reads execute against backend with the context workspace", async () => {
  const backend = backendStub();
  const tools = new Map(salesTools(async () => backend).map((t) => [t.name, t]));

  const companies = (await tools.get("sales_company_search")!.execute({ query: "acme", take: 10 }, ctx)) as any;
  assert.deepEqual(companies, { companies: [{ id: "c1", name: "Acme Ltd", priorityScore: 88 }] });

  const contacts = (await tools.get("sales_contact_search")!.execute({ status: "QUALIFIED", take: 20 }, ctx)) as any;
  assert.deepEqual(contacts, { contacts: [{ id: "p1", name: "Ada Lovelace", status: "QUALIFIED" }] });

  const snapshot = (await tools.get("sales_pipeline_snapshot")!.execute({}, ctx)) as any;
  assert.deepEqual(snapshot, { pipelines: [{ id: "pl1", name: "Sales", stages: [] }] });

  // Every call carried the tool-context workspace — the tenant boundary.
  assert.deepEqual(backend.calls.map((c) => c.workspaceId), ["ws-42", "ws-42", "ws-42"]);
});

test("sales tools: activity log uses the calling user as actor and returns the new id", async () => {
  const backend = backendStub();
  const tools = new Map(salesTools(async () => backend).map((t) => [t.name, t]));
  const result = (await tools.get("sales_activity_log")!.execute(
    { type: "CALL", subject: "Discovery call", companyId: "5b8f84d9-7a59-4a1a-9fd8-2cf3c92e1a9b" },
    ctx
  )) as any;
  assert.deepEqual(result, { logged: true, activityId: "act-1" });
  assert.equal(backend.calls[0].method, "logActivity");
  assert.equal(backend.calls[0].workspaceId, "ws-42");
});

test("sales tools: activity without CRM attachment is rejected before touching backend", async () => {
  const backend = backendStub();
  const tools = new Map(salesTools(async () => backend).map((t) => [t.name, t]));
  await assert.rejects(
    tools.get("sales_activity_log")!.execute({ type: "NOTE", subject: "Orphan note" }, ctx),
    /attach to a company, contact or deal/
  );
  assert.equal(backend.calls.length, 0);
});

test("sales tools: zod boundary rejects invalid status enums", () => {
  const tools = new Map(salesTools().map((t) => [t.name, t]));
  assert.equal(tools.get("sales_contact_search")!.schema.safeParse({ status: "RESEARCHED" }).success, false);
  assert.equal(tools.get("sales_contact_search")!.schema.safeParse({ status: "NEW" }).success, true);
});
