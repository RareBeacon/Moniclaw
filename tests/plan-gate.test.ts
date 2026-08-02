import { test } from "node:test";
import assert from "node:assert/strict";

import { creditsForRun } from "../packages/agent-runtime/credits";
import {
  currentBillingPeriod,
  PLAN_LIMITS,
  planGateDecision,
} from "../lib/billing";
import { WorkerOrchestrator } from "../packages/agent-runtime/orchestrator";
import { AgentError } from "../packages/agent-runtime/errors";
import type { AgentRow } from "../packages/agent-runtime/ports";

// ── creditsForRun (accrual) ──────────────────────────────────────────────

test("credits: pre-work and non-terminal runs charge nothing", () => {
  assert.equal(creditsForRun({ stepsExecuted: 0, tokensUsed: 0, status: "CANCELED" }), 0);
  assert.equal(creditsForRun({ stepsExecuted: 0, tokensUsed: 0, status: "SUCCEEDED" }), 0);
  assert.equal(creditsForRun({ stepsExecuted: 3, tokensUsed: 900, status: "RUNNING" }), 0);
  assert.equal(creditsForRun({ stepsExecuted: 0, tokensUsed: 0, status: "QUEUED" }), 0);
});

test("credits: minimum 1 for any run that did real work", () => {
  assert.equal(creditsForRun({ stepsExecuted: 1, tokensUsed: 40, status: "SUCCEEDED" }), 1);
  assert.equal(creditsForRun({ stepsExecuted: 2, tokensUsed: 0, status: "FAILED" }), 1);
});

test("credits: ⌈tokens/1000⌉ above the floor, failed runs that consumed tokens still pay", () => {
  assert.equal(creditsForRun({ stepsExecuted: 4, tokensUsed: 1001, status: "SUCCEEDED" }), 2);
  assert.equal(creditsForRun({ stepsExecuted: 4, tokensUsed: 55_000, status: "FAILED" }), 55);
});

// ── planGateDecision (enforcement decider) ───────────────────────────────

test("unmetered plans (ENTERPRISE) always pass with null remaining", () => {
  const d = planGateDecision(999_999, "ENTERPRISE");
  assert.deepEqual(d, { allowed: true, remaining: null, message: null });
});

test("remaining credits pass and report the headroom", () => {
  const d = planGateDecision(4_999, "DUO");
  assert.equal(d.allowed, true);
  assert.equal(d.remaining, 1);
  assert.equal(d.message, null);
});

test("boundary: used === limit REFUSES with an honest reset message", () => {
  const period = { start: new Date("2026-08-01T00:00:00Z"), end: new Date("2026-09-01T00:00:00Z") };
  const d = planGateDecision(5_000, "DUO", period);
  assert.equal(d.allowed, false);
  assert.equal(d.remaining, 0);
  assert.ok(d.message!.includes("Duo"));
  assert.ok(d.message!.includes("5,000"));
  assert.ok(d.message!.includes("2026-09-01"), "names the metering-month reset");
  assert.ok(!d.message!.includes("{{"), "no template leftovers");
});

test("over-limit by accrual still refuses exactly once per dispatch", () => {
  const d = planGateDecision(5_045, "DUO");
  assert.equal(d.allowed, false);
});

test("registry: Duo is the launch plan (2 seats, 5k credits, 10 agents)", () => {
  assert.deepEqual(PLAN_LIMITS.DUO, {
    creditsPerMonth: 5_000,
    agents: 10,
    seats: 2,
    label: "Duo",
  });
});

test("billing period is the UTC calendar month", () => {
  const { start, end } = currentBillingPeriod();
  assert.equal(start.getUTCDate(), 1);
  assert.equal(start.getUTCHours(), 0);
  assert.equal(end.getUTCMonth(), (start.getUTCMonth() + 1) % 12);
});

// ── Orchestrator wiring: gate refuses a root dispatch (402 mapping) ─────

test("orchestrator consults the plan gate for root runs and throws budget_exceeded on refusal", async () => {
  const agent: AgentRow = {
    id: "a1",
    workspaceId: "w1",
    name: "Worker",
    slug: "worker",
    description: "",
    category: null,
    status: "ACTIVE",
    trigger: "MANUAL",
    schedule: null,
    skills: [],
    workerType: "custom",
    goal: "do the thing",
    instructions: null,
    toolPolicy: {},
    budget: {},
    lastScheduledAt: null,
    runCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let gateCalls = 0;
  const orchestrator = new WorkerOrchestrator({
    agents: { async get() { return agent; } } as never,
    runs: {
      async findByIdempotency() { return null; },
      async countActiveByAgent() { return 0; },
      create: async () => { throw new Error("must not create when gated"); },
    } as never,
    events: {} as never,
    approvals: {} as never,
    usage: {} as never,
    audit: { async log() {} } as never,
    queue: {} as never,
    rate: { async check() {} } as never,
    clock: { now: () => new Date() },
    registry: {} as never,
    synthesizer: {} as never,
    buildPlanner: (() => {}) as never,
    workspaceToolPermissions: async () => ({}),
    planGate: {
      async checkRootDispatch(workspaceId: string) {
        gateCalls += 1;
        assert.equal(workspaceId, "w1");
        return { allowed: false, message: "Duo plan exhausted." };
      },
    },
  } as unknown as ConstructorParameters<typeof WorkerOrchestrator>[0]);

  await assert.rejects(
    orchestrator.dispatch({ workspaceId: "w1", agentId: "a1" }),
    (err: unknown) => {
      assert.ok(err instanceof AgentError);
      assert.equal((err as AgentError).kind, "budget_exceeded");
      assert.equal((err as AgentError).message, "Duo plan exhausted.");
      return true;
    }
  );
  assert.equal(gateCalls, 1);
});

test("orchestrator skips the plan gate for delegated child runs (no double-pay)", async () => {
  const agent = {
    id: "a1", workspaceId: "w1", name: "W", slug: "w", description: "", category: null,
    status: "ACTIVE", trigger: "MANUAL", schedule: null, skills: [], workerType: "custom",
    goal: "g", instructions: null, toolPolicy: {}, budget: {}, lastScheduledAt: null,
    runCount: 0, createdAt: new Date(), updatedAt: new Date(),
  } satisfies Record<string, unknown>;
  let gateCalls = 0;
  let created = 0;
  const orchestrator = new WorkerOrchestrator({
    agents: { async get() { return agent; } } as never,
    runs: {
      async findByIdempotency() { return null; },
      async countActiveByAgent() { return 0; },
      async create() {
        created += 1;
        return { id: "run-1", agentId: "a1", workspaceId: "w1", status: "QUEUED", tokensUsed: 0, creditsUsed: 0 } as never;
      },
    } as never,
    events: { async append() {} } as never,
    approvals: {} as never,
    usage: {} as never,
    audit: { async log() {} } as never,
    queue: { async drain() {}, async enqueue() {} } as never,
    rate: { async check() {} } as never,
    clock: { now: () => new Date() },
    registry: {} as never,
    synthesizer: {} as never,
    buildPlanner: (() => {}) as never,
    workspaceToolPermissions: async () => ({}),
    planGate: {
      async checkRootDispatch() {
        gateCalls += 1;
        return { allowed: false, message: "nope" };
      },
    },
  } as unknown as ConstructorParameters<typeof WorkerOrchestrator>[0]);

  await orchestrator.dispatch({ workspaceId: "w1", agentId: "a1", parentRunId: "parent-1" });
  assert.equal(gateCalls, 0, "children never re-pay the plan gate");
  assert.equal(created, 1);
});
