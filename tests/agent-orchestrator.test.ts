/**
 * Orchestrator lifecycle battery — every WorkerOrchestrator behavior against
 * fake ports (no DB, no model): dispatch, execution, approval park/resume,
 * kill switch, budgets, idempotency, concurrency, delegation, schedule tick.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import { ToolRegistry, type Tool } from "../packages/ai-runtime/tools/tool";
import type { PlanRunResult, PlanSnapshot, StepTrace } from "../packages/ai-runtime/planner/planner";
import { WorkerOrchestrator, type OrchestratorDeps } from "../packages/agent-runtime/orchestrator";
import { AgentError } from "../packages/agent-runtime/errors";
import { resolveBudget } from "../packages/agent-runtime/budget";
import type {
  AgentRepository, AgentRow, AgentRunCreateInput, AgentRunRepository, AgentRunRow,
  AgentRunStatus, RunEventRow,
} from "../packages/agent-runtime/ports";

// ── Fakes ────────────────────────────────────────────────────────────────

interface FakeStep { description: string; tool?: string; requiresApproval?: boolean }

interface Scenario {
  steps: FakeStep[];
  usagePerStep: { tokens: number; costMicros: number };
  approvalDecision: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  afterStep?: (index: number, h: Harness) => void;
}

class FakeAgents implements AgentRepository {
  rows = new Map<string, AgentRow>();
  add(partial: Partial<AgentRow> & { id: string; workspaceId: string; slug: string }): AgentRow {
    const row: AgentRow = {
      name: partial.slug, description: "fake agent", category: null,
      status: "SUPERVISED", trigger: "MANUAL", schedule: null, skills: [],
      workerType: "general", goal: "Investigate things.", instructions: null,
      toolPolicy: {}, budget: {}, lastScheduledAt: null, runCount: 0,
      createdAt: new Date(), updatedAt: new Date(),
      ...partial,
    };
    this.rows.set(row.id, row);
    return row;
  }
  async get(workspaceId: string, id: string) {
    const r = this.rows.get(id);
    return r && r.workspaceId === workspaceId ? r : null;
  }
  async getBySlug(workspaceId: string, slug: string) {
    return [...this.rows.values()].find((r) => r.workspaceId === workspaceId && r.slug === slug) ?? null;
  }
  async list(workspaceId: string) { return [...this.rows.values()].filter((r) => r.workspaceId === workspaceId); }
  async listSchedulable() {
    return [...this.rows.values()].filter((r) => r.trigger === "SCHEDULE" && r.schedule && ["SUPERVISED", "AUTONOMOUS"].includes(r.status));
  }
  async touchLastScheduled(id: string, at: Date) { const r = this.rows.get(id); if (r) r.lastScheduledAt = at; }
  async incrementRunCount(id: string, by = 1) { const r = this.rows.get(id); if (r) r.runCount += by; }
}

class FakeRuns implements AgentRunRepository {
  rows = new Map<string, AgentRunRow>();
  seq = 0;

  async create(input: AgentRunCreateInput): Promise<AgentRunRow> {
    if (input.idempotencyKey) {
      for (const r of this.rows.values()) {
        if (r.agentId === input.agentId && r.idempotencyKey === input.idempotencyKey) {
          throw new Error("Unique constraint failed on the fields: (`agentId`,`idempotencyKey`)");
        }
      }
    }
    const row: AgentRunRow = {
      id: input.id ?? `run-${++this.seq}`,
      agentId: input.agentId,
      workspaceId: input.workspaceId,
      mode: input.mode,
      status: "QUEUED",
      triggerSource: input.triggerSource,
      creditsUsed: 0,
      parentRunId: input.parentRunId ?? null,
      depth: input.depth ?? 0,
      plan: null,
      progress: input.progress ?? { goal: input.goalSnapshot },
      budgetSnapshot: input.budgetSnapshot,
      idempotencyKey: input.idempotencyKey ?? null,
      output: null,
      error: null,
      errorClass: null,
      cancelRequested: false,
      tokensUsed: 0,
      stepsExecuted: 0,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(),
    };
    this.rows.set(row.id, row);
    return row;
  }
  async get(workspaceId: string, id: string) {
    const r = this.rows.get(id);
    return r && r.workspaceId === workspaceId ? r : null;
  }
  async getInternal(id: string) { return this.rows.get(id) ?? null; }
  async findByIdemotency() { return null; }
  async findByIdempotency(agentId: string, key: string) {
    return [...this.rows.values()].find((r) => r.agentId === agentId && r.idempotencyKey === key) ?? null;
  }
  async list(workspaceId: string, opts?: { agentId?: string; status?: AgentRunStatus }) {
    return [...this.rows.values()].filter((r) =>
      r.workspaceId === workspaceId &&
      (!opts?.agentId || r.agentId === opts.agentId) &&
      (!opts?.status || r.status === opts.status));
  }
  async listChildren(parentRunId: string) {
    return [...this.rows.values()].filter((r) => r.parentRunId === parentRunId);
  }
  async countActiveByAgent(agentId: string) {
    return [...this.rows.values()].filter((r) => r.agentId === agentId && ["QUEUED", "RUNNING", "NEEDS_APPROVAL"].includes(r.status)).length;
  }
  async transition(id: string, from: AgentRunStatus[], to: AgentRunStatus, patch?: Partial<AgentRunRow>) {
    const r = this.rows.get(id);
    if (!r || !from.includes(r.status)) return false;
    r.status = to;
    if (patch?.startedAt) r.startedAt = patch.startedAt;
    if (patch?.finishedAt) r.finishedAt = patch.finishedAt;
    return true;
  }
  async savePlan(id: string, plan: unknown) { const r = this.rows.get(id); if (r) r.plan = plan; }
  async saveProgress(id: string, progress: unknown) { const r = this.rows.get(id); if (r) r.progress = progress; }
  async setStepsExecuted(id: string, stepsExecuted: number) { const r = this.rows.get(id); if (r) r.stepsExecuted = stepsExecuted; }
  async requestCancel(workspaceId: string, id: string) {
    const r = this.rows.get(id);
    if (!r || r.workspaceId !== workspaceId || ["SUCCEEDED", "FAILED", "CANCELED"].includes(r.status)) return false;
    r.cancelRequested = true;
    return true;
  }
  async finish(id: string, patch: { status: AgentRunStatus; output?: unknown; error?: string | null; errorClass?: string | null; tokensUsed?: number; stepsExecuted?: number }) {
    const r = this.rows.get(id);
    if (!r) return;
    r.status = patch.status;
    r.finishedAt = new Date();
    if (patch.output !== undefined) r.output = patch.output;
    if (patch.error !== undefined) r.error = patch.error;
    if (patch.errorClass !== undefined) r.errorClass = patch.errorClass;
    if (patch.tokensUsed !== undefined) r.tokensUsed = patch.tokensUsed;
    if (patch.stepsExecuted !== undefined) r.stepsExecuted = patch.stepsExecuted;
  }
}

interface Harness {
  orch: WorkerOrchestrator;
  agents: FakeAgents;
  runs: FakeRuns;
  events: RunEventRow[];
  approvals: { created: Array<{ goal: string; stepIndex: number }>; decision: Scenario["approvalDecision"] };
  usage: { state: { tokens: number; costMicros: number } };
  audit: Array<{ action: string; metadata?: Record<string, unknown> }>;
  queue: { stats(): { queued: number; running: number; concurrency: number } };
  scenario: Scenario;
}

function toPlanStep(s: FakeStep) {
  return { description: s.description, requiresApproval: s.requiresApproval ?? false, ...(s.tool ? { tool: s.tool, input: {} } : {}) };
}

function makeHarness(scenarioInput: Partial<Scenario> = {}, extraAgents: Array<Parameters<FakeAgents["add"]>[0]> = []): Harness {
  const scenario: Scenario = {
    steps: scenarioInput.steps ?? [
      { description: "Gather sources", tool: "knowledge_search" },
      { description: "Read the evidence", tool: "calculator" },
      { description: "Write it up" },
    ],
    usagePerStep: scenarioInput.usagePerStep ?? { tokens: 100, costMicros: 10 },
    approvalDecision: scenarioInput.approvalDecision ?? "APPROVED",
    afterStep: scenarioInput.afterStep,
  };

  const agents = new FakeAgents();
  const runs = new FakeRuns();
  const events: RunEventRow[] = [];
  const approvals = { created: [] as Array<{ goal: string; stepIndex: number }>, decision: scenario.approvalDecision };
  const usage = { state: { tokens: 0, costMicros: 0 } };
  const audit: Array<{ action: string; metadata?: Record<string, unknown> }> = [];

  const registry = new ToolRegistry()
    .register({ name: "calculator", description: "math", schema: z.object({}), metadata: { category: "t", mutating: false, version: "1" }, execute: async () => "{}" })
    .register({ name: "knowledge_search", description: "kb", schema: z.object({}), metadata: { category: "t", mutating: false, version: "1" }, execute: async () => "{}" })
    .register({ name: "purchase_order", description: "mut", schema: z.object({}), metadata: { category: "t", mutating: true, version: "1" }, execute: async () => "{}" });

  let harness: Harness;

  // Re-entrant-safe queue: concurrent drain() calls await in-flight jobs
  // instead of noticing an empty pending list and returning early.
  const pending: Array<() => Promise<void>> = [];
  const active = new Set<Promise<void>>();
  const queue = {
    enqueue(_runId: string, job: () => Promise<void>) { pending.push(job); },
    async drain() {
      while (true) {
        const job = pending.shift();
        if (!job) {
          if (active.size === 0) return;
          await Promise.race(active);
          continue;
        }
        const p = (async () => { await job(); })();
        active.add(p);
        try { await p; } finally { active.delete(p); } // strict FIFO
      }
    },
    stats() { return { queued: pending.length, running: active.size, concurrency: 1 }; },
  };

  function fakePlanner(opts: { hooks: { onStepStart?: (i: number, s: { description: string; tool?: string }) => Promise<void>; onStepDone?: (i: number, t: StepTrace) => Promise<void> }; gate: { request(a: { workspaceId: string; goal: string; step: ReturnType<typeof toPlanStep>; stepIndex: number }): Promise<{ approvalId: string }> } }) {
    const plan = { steps: scenario.steps.map(toPlanStep) };
    async function execFrom(startIndex: number, carried: StepTrace[], goal: string, grantedAt = -1): Promise<PlanRunResult> {
      const trace = [...carried];
      for (let i = startIndex; i < scenario.steps.length; i++) {
        const step = scenario.steps[i];
        await opts.hooks.onStepStart?.(i, { description: step.description, tool: step.tool });
        if (step.requiresApproval && i !== grantedAt) {
          const { approvalId } = await opts.gate.request({
            workspaceId: "ws", goal, step: toPlanStep(step), stepIndex: i,
          });
          trace.push({ step: toPlanStep(step), status: "awaiting_approval", attempts: 0 });
          return { status: "awaiting_approval", goal, plan, trace, approvalId };
        }
        usage.state.tokens += scenario.usagePerStep.tokens;
        usage.state.costMicros += scenario.usagePerStep.costMicros;
        const entry: StepTrace = {
          step: toPlanStep(step), status: "succeeded", attempts: 1,
          output: { url: `https://evidence.example/${i}`, title: `Source ${i}` },
        };
        trace.push(entry);
        scenario.afterStep?.(i, harness);
        await opts.hooks.onStepDone?.(i, entry);
      }
      return { status: "completed", goal, plan, trace, reflection: "Plausible synthesis." };
    }
    return {
      run: (_ctx: unknown, goal: string) => execFrom(0, [], goal),
      resume: async (_ctx: unknown, snapshot: PlanSnapshot) => {
        const parkedAt = snapshot.trace.length - 1;
        const wasParked = snapshot.trace[parkedAt]?.status === "awaiting_approval";
        const trace = snapshot.trace.filter((t) => t.status !== "awaiting_approval");
        // Mirror the real Planner: the caller-granted gate is consumed once.
        return execFrom(trace.length, trace, snapshot.goal, wasParked ? parkedAt : -1);
      },
    };
  }

  const deps: OrchestratorDeps = {
    agents,
    runs,
    events: {
      append: async (e) => {
        const row: RunEventRow = { id: `ev-${events.length}`, runId: e.runId, ts: new Date(), type: e.type, message: e.message, payload: e.payload ?? {} };
        events.push(row);
        return row;
      },
      list: async () => events,
    },
    approvals: {
      create: async (input) => {
        approvals.created.push({ goal: input.goal, stepIndex: input.stepIndex });
        return { approvalId: `appr-${approvals.created.length}` };
      },
      statusOf: async () => approvals.decision,
    },
    usage: { sumByRequestId: async () => ({ ...usage.state }) },
    audit: { log: async (l) => { audit.push(l); } },
    queue,
    rate: { check: async () => {} },
    clock: { now: () => new Date() },
    registry,
    synthesizer: {
      synthesize: async () => ({
        title: "Findings", summary: "Short version.", markdown: "# Findings\nBody.",
        citations: [{ url: "https://evidence.example/0", title: "Source 0" }],
      }),
    },
    buildPlanner: (opts) => fakePlanner(opts as never),
    workspaceToolPermissions: async () => ({}),
  };

  const orch = new WorkerOrchestrator(deps);
  harness = { orch, agents, runs, events, approvals, usage, audit, queue, scenario };
  for (const extra of extraAgents) agents.add(extra);
  return harness;
}

const WS = "ws";

function defaultAgent(h: Harness, over: Partial<AgentRow> = {}): AgentRow {
  return h.agents.add({ id: over.id ?? "agent-1", workspaceId: WS, slug: over.slug ?? "worker-1", ...over });
}

const drainQueue = (h: Harness) => (h.queue as unknown as { drain(): Promise<void> }).drain();

// ── Happy path ───────────────────────────────────────────────────────────

test("dispatch → drain → SUCCEEDED with events, output, usage and run count", async () => {
  const h = makeHarness();
  const agent = defaultAgent(h, { workerType: "research" });
  const { run, deduplicated } = await h.orch.dispatch({ workspaceId: WS, agentId: agent.id });
  assert.equal(deduplicated, false);
  assert.equal(run.status, "QUEUED");
  await drainQueue(h);

  const done = (await h.runs.get(WS, run.id))!;
  assert.equal(done.status, "SUCCEEDED");
  const output = done.output as { reflection?: string; report?: { title: string }; steps?: unknown[] };
  assert.equal(output.reflection, "Plausible synthesis.");
  assert.equal(output.report?.title, "Findings", "research worker gets a synthesized report");
  assert.equal(output.steps?.length, 3);
  assert.equal(done.tokensUsed, 300);
  assert.equal(done.stepsExecuted, 3);
  assert.equal(h.agents.rows.get(agent.id)!.runCount, 1);

  const types = h.events.map((e) => e.type);
  for (const expected of ["run_queued", "run_started", "step_start", "step_done", "run_succeeded"]) {
    assert.ok(types.includes(expected), `event ${expected} present`);
  }
  assert.equal(types.filter((t) => t === "step_done").length, 3);
  assert.ok(h.audit.some((a) => a.action === "agent.run.dispatch"));
});

test("unknown agent / missing goal / DRAFT agent are refused up front", async () => {
  const h = makeHarness();
  await assert.rejects(() => h.orch.dispatch({ workspaceId: WS, agentId: "nope" }), (e) => (e as AgentError).kind === "not_found");

  const goalLess = h.agents.add({ id: "a-nogoal", workspaceId: WS, slug: "nogoal", goal: null });
  await assert.rejects(() => h.orch.dispatch({ workspaceId: WS, agentId: goalLess.id }), (e) => (e as AgentError).kind === "validation");

  const draft = h.agents.add({ id: "a-draft", workspaceId: WS, slug: "drafty", status: "DRAFT" });
  await assert.rejects(() => h.orch.dispatch({ workspaceId: WS, agentId: draft.id }), (e) => (e as AgentError).kind === "agent_unavailable");

  // Goal override works for goalless agents.
  const { run } = await h.orch.dispatch({ workspaceId: WS, agentId: goalLess.id, goal: "Ad-hoc task" });
  await drainQueue(h);
  assert.equal((await h.runs.get(WS, run.id))!.status, "SUCCEEDED");
});

test("SHADOW agents always run in SHADOW mode", async () => {
  const h = makeHarness();
  const agent = defaultAgent(h, { status: "SHADOW" });
  const { run } = await h.orch.dispatch({ workspaceId: WS, agentId: agent.id, mode: "LIVE" });
  assert.equal(run.mode, "SHADOW");
  await drainQueue(h);
  assert.equal((await h.runs.get(WS, run.id))!.status, "SUCCEEDED");
});

// ── Approvals ─────────────────────────────────────────────────────────────

test("requiresApproval step parks the run NEEDS_APPROVAL; approval resumes it", async () => {
  const h = makeHarness({
    steps: [
      { description: "Read sources" },
      { description: "Send the newsletter", requiresApproval: true },
      { description: "Wrap up" },
    ],
  });
  const agent = defaultAgent(h);
  const { run } = await h.orch.dispatch({ workspaceId: WS, agentId: agent.id });
  await drainQueue(h);

  const parked = (await h.runs.get(WS, run.id))!;
  assert.equal(parked.status, "NEEDS_APPROVAL");
  assert.equal(h.approvals.created.length, 1);
  const snapshot = parked.progress as { snapshot?: PlanSnapshot };
  assert.ok(snapshot.snapshot?.approvalId, "plan checkpoint persisted for resume");
  assert.ok(h.events.some((e) => e.type === "approval_parked"));

  const resumed = await h.orch.resumeRun(WS, run.id, "user-1");
  assert.equal(resumed.status, "SUCCEEDED");
  const done = (await h.runs.get(WS, run.id))!;
  assert.equal(done.stepsExecuted, 3);
  assert.ok(h.events.some((e) => e.type === "approval_resumed"));
  assert.equal((done.output as { steps?: unknown[] }).steps?.length, 3);
});

test("resume refuses while approval is pending; rejection fails the run", async () => {
  const h = makeHarness({
    steps: [{ description: "Only gated step", requiresApproval: true }],
    approvalDecision: "PENDING",
  });
  const agent = defaultAgent(h);
  const { run } = await h.orch.dispatch({ workspaceId: WS, agentId: agent.id });
  await drainQueue(h);
  assert.equal((await h.runs.get(WS, run.id))!.status, "NEEDS_APPROVAL");

  await assert.rejects(() => h.orch.resumeRun(WS, run.id), (e) => (e as AgentError).kind === "needs_approval");

  h.approvals.decision = "REJECTED";
  const rejected = await h.orch.resumeRun(WS, run.id);
  assert.equal(rejected.status, "FAILED");
  assert.equal(rejected.errorClass, "approval_rejected");
});

// ── Kill switch + budgets ─────────────────────────────────────────────────

test("cancel mid-run halts at the next step boundary → CANCELED", async () => {
  const h = makeHarness({
    afterStep: (index, harness) => {
      if (index === 0) {
        for (const r of harness.runs.rows.values()) r.cancelRequested = true;
      }
    },
  });
  const agent = defaultAgent(h);
  const { run } = await h.orch.dispatch({ workspaceId: WS, agentId: agent.id });
  await drainQueue(h);

  const done = (await h.runs.get(WS, run.id))!;
  assert.equal(done.status, "CANCELED");
  assert.equal(done.errorClass, "cancelled");
  assert.ok((done.stepsExecuted ?? 0) < 3, "halted before plan completion");
  assert.ok(h.audit.some((a) => a.action === "agent.run.canceled"));
});

test("cancelRun cancels queued/parked runs immediately; terminal runs untouched", async () => {
  const h = makeHarness({ steps: [{ description: "gated", requiresApproval: true }] });
  const agent = defaultAgent(h);
  const { run } = await h.orch.dispatch({ workspaceId: WS, agentId: agent.id });
  await drainQueue(h);
  assert.equal((await h.runs.get(WS, run.id))!.status, "NEEDS_APPROVAL");

  const canceled = await h.orch.cancelRun(WS, run.id, "user-9");
  assert.equal(canceled.status, "CANCELED");
  const again = await h.orch.cancelRun(WS, run.id);
  assert.equal(again.status, "CANCELED", "idempotent on terminal runs");
});

test("step budget trip fails the run with budget_exceeded", async () => {
  const h = makeHarness();
  const agent = defaultAgent(h, { budget: { maxSteps: 2 } });
  const { run } = await h.orch.dispatch({ workspaceId: WS, agentId: agent.id });
  await drainQueue(h);

  const done = (await h.runs.get(WS, run.id))!;
  assert.equal(done.status, "FAILED");
  assert.equal(done.errorClass, "budget_exceeded");
});

test("token budget trip fails the run with budget_exceeded", async () => {
  const h = makeHarness({ usagePerStep: { tokens: 100, costMicros: 1 } });
  const agent = defaultAgent(h, { budget: { maxTokens: 250 } });
  const { run } = await h.orch.dispatch({ workspaceId: WS, agentId: agent.id });
  await drainQueue(h);

  const done = (await h.runs.get(WS, run.id))!;
  assert.equal(done.status, "FAILED");
  assert.equal(done.errorClass, "budget_exceeded");
});

// ── Idempotency + concurrency ─────────────────────────────────────────────

test("idempotency key deduplicates dispatch — one run, one execution", async () => {
  const h = makeHarness();
  const agent = defaultAgent(h);
  const first = await h.orch.dispatch({ workspaceId: WS, agentId: agent.id, idempotencyKey: "btn-click-123" });
  const second = await h.orch.dispatch({ workspaceId: WS, agentId: agent.id, idempotencyKey: "btn-click-123" });
  assert.equal(second.deduplicated, true);
  assert.equal(second.run.id, first.run.id);
  await drainQueue(h);

  // Race path: unique violation → returns the winner's run too.
  const third = await h.orch.dispatch({ workspaceId: WS, agentId: agent.id, idempotencyKey: "btn-click-123" });
  assert.equal(third.run.id, first.run.id);
  assert.equal(h.events.filter((e) => e.type === "run_queued").length, 1);
});

test("agent concurrency cap refuses overflow dispatches", async () => {
  const h = makeHarness({ steps: [{ description: "gated", requiresApproval: true }] });
  const agent = defaultAgent(h, { budget: { maxConcurrentRuns: 1 } });
  await h.orch.dispatch({ workspaceId: WS, agentId: agent.id });
  await drainQueue(h);
  assert.equal((await h.runs.list(WS, { agentId: agent.id }))[0].status, "NEEDS_APPROVAL");

  await assert.rejects(
    () => h.orch.dispatch({ workspaceId: WS, agentId: agent.id }),
    (e) => (e as AgentError).kind === "run_conflict"
  );
});

// ── Delegation ────────────────────────────────────────────────────────────

test("delegation runs a child synchronously with depth + budget clamp + lineage events", async () => {
  const h = makeHarness();
  const parent = defaultAgent(h, { toolPolicy: { allowDelegation: true }, budget: { maxTokens: 10_000, maxCostMicros: 2_000 } });
  h.agents.add({ id: "child-1", workspaceId: WS, slug: "researcher", workerType: "research" });

  const { run: parentRun } = await h.orch.dispatch({ workspaceId: WS, agentId: parent.id });
  await drainQueue(h);
  assert.equal((await h.runs.get(WS, parentRun.id))!.status, "SUCCEEDED");

  const result = await h.orch.delegate(
    { runId: parentRun.id, agentId: parent.id, workspaceId: WS },
    { agent: "researcher", goal: "Deep-dive the pricing page" }
  );
  assert.equal(result.status, "SUCCEEDED");
  assert.ok(result.summary.length > 0);

  const child = (await h.runs.get(WS, result.runId))!;
  assert.equal(child.depth, 1);
  assert.equal(child.parentRunId, parentRun.id);
  assert.ok(child.triggerSource.startsWith("delegate:"));
  const childBudget = resolveBudget(child.budgetSnapshot);
  assert.ok(childBudget.maxTokens <= 5_000, `child capped at ≤50% of parent (${childBudget.maxTokens})`);
  const types = h.events.filter((e) => e.runId === parentRun.id).map((e) => e.type);
  assert.ok(types.includes("delegate_start") && types.includes("delegate_done"));
});

test("delegation depth cap and cycles are blocked", async () => {
  const h = makeHarness({
    steps: [{ description: "trivial" }],
  });
  const parent = defaultAgent(h, { budget: { maxDepth: 0 } });
  h.agents.add({ id: "child-x", workspaceId: WS, slug: "child-x" });
  const { run } = await h.orch.dispatch({ workspaceId: WS, agentId: parent.id });
  await drainQueue(h);

  await assert.rejects(
    () => h.orch.delegate({ runId: run.id, agentId: parent.id, workspaceId: WS }, { agent: "child-x", goal: "too deep" }),
    (e) => (e as AgentError).kind === "delegation_denied"
  );

  // Cycle: parent (maxDepth 2) delegating to itself.
  const parent2 = h.agents.add({ id: "cyclical", workspaceId: WS, slug: "cyclical", budget: { maxDepth: 2 } });
  const { run: cycleRun } = await h.orch.dispatch({ workspaceId: WS, agentId: parent2.id });
  await drainQueue(h);
  await assert.rejects(
    () => h.orch.delegate({ runId: cycleRun.id, agentId: parent2.id, workspaceId: WS }, { agent: "cyclical", goal: "self-loop" }),
    (e) => (e as AgentError).kind === "delegation_denied"
  );
});

test("delegate target must exist in the same workspace", async () => {
  const h = makeHarness();
  const parent = defaultAgent(h);
  const { run } = await h.orch.dispatch({ workspaceId: WS, agentId: parent.id });
  await drainQueue(h);
  await assert.rejects(
    () => h.orch.delegate({ runId: run.id, agentId: parent.id, workspaceId: WS }, { agent: "ghost-agent", goal: "nothing" }),
    (e) => (e as AgentError).kind === "not_found"
  );
});

// ── Scheduler tick ────────────────────────────────────────────────────────

test("tick dispatches due cron agents once per slot", async () => {
  const now = new Date("2026-08-01T10:16:12Z");
  const h = makeHarness();
  h.agents.add({ id: "sched-1", workspaceId: WS, slug: "nightly", trigger: "SCHEDULE", schedule: "*/15 * * * *", status: "AUTONOMOUS" });
  h.agents.add({ id: "sched-2", workspaceId: WS, slug: "hourly", trigger: "SCHEDULE", schedule: "0 11 * * *", status: "AUTONOMOUS" });

  const first = await h.orch.tick(now);
  assert.equal(first.dispatched, 1, "only the */15 agent is due at 10:16");
  const keys = [...h.runs.rows.values()].map((r) => r.idempotencyKey);
  assert.ok(keys.some((k) => k?.startsWith("cron:sched-1:2026-08-01T10:15")));

  const again = await h.orch.tick(new Date("2026-08-01T10:17:00Z"));
  assert.equal(again.dispatched, 0, "same slot not re-dispatched");
  assert.ok(again.skipped >= 2);

  await drainQueue(h);
  const scheduled = [...h.runs.rows.values()].filter((r) => r.triggerSource === "schedule");
  assert.equal(scheduled.length, 1);
  assert.equal((await h.runs.get(WS, scheduled[0].id))!.status, "SUCCEEDED");
});

test("tick skips invalid crons without dying", async () => {
  const now = new Date("2026-08-01T10:16:12Z");
  const h = makeHarness();
  h.agents.add({ id: "bad-cron", workspaceId: WS, slug: "bad", trigger: "SCHEDULE", schedule: "not a cron", status: "AUTONOMOUS" });
  const result = await h.orch.tick(now);
  assert.equal(result.dispatched, 0);
  assert.equal(result.skipped, 1);
});
