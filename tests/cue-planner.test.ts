import { test } from "node:test";
import assert from "node:assert/strict";

import { ActionPlanner, planToRows } from "../packages/computer-use/execution/planner";
import { PermissionService } from "../packages/computer-use/permissions/service";
import { CueError } from "../packages/computer-use/errors";
import type { PolicyRepository, PolicyRow } from "../packages/computer-use/ports";

function plannerFor(partial: Partial<PolicyRow> = {}): { planner: ActionPlanner; policy: PolicyRow } {
  const policy: PolicyRow = {
    workspaceId: "ws1", readOnly: false, navigationOnly: false,
    allowJavascript: false, allowDownloads: true, allowUploads: true, allowClipboard: false,
    allowedDomains: [], blockedDomains: [], confirmationDomains: [], defaultAllowed: true,
    ...partial,
  };
  const repo: PolicyRepository = { getPolicy: async () => policy, savePolicy: async () => {} };
  return { planner: new ActionPlanner(new PermissionService(repo)), policy };
}

test("valid plan: resolves definitions, validates args, fills defaults", async () => {
  const { planner } = plannerFor();
  const planned = await planner.plan("ws1", [
    { action: "navigate", args: { url: "https://example.com" } },
    { action: "click", args: { selector: { strategy: "role", role: "link", name: "More" } } },
    { action: "take_screenshot", args: {} },
  ]);
  assert.equal(planned.steps.length, 3);
  assert.equal(planned.steps[0].action.id, "navigate");
  assert.equal(planned.steps[0].seq, 1);
  assert.equal(planned.steps[0].args.waitUntil, "domcontentloaded");
  assert.equal(planned.gates.length, 0);
});

test("unknown action fails with step context", async () => {
  const { planner } = plannerFor();
  await assert.rejects(
    planner.plan("ws1", [{ action: "teleport", args: {} }]),
    (err) => err instanceof CueError && err.kind === "validation" && /Step 1/.test(err.message)
  );
});

test("invalid args fail fast with step number", async () => {
  const { planner } = plannerFor();
  await assert.rejects(
    planner.plan("ws1", [
      { action: "navigate", args: { url: "https://ok.com" } },
      { action: "navigate", args: { url: "bad" } },
    ]),
    (err) => err instanceof CueError && err.kind === "validation" && /Step 2/.test(err.message)
  );
});

test("policy pre-flight: readOnly denies interact steps", async () => {
  const { planner } = plannerFor({ readOnly: true });
  await assert.rejects(
    planner.plan("ws1", [{ action: "click", args: { selector: { strategy: "css", value: "#a" } } }]),
    (err) => err instanceof CueError && err.kind === "policy_denied" && /read-only/i.test(err.message)
  );
  // Extraction still plans fine under readOnly.
  const planned = await planner.plan("ws1", [{ action: "extract_text", args: {} }]);
  assert.equal(planned.steps.length, 1);
});

test("policy pre-flight: javascript gate", async () => {
  const { planner } = plannerFor({ allowJavascript: false });
  await assert.rejects(
    planner.plan("ws1", [{ action: "execute_javascript", args: { script: "return 1" } }]),
    (err) => err instanceof CueError && err.kind === "policy_denied"
  );
  const { planner: permitted } = plannerFor({ allowJavascript: true });
  const planned = await permitted.plan("ws1", [{ action: "execute_javascript", args: { script: "return 1" } }]);
  assert.equal(planned.gates.length, 0);
});

test("domain safety: blocked domain fails at plan time", async () => {
  const { planner } = plannerFor({ blockedDomains: ["*.evil.com"] });
  await assert.rejects(
    planner.plan("ws1", [{ action: "navigate", args: { url: "https://a.evil.com" } }]),
    (err) => err instanceof CueError && err.kind === "policy_denied" && /evil\.com/.test(err.message)
  );
});

test("domain safety: confirmation domain becomes an approval gate (not a failure)", async () => {
  const { planner } = plannerFor({ confirmationDomains: ["bank.example.com"] });
  const planned = await planner.plan("ws1", [
    { action: "navigate", args: { url: "https://bank.example.com/login" } },
    { action: "wait", args: { ms: 500 } },
  ]);
  assert.equal(planned.steps.length, 2);
  assert.equal(planned.gates.length, 1);
  assert.equal(planned.gates[0].seq, 1);
  assert.match(planned.gates[0].reason, /bank\.example\.com/);
});

test("planToRows serializes for the plan JSON column", async () => {
  const { planner } = plannerFor();
  const planned = await planner.plan("ws1", [{ action: "navigate", args: { url: "https://example.com" }, note: "open home" }]);
  const rows = planToRows(planned);
  assert.equal(rows[0].seq, 1);
  assert.equal(rows[0].action, "navigate");
  assert.equal(rows[0].note, "open home");
  assert.equal(rows[0].args.waitUntil, "domcontentloaded");
  JSON.stringify(rows); // must be JSON-safe
});
