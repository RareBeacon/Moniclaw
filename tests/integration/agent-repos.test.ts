import { test, before, after, type TestContext } from "node:test";
import assert from "node:assert/strict";

/**
 * Integration tests for the Agent Runtime Prisma repositories against a REAL
 * Postgres database. Skipped per-test when DATABASE_URL is unreachable.
 *
 * Covers: worker columns roundtrip, run lifecycle transitions, idempotency
 * uniqueness (incl. NULL coexistence), delegation self-relation, cancellation
 * guard, progress snapshots, event trail ordering, usage requestId rollup,
 * workspace scoping.
 */

import { PrismaClient } from "@prisma/client";
import {
  AgentPrismaRepository,
  AgentRunPrismaRepository,
  RunEventPrismaRepository,
  UsageQueryPrismaRepository,
} from "../../packages/agent-runtime/repositories/prisma";
import { resolveBudget } from "../../packages/agent-runtime/budget";

let dbAvailable = false;
let prisma: PrismaClient;
let workspaceId = "";
let otherWorkspaceId = "";
let agents: AgentPrismaRepository;
let runs: AgentRunPrismaRepository;
let events: RunEventPrismaRepository;
let usage: UsageQueryPrismaRepository;

function itDb(name: string, fn: (t: TestContext) => Promise<void>): void {
  test(name, async (t) => {
    if (!dbAvailable) {
      t.skip("DATABASE_URL not reachable — skipping integration test.");
      return;
    }
    await fn(t);
  });
}

before(async () => {
  if (!process.env.DATABASE_URL) return;
  try {
    prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }
  const stamp = Date.now();
  const ws = await prisma.workspace.create({ data: { name: "Agent IT", slug: `agent-it-${stamp}` } });
  const other = await prisma.workspace.create({ data: { name: "Other", slug: `agent-it-other-${stamp}` } });
  workspaceId = ws.id;
  otherWorkspaceId = other.id;
  agents = new AgentPrismaRepository(prisma);
  runs = new AgentRunPrismaRepository(prisma);
  events = new RunEventPrismaRepository(prisma);
  usage = new UsageQueryPrismaRepository(prisma);
});

after(async () => {
  if (!dbAvailable) return;
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.workspace.delete({ where: { id: otherWorkspaceId } }).catch(() => {});
  await prisma.$disconnect();
});

itDb("worker columns roundtrip through the Agent repository", async () => {
  const created = await prisma.agent.create({
    data: {
      workspaceId,
      name: "Research Worker",
      slug: "research-worker",
      description: "Researches things thoroughly for the integration test.",
      workerType: "research",
      goal: "Map the competitive landscape.",
      instructions: "Prefer primary sources.",
      toolPolicy: { allow: ["http_request"], deny: [], allowDelegation: true },
      budget: { maxSteps: 5 },
      skills: ["web-research"],
      status: "SUPERVISED",
    },
  });
  const fetched = await agents.get(workspaceId, created.id);
  assert.ok(fetched);
  assert.equal(fetched.workerType, "research");
  assert.equal(fetched.goal, "Map the competitive landscape.");
  assert.deepEqual((fetched.budget as { maxSteps: number }).maxSteps, 5);
  assert.equal((fetched.toolPolicy as { allowDelegation: boolean }).allowDelegation, true);
  assert.equal(fetched.runCount, 0);

  await agents.incrementRunCount(created.id, 2);
  assert.equal((await agents.get(workspaceId, created.id))!.runCount, 2);

  // Cross-workspace reads are denied by scoping.
  assert.equal(await agents.get(otherWorkspaceId, created.id), null);
});

itDb("run creation carries orchestration columns + progress goal", async () => {
  const agent = await prisma.agent.findFirstOrThrow({ where: { workspaceId, slug: "research-worker" } });
  const budget = resolveBudget({ maxSteps: 5 });
  const run = await runs.create({
    agentId: agent.id,
    workspaceId,
    mode: "LIVE",
    triggerSource: "integration-test",
    budgetSnapshot: budget,
    goalSnapshot: "PREAMBLE\n\nGOAL:\nMap it.",
    progress: { goal: "PREAMBLE\n\nGOAL:\nMap it." },
  });
  assert.equal(run.status, "QUEUED");
  assert.equal(run.depth, 0);
  assert.equal(run.cancelRequested, false);
  assert.equal((run.progress as { goal: string }).goal.includes("Map it."), true);

  const children = await runs.list(workspaceId, { agentId: agent.id });
  assert.equal(children.length, 1);
});

