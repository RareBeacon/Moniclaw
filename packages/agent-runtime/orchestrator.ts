/**
 * WorkerOrchestrator — run lifecycle for AI Workers.
 *
 * Queue → plan (Phase 3 Planner) → execute with budget metering, kill-switch
 * polling and per-step events → optional human-approval parking (Approval
 * table, run-linked) → resume → synthesize output (research reports) →
 * finish. Every external concern sits behind a port; orchestration logic
 * holds no framework, SDK or SQL dependencies.
 */
import type { ApprovalGate, PlanSnapshot, PlanRunResult, StepTrace } from "@runtime/planner/planner";
import type { ToolRegistry } from "@runtime/tools/tool";

import { AgentError, toAgentError } from "./errors";
import { createDelegateTool, type DelegateArgs, type DelegationHandle } from "./delegation";
import { BudgetMeter, resolveBudget } from "./budget";
import { cronDue } from "./cron";
import { PolicyToolRegistry, resolveToolPolicy } from "./policy";
import { digestTrace, preambleFor, sourcesFromTrace } from "./research";
import type {
  AgentQueuePort, AgentRateLimiterPort, AgentRepository, AgentRunCreateInput,
  AgentRunRepository, AgentRunRow, AgentRunStatus, ApprovalBridgePort, AuditSinkPort,
  ClockPort, PlanGatePort, PlannerCtx, PlannerPort, RunEventRepository, SynthesizerPort, UsageQueryPort,
} from "./ports";
import { runOutputSchema, type RunOutput, type WorkerBudget } from "./types";
import { creditsForRun } from "./credits";

export interface OrchestratorDeps {
  agents: AgentRepository;
  runs: AgentRunRepository;
  events: RunEventRepository;
  approvals: ApprovalBridgePort;
  usage: UsageQueryPort;
  audit: AuditSinkPort;
  queue: AgentQueuePort;
  rate: AgentRateLimiterPort;
  clock: ClockPort;
  registry: ToolRegistry;
  synthesizer: SynthesizerPort;
  /** Per-run planner factory (binds filtered registry + hooks + gate). */
  buildPlanner: (opts: {
    registry: PolicyToolRegistry;
    hooks: import("@runtime/planner/planner").PlannerHooks;
    gate: ApprovalGate;
  }) => PlannerPort;
  /** Workspace AI tool-enablement map (mirrors dashboard AI settings). */
  workspaceToolPermissions: (workspaceId: string) => Promise<Record<string, boolean>>;
  /** Monthly plan-credit gate (Phase 10) — root dispatches only. */
  planGate?: PlanGatePort;
}

export interface DispatchParams {
  workspaceId: string;
  agentId?: string;
  agentSlug?: string;
  byUserId?: string | null;
  triggerSource?: string;
  goal?: string;
  data?: Record<string, unknown>;
  mode?: "LIVE" | "SHADOW";
  idempotencyKey?: string | null;
  parentRunId?: string | null;
  depth?: number;
  /** Shared budget enforced on child runs instead of the agent's own. */
  budgetOverride?: Partial<WorkerBudget>;
}

const TERMINAL: AgentRunStatus[] = ["SUCCEEDED", "FAILED", "CANCELED"];

export class WorkerOrchestrator implements DelegationHandle {
  constructor(private readonly deps: OrchestratorDeps) {}

  // ── Dispatch ──────────────────────────────────────────────────────────

