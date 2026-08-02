/**
 * Agent runtime container (app glue) — binds every Agent Runtime port to the
 * platform: Prisma repositories, Approval table, audit log, rate limiter,
 * in-process queue, and the Phase-3 engine (router/tools/executor) borrowed
 * from the AI Runtime DI container. Lazy singleton like the other runtimes.
 */
import { Planner, type PlanRunResult, type PlanSnapshot } from "@runtime/planner/planner";
import {
  ResearchSynthesizer,
  WorkerOrchestrator,
  buildAgentRepositories,
  type AgentQueuePort,
  type ApprovalBridgePort,
  type PlannerPort,
  type AgentRateLimiterPort,
} from "@agents/index";

import { waitUntil } from "@vercel/functions";

import { db } from "@/lib/db";
import { currentBillingPeriod, planGateDecision } from "@/lib/billing";
import { audit, type AuditAction } from "@/lib/audit";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getRuntime } from "@/lib/ai/runtime";

/**
 * FIFO queue with re-entrant-safe drain: concurrent drain() calls await
 * in-flight jobs rather than noticing an empty pending list and returning
 * early (verified by the orchestrator unit battery's FakeQueue twin).
 */
class InProcessRunQueue implements AgentQueuePort {
  private readonly pending: Array<{ runId: string; job: () => Promise<void> }> = [];
  private readonly active = new Set<Promise<void>>();

  constructor(private readonly concurrency: number) {}

  enqueue(runId: string, job: () => Promise<void>): void {
    this.pending.push({ runId, job });
  }

  async drain(): Promise<void> {
    const work = this.pump();
    // Serverless survival: on Vercel the function instance is frozen once the
    // HTTP response completes, which would strand every queued run. waitUntil
    // keeps the instance alive for the drain (bounded by the route's
    // maxDuration — longer runs are checkpointed and requeued/reaped by tick).
    // Outside Vercel this registers into a fallback context and is a no-op,
    // so local `next start` keeps its original fire-and-forget behavior.
    waitUntil(work.catch(() => {}));
    return work;
  }

  private async pump(): Promise<void> {
    while (true) {
      while (this.pending.length > 0 && this.active.size < this.concurrency) {
        const item = this.pending.shift()!;
        const p = (async () => { await item.job(); })();
        this.active.add(p);
        void p.catch(() => {}).finally(() => this.active.delete(p));
      }
      if (this.active.size === 0) return;
      await Promise.race(this.active);
    }
  }

  stats() {
    return { queued: this.pending.length, running: this.active.size, concurrency: this.concurrency };
  }
}

export interface AgentRuntimeBundle {
  orchestrator: WorkerOrchestrator;
  queue: InProcessRunQueue;
  repos: ReturnType<typeof buildAgentRepositories>;
}

let container: AgentRuntimeBundle | null = null;

export function getAgentRuntime(): AgentRuntimeBundle {
  if (container) return container;

  const repos = buildAgentRepositories(db);
  const queue = new InProcessRunQueue(Number(process.env.AGENT_QUEUE_CONCURRENCY ?? 2));

  const approvals: ApprovalBridgePort = {
    async create(input) {
      // Run-linked approval (Phase-2 model contract: runId relation).
      const approval = await db.approval.create({
        data: {
          workspaceId: input.workspaceId,
          runId: input.runId,
          actionType: "agent.step.approval",
          requestedTo: "workspace.manager",
          detail: {
            agentName: input.agentName,
            goal: input.goal.slice(0, 500),
            step: input.stepDescription.slice(0, 500),
            stepIndex: input.stepIndex,
          } as object,
          status: "PENDING",
        },
      });
      return { approvalId: approval.id };
    },
    async statusOf(approvalId) {
      const approval = await db.approval.findUnique({ where: { id: approvalId } });
      return (approval?.status as "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | undefined) ?? null;
    },
  };

  const rate: AgentRateLimiterPort = {
    async check(key) {
      const result = await rateLimit(key, RATE_LIMITS.agentsRun.limit, RATE_LIMITS.agentsRun.windowMs);
      if (!result.success) {
        const { AgentError } = await import("@agents/errors");
        throw new AgentError("run_conflict", "Too many worker runs — try again later.", { retryAfterSeconds: result.retryAfterSeconds });
      }
    },
  };

  const orchestrator = new WorkerOrchestrator({
    agents: repos.agents,
    runs: repos.runs,
    events: repos.events,
    approvals,
    usage: repos.usage,
    audit: {
      log: (input) =>
        audit({
          workspaceId: input.workspaceId,
          actorId: input.actorId ?? null,
          action: input.action as AuditAction,
          targetType: "agent",
          ...(input.target != null ? { targetId: input.target } : {}),
          metadata: input.metadata,
        }),
    },
    queue,
    rate,
    clock: { now: () => new Date() },
    registry: getRuntime().tools,
    synthesizer: new ResearchSynthesizer(getRuntime().router),
    buildPlanner: ({ registry, hooks, gate }): PlannerPort => {
      const ai = getRuntime();
      const planner = new Planner(ai.router, registry as never, ai.executor, gate, hooks);
      return {
        run: (ctx, goal): Promise<PlanRunResult> =>
          planner.run({ workspaceId: ctx.workspaceId, userId: ctx.userId, requestId: ctx.requestId, toolPermissions: ctx.toolPermissions } as never, goal),
        resume: (ctx, snapshot: PlanSnapshot): Promise<PlanRunResult> =>
          planner.resume({ workspaceId: ctx.workspaceId, userId: ctx.userId, requestId: ctx.requestId, toolPermissions: ctx.toolPermissions } as never, snapshot),
      };
    },
    workspaceToolPermissions: async (workspaceId) => {
      const settings = await db.aiWorkspaceSettings.findUnique({ where: { workspaceId } });
      return (settings?.toolPermissions ?? {}) as Record<string, boolean>;
    },
    // Phase 10 metering: root dispatches pay from the plan's monthly pool.
    planGate: {
      async checkRootDispatch(workspaceId) {
        const ws = await db.workspace.findUnique({
          where: { id: workspaceId },
          select: { plan: true },
        });
        const { start } = currentBillingPeriod();
        const used =
          (
            await db.agentRun.aggregate({
              where: { workspaceId, createdAt: { gte: start } },
              _sum: { creditsUsed: true },
            })
          )._sum.creditsUsed ?? 0;
        const verdict = planGateDecision(used, ws?.plan ?? "DUO");
        return { allowed: verdict.allowed, message: verdict.message ?? undefined };
      },
    },
  });

  container = { orchestrator, queue, repos };
  return container;
}

/** Test seam — replaces the singleton (mirrors resetRuntime in lib/ai). */
export function resetAgentRuntime(): void {
  container = null;
}