itDb("status transition guard rejects wrong-source updates", async () => {
  const agent = await prisma.agent.findFirstOrThrow({ where: { workspaceId, slug: "research-worker" } });
  const run = (await runs.list(workspaceId, { agentId: agent.id, limit: 1 }))[0];

  // QUEUED → RUNNING claims the run; a second claim must fail.
  assert.equal(await runs.transition(run.id, ["QUEUED"], "RUNNING", { startedAt: new Date() }), true);
  assert.equal(await runs.transition(run.id, ["QUEUED"], "RUNNING"), false);
  // RUNNING → NEEDS_APPROVAL is legal.
  assert.equal(await runs.transition(run.id, ["RUNNING"], "NEEDS_APPROVAL"), true);
});

itDb("run.finish persists output, error class and usage totals", async () => {
  const agent = await prisma.agent.findFirstOrThrow({ where: { workspaceId, slug: "research-worker" } });
  const run = (await runs.list(workspaceId, { agentId: agent.id, limit: 1 }))[0];
  await runs.finish(run.id, {
    status: "SUCCEEDED",
    output: { reflection: "done", steps: [] },
    error: null,
    errorClass: null,
    tokensUsed: 42,
    stepsExecuted: 3,
  });
  const done = (await runs.get(workspaceId, run.id))!;
  assert.equal(done.status, "SUCCEEDED");
  assert.equal(done.tokensUsed, 42);
  assert.equal(done.stepsExecuted, 3);
  assert.ok(done.finishedAt);
});

itDb("idempotency key is unique per agent; NULLs coexist", async () => {
  const agent = await prisma.agent.findFirstOrThrow({ where: { workspaceId, slug: "research-worker" } });
  const budget = resolveBudget({});
  const base = {
    agentId: agent.id, workspaceId, mode: "LIVE" as const, triggerSource: "it",
    budgetSnapshot: budget, goalSnapshot: "g",
  };
  const first = await runs.create({ ...base, idempotencyKey: "key-1" });
  await assert.rejects(
    () => runs.create({ ...base, idempotencyKey: "key-1" }),
    /unique/i
  );
  // Two NULL keys coexist (Postgres distinct-NULL semantics).
  const n1 = await runs.create({ ...base });
  const n2 = await runs.create({ ...base });
  assert.notEqual(n1.id, n2.id);
  assert.equal((await runs.findByIdempotency(agent.id, "key-1"))!.id, first.id);
});

itDb("delegation parent relation + depth; SET NULL on parent delete", async () => {
  const agent = await prisma.agent.findFirstOrThrow({ where: { workspaceId, slug: "research-worker" } });
  const budget = resolveBudget({});
  const parent = await runs.create({ agentId: agent.id, workspaceId, mode: "LIVE", triggerSource: "manual", budgetSnapshot: budget, goalSnapshot: "p" });
  const child = await runs.create({ agentId: agent.id, workspaceId, mode: "LIVE", triggerSource: `delegate:${parent.id}`, budgetSnapshot: budget, goalSnapshot: "c", parentRunId: parent.id, depth: 1 });
  const children = await runs.listChildren(parent.id);
  assert.equal(children.length, 1);
  assert.equal(children[0].id, child.id);
  assert.equal(children[0].depth, 1);

  // Parent row deleted → parentRunId goes NULL (evidence stays).
  await prisma.agentRun.delete({ where: { id: parent.id } });
  const orphan = await runs.get(workspaceId, child.id);
  assert.equal(orphan!.parentRunId, null);
});

itDb("requestCancel flips the flag only on non-terminal runs", async () => {
  const agent = await prisma.agent.findFirstOrThrow({ where: { workspaceId, slug: "research-worker" } });
  const budget = resolveBudget({});
  const run = await runs.create({ agentId: agent.id, workspaceId, mode: "LIVE", triggerSource: "manual", budgetSnapshot: budget, goalSnapshot: "c" });
  assert.equal(await runs.requestCancel(workspaceId, run.id), true);
  assert.equal((await runs.get(workspaceId, run.id))!.cancelRequested, true);

  const terminal = await runs.create({ agentId: agent.id, workspaceId, mode: "LIVE", triggerSource: "manual", budgetSnapshot: budget, goalSnapshot: "d" });
  await runs.finish(terminal.id, { status: "FAILED", error: "x" });
  assert.equal(await runs.requestCancel(workspaceId, terminal.id), false);

  // Cross-workspace cancel requests are scoped out.
  assert.equal(await runs.requestCancel(otherWorkspaceId, run.id), false);
});