  async dispatch(params: DispatchParams): Promise<{ run: AgentRunRow; deduplicated: boolean }> {
    const agent = params.agentId
      ? await this.deps.agents.get(params.workspaceId, params.agentId)
      : params.agentSlug
        ? await this.deps.agents.getBySlug(params.workspaceId, params.agentSlug)
        : null;
    if (!agent) throw new AgentError("not_found", "Agent not found in this workspace.");
    if (agent.status === "PAUSED" || agent.status === "ARCHIVED" || agent.status === "DRAFT") {
      throw new AgentError("agent_unavailable", `Agent "${agent.name}" cannot take runs while ${agent.status}.`);
    }

    // Idempotency: a key that already ran returns the original run.
    if (params.idempotencyKey) {
      const existing = await this.deps.runs.findByIdempotency(agent.id, params.idempotencyKey);
      if (existing) return { run: existing, deduplicated: true };
    }

    const goal = this.composeGoal(agent, params.goal, params.data);
    if (!goal) {
      throw new AgentError("validation", `Agent "${agent.name}" has no goal; pass one at dispatch or save one on the agent.`);
    }

    const budget = resolveBudget(agent.budget);
    if (params.budgetOverride) {
      budget.maxTokens = Math.min(budget.maxTokens, params.budgetOverride.maxTokens ?? budget.maxTokens);
      budget.maxCostMicros = Math.min(budget.maxCostMicros, params.budgetOverride.maxCostMicros ?? budget.maxCostMicros);
      budget.maxSteps = Math.min(budget.maxSteps, params.budgetOverride.maxSteps ?? budget.maxSteps);
      budget.maxDepth = Math.min(budget.maxDepth, params.budgetOverride.maxDepth ?? budget.maxDepth);
    }

    // Concurrency cap per agent.
    const active = await this.deps.runs.countActiveByAgent(agent.id);
    if (active >= budget.maxConcurrentRuns) {
      throw new AgentError("run_conflict", `Agent "${agent.name}" already has ${active} active run(s) (cap ${budget.maxConcurrentRuns}).`);
    }
    await this.deps.rate.check(`agents-run:${params.workspaceId}`);

    // Monthly plan-credit gate: refuse NEW root runs once the workspace's
    // metering month is spent. Delegated children are exempt — they draw on
    // the parent's shared budget and would otherwise double-pay.
    if (!params.parentRunId && this.deps.planGate) {
      const verdict = await this.deps.planGate.checkRootDispatch(params.workspaceId);
      if (!verdict.allowed) {
        throw new AgentError(
          "budget_exceeded",
          verdict.message ?? "This workspace's monthly plan credits are exhausted."
        );
      }
    }

    // DRAFT-less statuses still gate mode: SHADOW/DRAFT agents always shadow.
    const mode: "LIVE" | "SHADOW" =
      agent.status === "SHADOW" ? "SHADOW" : (params.mode ?? "LIVE");

    let run: AgentRunRow;
    try {
      run = await this.deps.runs.create({
        agentId: agent.id,
        workspaceId: params.workspaceId,
        mode,
        triggerSource: params.triggerSource ?? "manual",
        parentRunId: params.parentRunId ?? null,
        depth: params.depth ?? 0,
        budgetSnapshot: budget,
        goalSnapshot: goal,
        idempotencyKey: params.idempotencyKey ?? null,
        progress: { goal },
      } satisfies AgentRunCreateInput);
    } catch (err) {
      // Unique (agentId, idempotencyKey) raced — return the winner's run.
      if (params.idempotencyKey && /unique|duplicate/i.test(String((err as Error)?.message))) {
        const existing = await this.deps.runs.findByIdempotency(agent.id, params.idempotencyKey);
        if (existing) return { run: existing, deduplicated: true };
      }
      throw err;
    }

    await this.deps.events.append({
      runId: run.id, type: "run_queued",
      message: `Run queued for "${agent.name}" (${mode}, trigger: ${run.triggerSource}).`,
      payload: { mode, triggerSource: run.triggerSource, depth: run.depth },
    });
    await this.deps.audit.log({
      workspaceId: params.workspaceId, actorId: params.byUserId ?? null,
      action: "agent.run.dispatch", target: agent.id,
      metadata: { runId: run.id, mode, trigger: run.triggerSource, goal: goal.slice(0, 200) },
    });

    this.deps.queue.enqueue(run.id, async () => { await this.executeRun(run.id); });
    void this.deps.queue.drain().catch((err) => console.warn("[agents] drain:", (err as Error).message));
    return { run, deduplicated: false };
  }

  // ── Execution lifecycle ────────────────────────────────────────────────

