import { test } from "node:test";
import assert from "node:assert/strict";

import { RecoveryService, backoff, DEFAULT_RECOVERY_POLICY } from "../packages/computer-use/recovery/service";
import { CueError } from "../packages/computer-use/errors";

const svc = new RecoveryService();

test("unrecoverable kinds fail immediately", async () => {
  for (const kind of ["policy_denied", "validation", "unsupported", "quota", "artifact_too_large"] as const) {
    const decision = await svc.decide({ error: new CueError(kind, "x"), attempt: 1, actionId: "click", args: {} });
    assert.equal(decision.strategy, "fail", kind);
  }
});

test("selector_not_found: retry once, then heal via discovery hook, then fail", async () => {
  const error = new CueError("selector_not_found", "nothing matched");
  const args = { selector: { strategy: "text", value: "Sign in", exact: false } };

  const first = await svc.decide({ error, attempt: 1, actionId: "click", args });
  assert.equal(first.strategy, "retry");
  assert.ok(first.delayMs >= 200);

  const healHook = async () => [{ spec: { strategy: "role" as const, role: "button", name: "Sign in" }, confidence: 0.82, reason: "matched role button" }];
  const second = await svc.decide({ error, attempt: 2, actionId: "click", args }, { healSelector: healHook });
  assert.equal(second.strategy, "heal_selector");
  assert.ok(second.healedSelector);
  assert.equal(second.healedSelector!.primary.strategy, "role");
  assert.ok(second.healedFrom);

  // Healer empty → fail.
  const noHeal = await svc.decide({ error, attempt: 2, actionId: "click", args }, { healSelector: async () => [] });
  assert.equal(noHeal.strategy, "fail");
});

test("detached: retry with backoff until attempts exhausted", async () => {
  const error = new CueError("detached", "element detached");
  const d1 = await svc.decide({ error, attempt: 1, actionId: "click", args: {} });
  assert.equal(d1.strategy, "retry");
  const d3 = await svc.decide({ error, attempt: 3, actionId: "click", args: {} });
  assert.equal(d3.strategy, "fail");
});

test("timeout/navigation: retry → refresh_retry → retry/fail chain", async () => {
  const error = new CueError("timeout", "too slow");
  let refreshed = 0;
  const hooks = { refreshPage: async () => { refreshed++; } };

  const d1 = await svc.decide({ error, attempt: 1, actionId: "navigate", args: {} }, hooks);
  assert.equal(d1.strategy, "retry");
  const d2 = await svc.decide({ error, attempt: 2, actionId: "navigate", args: {} }, hooks);
  assert.equal(d2.strategy, "refresh_retry");
  assert.equal(refreshed, 1);
  const d3 = await svc.decide({ error, attempt: 3, actionId: "navigate", args: {} }, hooks);
  assert.equal(d3.strategy, "fail");
});

test("dialog: dismiss-and-retry then fail", async () => {
  const error = new CueError("dialog", "unexpected dialog");
  const d1 = await svc.decide({ error, attempt: 1, actionId: "click", args: {} });
  assert.equal(d1.strategy, "dismiss_dialog_retry");
  const d3 = await svc.decide({ error, attempt: 3, actionId: "click", args: {} });
  assert.equal(d3.strategy, "fail");
});

test("browser_crash: session recovery once, then fail", async () => {
  const error = new CueError("browser_crash", "target closed");
  let recovered = 0;
  const hooks = { recoverSession: async () => { recovered++; } };
  const d1 = await svc.decide({ error, attempt: 1, actionId: "navigate", args: {} }, hooks);
  assert.equal(d1.strategy, "session_recovery");
  assert.equal(recovered, 1);
  const d2 = await svc.decide({ error, attempt: 2, actionId: "navigate", args: {} }, hooks);
  assert.equal(d2.strategy, "fail");
});

test("backoff grows exponentially and caps", () => {
  assert.equal(backoff(1, DEFAULT_RECOVERY_POLICY), 250);
  assert.equal(backoff(2, DEFAULT_RECOVERY_POLICY), 500);
  assert.equal(backoff(10, DEFAULT_RECOVERY_POLICY), DEFAULT_RECOVERY_POLICY.maxDelayMs);
});