itDb("run events append + cursor-ordered list", async () => {
  const agent = await prisma.agent.findFirstOrThrow({ where: { workspaceId, slug: "research-worker" } });
  const run = (await runs.list(workspaceId, { agentId: agent.id, limit: 1 }))[0];
  await events.append({ runId: run.id, type: "run_started", message: "started" });
  await new Promise((r) => setTimeout(r, 5));
  const second = await events.append({ runId: run.id, type: "step_done", message: "step", payload: { index: 0 } });

  const all = await events.list(run.id);
  assert.ok(all.length >= 2);
  const cursor = await events.list(run.id, { afterTs: all[all.length - 2].ts });
  assert.deepEqual(cursor.map((e) => e.id), [second.id]);

  // Messages are length-capped.
  const long = await events.append({ runId: run.id, type: "note", message: "x".repeat(5000) });
  assert.equal(long.message.length, 2000);
});

itDb("usage rollup by requestId attribution", async () => {
  const agent = await prisma.agent.findFirstOrThrow({ where: { workspaceId, slug: "research-worker" } });
  const run = (await runs.list(workspaceId, { agentId: agent.id, limit: 1 }))[0];
  const requestId = `run:${run.id}`;
  await prisma.aiUsageEvent.create({
    data: {
      workspaceId, kind: "CHAT", provider: "test", model: "t-1",
      promptTokens: 10, completionTokens: 5, totalTokens: 15, costMicros: 700n, requestId,
    },
  });
  await prisma.aiUsageEvent.create({
    data: {
      workspaceId, kind: "CHAT", provider: "test", model: "t-1",
      totalTokens: 20, costMicros: 300n, requestId,
    },
  });
  const sum = await usage.sumByRequestId(workspaceId, requestId);
  assert.equal(sum.tokens, 35);
  assert.equal(sum.costMicros, 1000);

  const none = await usage.sumByRequestId(workspaceId, "run:does-not-exist");
  assert.deepEqual(none, { tokens: 0, costMicros: 0 });
});

itDb("listSchedulable returns only active SCHEDULE agents with cron set", async () => {
  await prisma.agent.create({
    data: {
      workspaceId, name: "Nightly Worker", slug: "nightly-worker",
      description: "Runs on a schedule for the integration test.",
      trigger: "SCHEDULE", schedule: "0 3 * * *", status: "AUTONOMOUS",
    },
  });
  await prisma.agent.create({
    data: {
      workspaceId, name: "Paused Worker", slug: "paused-worker",
      description: "Paused so it must not be scheduled in the test.",
      trigger: "SCHEDULE", schedule: "0 3 * * *", status: "PAUSED",
    },
  });
  const schedulable = await agents.listSchedulable(new Date());
  const slugs = schedulable.map((a) => a.slug);
  assert.ok(slugs.includes("nightly-worker"));
  assert.ok(!slugs.includes("paused-worker"));
});

itDb("listStaleRunning / listStaleQueued window + status filters", async () => {
  const agent = await prisma.agent.findFirstOrThrow({ where: { workspaceId, slug: "research-worker" } });
  const base = { agentId: agent.id, workspaceId, mode: "LIVE" as const, triggerSource: "test" };
  const old = new Date(Date.now() - 10 * 60_000);
  const recent = new Date(Date.now() - 5_000);

  const zombie = await prisma.agentRun.create({ data: { ...base, status: "RUNNING", startedAt: old } });
  const healthy = await prisma.agentRun.create({ data: { ...base, status: "RUNNING", startedAt: recent } });
  const lostQueue = await prisma.agentRun.create({ data: { ...base, status: "QUEUED", createdAt: old } });
  const freshQueue = await prisma.agentRun.create({ data: { ...base, status: "QUEUED", createdAt: recent } });
  const terminal = await prisma.agentRun.create({ data: { ...base, status: "SUCCEEDED", startedAt: old, finishedAt: old } });

  const cutoff = new Date(Date.now() - 60_000);
  const staleRunning = await runs.listStaleRunning(cutoff);
  const runningIds = staleRunning.map((r) => r.id);
  assert.ok(runningIds.includes(zombie.id), "old RUNNING row is stale");
  assert.ok(!runningIds.includes(healthy.id), "recent RUNNING row is fresh");
  assert.ok(!runningIds.includes(terminal.id), "terminal rows never appear");

  const staleQueued = await runs.listStaleQueued(new Date(Date.now() - 120_000));
  const queuedIds = staleQueued.map((r) => r.id);
  assert.ok(queuedIds.includes(lostQueue.id));
  assert.ok(!queuedIds.includes(freshQueue.id));

  await prisma.agentRun.deleteMany({ where: { id: { in: [zombie.id, healthy.id, lostQueue.id, freshQueue.id, terminal.id] } } });
});