  async executeRun(runId: string): Promise<AgentRunRow | null> {
    const run = await this.loadRun(runId);
    if (!run || TERMINAL.includes(run.status)) return run;
    const agent = await this.deps.agents.get(run.workspaceId, run.agentId);
    if (!agent) return run;

    const claimed = await this.deps.runs.transition(run.id, ["QUEUED"], "RUNNING", { startedAt: this.deps.clock.now() });
    if (!claimed && run.status !== "RUNNING") return run; // owned elsewhere

    const meter = new BudgetMeter(resolveBudget(run.budgetSnapshot));
    const goal = this.extractGoal(run);
    const events = this.deps.events;
    await events.append({ runId: run.id, type: "run_started", message: `Run started for "${agent.name}".`, payload: {} });

    const baseCtx: PlannerCtx = {
      workspaceId: run.workspaceId,
      userId: null,
      agentId: agent.id,
      requestId: `run:${run.id}`,
      toolPermissions: await this.deps.workspaceToolPermissions(run.workspaceId),
    };

    const policy = resolveToolPolicy(agent.toolPolicy);
    const extraTools = policy.allowDelegation
      ? [createDelegateTool(this, { runId: run.id, agentId: agent.id, workspaceId: run.workspaceId })]
      : [];
    const registry = new PolicyToolRegistry(this.deps.registry, policy, {
      workerType: String(agent.workerType ?? "general"),
      shadow: run.mode === "SHADOW",
      extraTools,
    });

    let usageCarry = { tokens: 0, costMicros: 0 };
    const pullUsage = async () => {
      const sum = await this.deps.usage.sumByRequestId(run.workspaceId, `run:${run.id}`);
      meter.recordUsage({ tokens: sum.tokens - usageCarry.tokens, costMicros: sum.costMicros - usageCarry.costMicros });
      usageCarry = sum;
    };

    const hooks = {
      onStepStart: async (index: number, step: { description: string; tool?: string }) => {
        await events.append({ runId: run.id, type: "step_start", message: step.description.slice(0, 240), payload: { index, tool: step.tool ?? null } });
        const fresh = await this.deps.runs.get(run.workspaceId, run.id);
        if (fresh?.cancelRequested) throw new AgentError("cancelled", "Run canceled by operator.");
        meter.assertWithin();
      },
      onStepDone: async (index: number, trace: StepTrace) => {
        meter.recordStep();
        await pullUsage();
        await this.deps.runs.setStepsExecuted(run.id, meter.snapshot().steps);
        await events.append({
          runId: run.id, type: "step_done",
          message: `${trace.status}: ${trace.step.description.slice(0, 200)}`,
          payload: { index, tool: trace.step.tool ?? null, attempts: trace.attempts, error: trace.error ?? null },
        });
        meter.assertWithin();
      },
    };

    const gate: ApprovalGate = {
      request: async ({ step, stepIndex }) => {
        const approval = await this.deps.approvals.create({
          workspaceId: run.workspaceId, runId: run.id, agentName: agent.name,
          goal, stepDescription: step.description, stepIndex,
        });
        return { approvalId: approval.approvalId };
      },
    };

    const planner = this.deps.buildPlanner({ registry, hooks, gate });

    try {
      const result: PlanRunResult = await planner.run(baseCtx, goal);
      await pullUsage();
      return await this.conclude(run, agent, result, meter, baseCtx);
    } catch (err) {
      await pullUsage();
      return await this.abort(run, agent, err, meter);
    }
  }

  // ── Resume after human approval ─────────────────────────────────────────

  async resumeRun(workspaceId: string, runId: string, byUserId?: string | null): Promise<AgentRunRow> {
    const run = await this.deps.runs.get(workspaceId, runId);
    if (!run) throw new AgentError("not_found", "Run not found.");
    if (run.status !== "NEEDS_APPROVAL") {
      throw new AgentError("run_conflict", `Run is ${run.status}, not awaiting approval.`);
    }
    const snapshot = this.extractSnapshot(run);
    if (!snapshot.approvalId) throw new AgentError("internal", "Parked run is missing its approval link.");

    const decision = await this.deps.approvals.statusOf(snapshot.approvalId);
    if (decision !== "APPROVED") {
      if (decision === "REJECTED" || decision === "EXPIRED") {
        await this.finishRun(run, "FAILED", null, `Approval ${decision.toLowerCase()}.`, "approval_rejected", 0);
        return (await this.deps.runs.get(workspaceId, runId))!;
      }
      throw new AgentError("needs_approval", "Approval is still pending.");
    }

    const agent = await this.deps.agents.get(workspaceId, run.agentId);
    if (!agent) throw new AgentError("internal", "Agent vanished mid-run.");

    await this.deps.runs.transition(run.id, ["NEEDS_APPROVAL"], "RUNNING", {});
    await this.deps.events.append({ runId: run.id, type: "approval_resumed", message: "Approval granted — run resumed.", payload: { approvalId: snapshot.approvalId } });
    await this.deps.audit.log({ workspaceId, actorId: byUserId ?? null, action: "agent.run.resume", target: run.agentId, metadata: { runId: run.id } });

    const meter = new BudgetMeter(resolveBudget(run.budgetSnapshot));
    // Carry prior consumption forward — only steps that actually executed
    // (the awaiting_approval placeholder has not executed yet).
    const executed = snapshot.trace.filter((t) => t.status !== "awaiting_approval");
    for (let i = 0; i < executed.length; i++) meter.recordStep();
    const goal = snapshot.goal;
    const baseCtx: PlannerCtx = {
      workspaceId, userId: null, agentId: agent.id,
      requestId: `run:${run.id}`,
      toolPermissions: await this.deps.workspaceToolPermissions(workspaceId),
    };
    const policy = resolveToolPolicy(agent.toolPolicy);
    const extraTools = policy.allowDelegation
      ? [createDelegateTool(this, { runId: run.id, agentId: agent.id, workspaceId })]
      : [];
    const registry = new PolicyToolRegistry(this.deps.registry, policy, {
      workerType: String(agent.workerType ?? "general"), shadow: run.mode === "SHADOW", extraTools,
    });

    let usageCarry = await this.deps.usage.sumByRequestId(workspaceId, `run:${run.id}`);
    const pullUsage = async () => {
      const sum = await this.deps.usage.sumByRequestId(workspaceId, `run:${run.id}`);
      meter.recordUsage({ tokens: sum.tokens - usageCarry.tokens, costMicros: sum.costMicros - usageCarry.costMicros });
      usageCarry = sum;
    };
    const hooks = {
      onStepStart: async (index: number, step: { description: string; tool?: string }) => {
        await this.deps.events.append({ runId: run.id, type: "step_start", message: step.description.slice(0, 240), payload: { index, tool: step.tool ?? null } });
        const fresh = await this.deps.runs.get(workspaceId, run.id);
        if (fresh?.cancelRequested) throw new AgentError("cancelled", "Run canceled by operator.");
        meter.assertWithin();
      },
      onStepDone: async (index: number, trace: StepTrace) => {
        meter.recordStep();
        await pullUsage();
        await this.deps.runs.setStepsExecuted(run.id, meter.snapshot().steps);
        await this.deps.events.append({
          runId: run.id, type: "step_done",
          message: `${trace.status}: ${trace.step.description.slice(0, 200)}`,
          payload: { index, tool: trace.step.tool ?? null, attempts: trace.attempts, error: trace.error ?? null },
        });
        meter.assertWithin();
      },
    };
    const gate: ApprovalGate = {
      request: async ({ step, stepIndex }) => this.deps.approvals.create({
        workspaceId, runId: run.id, agentName: agent.name, goal, stepDescription: step.description, stepIndex,
      }),
    };
    const planner = this.deps.buildPlanner({ registry, hooks, gate });

    try {
      const result = await planner.resume(baseCtx, snapshot);
      await pullUsage();
      return await this.conclude(run, agent, result, meter, baseCtx);
    } catch (err) {
      await pullUsage();
      return await this.abort(run, agent, err, meter);
    }
  }

  // ── Kill switch ──────────────────────────────────────────────────────────

  async cancelRun(workspaceId: string, runId: string, byUserId?: string | null): Promise<AgentRunRow> {
    const run = await this.deps.runs.get(workspaceId, runId);
    if (!run) throw new AgentError("not_found", "Run not found.");
    if (TERMINAL.includes(run.status)) return run;

    await this.deps.runs.requestCancel(workspaceId, runId);
    await this.deps.events.append({ runId, type: "cancel_requested", message: "Cancellation requested.", payload: {} });
    await this.deps.audit.log({ workspaceId, actorId: byUserId ?? null, action: "agent.run.cancel", target: run.agentId, metadata: { runId } });

    if (run.status === "QUEUED" || run.status === "NEEDS_APPROVAL") {
      // Not executing right now → cancel immediately.
      await this.finishRun(run, "CANCELED", null, "Canceled by operator.", "cancelled", 0);
      return (await this.deps.runs.get(workspaceId, runId))!;
    }
    return run; // RUNNING: the step hook will halt it at the next boundary.
  }

  // ── Delegation ─────────────────────────────────────────────────────────

  async delegate(
    parent: { runId: string; agentId: string; workspaceId: string },
    args: DelegateArgs
  ): Promise<{ runId: string; agentId: string; status: string; summary: string }> {
    const parentRun = await this.deps.runs.get(parent.workspaceId, parent.runId);
    if (!parentRun) throw new AgentError("not_found", "Parent run not found.");
    const parentBudget = resolveBudget(parentRun.budgetSnapshot);
    const childDepth = parentRun.depth + 1;
    if (childDepth > parentBudget.maxDepth) {
      throw new AgentError("delegation_denied", `Delegation depth cap reached (${parentBudget.maxDepth}).`);
    }
    // Cycle prevention: never delegate to self or any ancestor.
    let cursor: AgentRunRow | null = parentRun;
    const lineage = new Set<string>([parent.agentId]);
    while (cursor?.parentRunId) {
      cursor = await this.deps.runs.get(parent.workspaceId, cursor.parentRunId);
      if (cursor) lineage.add(cursor.agentId);
    }
    const child = await this.deps.agents.getBySlug(parent.workspaceId, args.agent)
      ?? await this.deps.agents.get(parent.workspaceId, args.agent);
    if (!child) throw new AgentError("not_found", `Delegate target "${args.agent}" not found.`);
    if (lineage.has(child.id)) {
      throw new AgentError("delegation_denied", `Delegation cycle blocked: "${child.name}" is already in this run's lineage.`);
    }

    const meter = new BudgetMeter(parentBudget);
    const usage = await this.deps.usage.sumByRequestId(parent.workspaceId, `run:${parent.runId}`);
    meter.recordUsage(usage);
    const share = meter.shareForChild();
    if (share.maxTokens <= 0 || share.maxCostMicros <= 0) {
      throw new AgentError("budget_exceeded", "Parent run has no budget left to share.");
    }

    await this.deps.events.append({
      runId: parent.runId, type: "delegate_start",
      message: `Delegating to "${child.name}": ${args.goal.slice(0, 160)}`, payload: { agentId: child.id },
    });

    const { run } = await this.dispatch({
      workspaceId: parent.workspaceId,
      agentId: child.id,
      triggerSource: `delegate:${parent.runId}`,
      goal: args.goal,
      data: args.data,
      mode: parentRun.mode === "SHADOW" ? "SHADOW" : undefined,
      parentRunId: parent.runId,
      depth: childDepth,
      budgetOverride: {
        maxTokens: Math.min(share.maxTokens, resolveBudget(child.budget).maxTokens),
        maxCostMicros: Math.min(share.maxCostMicros, resolveBudget(child.budget).maxCostMicros),
        maxDepth: parentBudget.maxDepth,
      },
    });

    // Synchronous execution of the child within the parent's step.
    const finished = await this.executeRun(run.id);
    const finalRun = finished ?? (await this.deps.runs.get(parent.workspaceId, run.id))!;
    const output = runOutputSchema.safeParse(finalRun.output ?? {});
    const summary = output.success
      ? (output.data.report?.summary ?? output.data.reflection ?? finalRun.error ?? "").slice(0, 480)
      : (finalRun.error ?? "").slice(0, 480);

    await this.deps.events.append({
      runId: parent.runId, type: "delegate_done",
      message: `Delegate "${child.name}" finished ${finalRun.status}.`,
      payload: { agentId: child.id, childRunId: finalRun.id, status: finalRun.status },
    });
    if (TERMINAL.includes(finalRun.status) && finalRun.status !== "SUCCEEDED") {
      throw new AgentError("upstream_failed", `Delegated run ${finalRun.status.toLowerCase()}: ${finalRun.error ?? "no detail"}`, { childRunId: finalRun.id });
    }
    return { runId: finalRun.id, agentId: child.id, status: finalRun.status, summary };
  }

  // ── Scheduler tick ──────────────────────────────────────────────────────

  /**
   * Scheduler heartbeat: (1) reap zombie RUNNING rows past their wall-clock
   * budget — on serverless the owning lambda can freeze mid-run, and without
   * a reaper the row would never terminate; (2) rescue QUEUED rows whose
   * dispatch job was lost between create and drain; (3) dispatch due cron
   * workers. Safe to call every minute.
   */
  async tick(now: Date): Promise<{ dispatched: number; skipped: number; reaped: number; requeued: number }> {
    const reaped = await this.reapStaleRuns(now);
    const requeued = await this.rescueStaleQueued(now);
    const agents = await this.deps.agents.listSchedulable(now);
    let dispatched = 0, skipped = 0;
    for (const agent of agents) {
      if (!agent.schedule) continue;
      let due: Date | null = null;
      try {
        due = cronDue(agent.schedule, agent.lastScheduledAt, now);
      } catch {
        skipped++; // invalid cron — operator error, don't crash the sweep
        continue;
      }
      await this.deps.agents.touchLastScheduled(agent.id, now);
      if (!due) { skipped++; continue; }
      try {
        await this.dispatch({
          workspaceId: agent.workspaceId,
          agentId: agent.id,
          triggerSource: "schedule",
          idempotencyKey: `cron:${agent.id}:${due.toISOString().slice(0, 16)}`,
        });
        dispatched++;
      } catch (err) {
        skipped++;
        console.warn(`[agents] schedule dispatch failed for ${agent.id}:`, (err as Error).message);
      }
    }
    return { dispatched, skipped, reaped, requeued };
  }

  /**
   * Zombie reaper. A RUNNING row whose own wall-clock budget has passed can
   * no longer finish (its compute context is gone) — terminate it honestly
   * instead of letting it hang in RUNNING forever. Rows still inside their
   * budget are untouched, so a healthy long run is never killed.
   */
  private async reapStaleRuns(now: Date): Promise<number> {
    const stale = await this.deps.runs.listStaleRunning(new Date(now.getTime() - 15_000), 100);
    let reaped = 0;
    for (const run of stale) {
      const budget = resolveBudget(run.budgetSnapshot);
      const startedAt = run.startedAt ? new Date(run.startedAt).getTime() : null;
      if (startedAt === null || startedAt + budget.maxDurationMs > now.getTime()) continue;
      const moved = await this.deps.runs.transition(run.id, ["RUNNING"], "FAILED");
      if (!moved) continue; // finished naturally between the sweep and the write
      const message = `Run reaped by scheduler: wall-clock budget (${Math.round(budget.maxDurationMs / 1000)}s) exhausted.`;
      await this.finishRun(run, "FAILED", null, message, "budget_exceeded", run.stepsExecuted, run.tokensUsed);
      await this.deps.events.append({
        runId: run.id,
        type: "run_failed",
        message,
        payload: { class: "budget_exceeded", reaper: "tick" },
      });
      await this.deps.audit.log({
        workspaceId: run.workspaceId,
        actorId: null,
        action: "agent.run.failed",
        target: run.agentId,
        metadata: { runId: run.id, class: "budget_exceeded", reaper: "tick" },
      });
      reaped += 1;
    }
    return reaped;
  }

  /**
   * Dispatch recovery. A QUEUED row older than the grace window lost its
   * in-memory job (e.g. platform restarted the instance right after the 202
   * response). Re-enqueueing is safe: executeRun's QUEUED→RUNNING transition
   * is the single-writer guard, so a row that is picked up twice still
   * executes at most once.
   */
  private async rescueStaleQueued(now: Date): Promise<number> {
    const stale = await this.deps.runs.listStaleQueued(new Date(now.getTime() - 120_000), 100);
    let requeued = 0;
    for (const run of stale) {
      await this.deps.events.append({
        runId: run.id,
        type: "run_queued",
        message: "Re-queued by scheduler sweep (dispatch recovery).",
        payload: { requeue: true },
      });
      this.deps.queue.enqueue(run.id, async () => { await this.executeRun(run.id); });
      requeued += 1;
    }
    if (requeued > 0) {
      void this.deps.queue.drain().catch((err) => console.warn("[agents] drain:", (err as Error).message));
    }
    return requeued;
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private async loadRun(runId: string): Promise<AgentRunRow | null> {
    // Runs are always loaded workspace-scoped elsewhere; internal jobs keep
    // only the id, so resolve via children/id lookup by the repo contract.
    return this.deps.runs.getInternal(runId);
  }

  private composeGoal(agent: { goal: string | null; instructions: string | null; workerType: string | null; description?: string | null }, override?: string, data?: Record<string, unknown>): string {
    // Legacy Phase-2 agents carry their brief in `description` — always runnable.
    const core = (override ?? agent.goal ?? agent.description ?? "").trim();
    if (!core) return "";
    const parts: string[] = [];
    const preamble = preambleFor(String(agent.workerType ?? "general"));
    if (preamble) parts.push(preamble);
    if (agent.instructions?.trim()) parts.push(`OPERATOR INSTRUCTIONS:\n${agent.instructions.trim()}`);
    parts.push(`GOAL:\n${core}`);
    if (data && Object.keys(data).length > 0) {
      parts.push(`INPUT DATA (JSON):\n${JSON.stringify(data).slice(0, 4000)}`);
    }
    return parts.join("\n\n");
  }

  private extractGoal(run: AgentRunRow): string {
    const progress = run.progress as { goal?: string } | null;
    if (progress?.goal) return progress.goal;
    // goal snapshot lives in progress from creation — set by create() via plan field? No:
    // repo stores it in `progress.goal` at creation time (see repositories impl).
    return progress?.goal ?? "";
  }

  private extractSnapshot(run: AgentRunRow): PlanSnapshot {
    const progress = run.progress as { snapshot?: PlanSnapshot } | null;
    if (!progress?.snapshot?.plan || !Array.isArray(progress.snapshot.trace)) {
      throw new AgentError("internal", "Parked run is missing its plan checkpoint.");
    }
    return progress.snapshot;
  }

  private async conclude(
    run: AgentRunRow,
    agent: { id: string; name: string; workerType: string },
    result: PlanRunResult,
    meter: BudgetMeter,
    ctx: PlannerCtx
  ): Promise<AgentRunRow> {
    const events = this.deps.events;

    if (result.status === "awaiting_approval") {
      const snapshot: PlanSnapshot = { goal: result.goal, plan: result.plan, trace: result.trace, approvalId: result.approvalId };
      await this.deps.runs.savePlan(run.id, result.plan);
      await this.deps.runs.saveProgress(run.id, { goal: result.goal, snapshot });
      await this.deps.runs.transition(run.id, ["RUNNING"], "NEEDS_APPROVAL", {});
      await events.append({
        runId: run.id, type: "approval_parked",
        message: "Run paused — a step requires human approval.",
        payload: { approvalId: result.approvalId, step: result.trace[result.trace.length - 1]?.step.description ?? "" },
      });
      return (await this.deps.runs.get(run.workspaceId, run.id))!;
    }

    // Output synthesis (research workers) — a synthesis failure does not
    // erase a successful run; the reflection is the fallback output.
    let report: RunOutput["report"] | undefined;
    if (result.status === "completed" && String(agent.workerType) === "research") {
      try {
        report = (await this.deps.synthesizer.synthesize(ctx, {
          goal: result.goal,
          stepDigest: digestTrace(result.trace),
          sources: sourcesFromTrace(result.trace),
        })) ?? undefined;
      } catch (err) {
        await events.append({
          runId: run.id, type: "note",
          message: `Report synthesis skipped: ${(err as Error).message.slice(0, 200)}`, payload: {},
        });
      }
    }

    const children = await this.deps.runs.listChildren(run.id);
    const steps = result.trace.map((t) => ({
      description: t.step.description.slice(0, 500),
      ...(t.step.tool ? { tool: t.step.tool } : {}),
      status: t.status,
      ...(t.error ? { error: t.error.slice(0, 500) } : {}),
    }));
    const output: RunOutput = runOutputSchema.parse({
      ...(result.reflection ? { reflection: result.reflection } : {}),
      ...(report ? { report } : {}),
      steps,
      ...(children.length > 0
        ? {
            delegatedRuns: children.map((c) => ({
              runId: c.id, agentId: c.agentId, status: c.status,
              summary: ((c.output as { reflection?: string } | null)?.reflection ?? c.error ?? "").slice(0, 500),
            })),
          }
        : {}),
    });

    const snapshot = meter.snapshot();
    if (result.status === "completed") {
      await this.finishRun(run, "SUCCEEDED", output, null, null, snapshot.steps, snapshot.tokens);
      await events.append({ runId: run.id, type: "run_succeeded", message: "Run completed.", payload: { steps: snapshot.steps, tokens: snapshot.tokens } });
    } else {
      await this.finishRun(run, "FAILED", output, "Plan execution failed — see trace.", "execution_failed", snapshot.steps, snapshot.tokens);
      await events.append({ runId: run.id, type: "run_failed", message: "Run failed during execution.", payload: {} });
    }
    try { meter.assertWithin(); } catch (err) {
      // Post-hoc budget breach: mark the run failed even though steps finished.
      await this.finishRun(run, "FAILED", output, (err as Error).message, "budget_exceeded", snapshot.steps, snapshot.tokens);
      await events.append({ runId: run.id, type: "budget_tripped", message: (err as Error).message, payload: snapshot as unknown as Record<string, unknown> });
    }
    return (await this.deps.runs.get(run.workspaceId, run.id))!;
  }

  private async abort(
    run: AgentRunRow,
    agent: { id: string },
    err: unknown,
    meter: BudgetMeter
  ): Promise<AgentRunRow> {
    const e = toAgentError(err);
    const snapshot = meter.snapshot();
    const status: AgentRunStatus = e.kind === "cancelled" ? "CANCELED" : "FAILED";
    await this.finishRun(run, status, null, e.message, e.kind, snapshot.steps, snapshot.tokens);
    await this.deps.events.append({
      runId: run.id,
      type: status === "CANCELED" ? "run_canceled" : "run_failed",
      message: e.message.slice(0, 400),
      payload: { class: e.kind, steps: snapshot.steps },
    });
    await this.deps.audit.log({
      workspaceId: run.workspaceId, actorId: null,
      action: status === "CANCELED" ? "agent.run.canceled" : "agent.run.failed",
      target: agent.id,
      metadata: { runId: run.id, class: e.kind, error: e.message.slice(0, 240) },
    });
    return (await this.deps.runs.get(run.workspaceId, run.id))!;
  }

  private async finishRun(
    run: AgentRunRow,
    status: AgentRunStatus,
    output: RunOutput | null,
    error: string | null,
    errorClass: string | null,
    steps: number,
    tokens?: number
  ): Promise<void> {
    await this.deps.runs.finish(run.id, {
      status, output, error, errorClass,
      stepsExecuted: steps || undefined,
      tokensUsed: tokens,
      // Metering accrual: one fn prices every terminal run (ZERO for
      // canceled/pre-work), the plan gate sums the same column.
      creditsUsed: creditsForRun({
        stepsExecuted: steps,
        tokensUsed: tokens ?? run.tokensUsed,
        status,
      }),
    });
    if (TERMINAL.includes(status)) {
      await this.deps.agents.incrementRunCount(run.agentId, 1);
    }
  }
}
