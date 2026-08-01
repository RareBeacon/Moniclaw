/**
 * Prisma adapters for the Agent Runtime ports.
 *
 * Tenant safety contract: every read/update used by HTTP surfaces is
 * workspace-scoped. `AgentRunPrismaRepository.getInternal` exists solely for
 * orchestrator-owned queue jobs, which re-validate the row before acting.
 */
import type { PrismaClient } from "@prisma/client";
import type {
  AgentRepository, AgentRow, AgentRunCreateInput, AgentRunRepository, AgentRunRow,
  AgentRunStatus, RunEventRepository, RunEventRow, RunFinishPatch,
} from "../ports";

function toAgentRow(r: AgentRow): AgentRow { return r; }
function toRunRow(r: AgentRunRow): AgentRunRow { return r; }

export class AgentPrismaRepository implements AgentRepository {
  constructor(private readonly db: PrismaClient) {}

  async get(workspaceId: string, id: string): Promise<AgentRow | null> {
    const r = await this.db.agent.findFirst({ where: { id, workspaceId, deletedAt: null } });
    return r ? toAgentRow(r as AgentRow) : null;
  }

  async getBySlug(workspaceId: string, slug: string): Promise<AgentRow | null> {
    const r = await this.db.agent.findFirst({ where: { slug, workspaceId, deletedAt: null } });
    return r ? toAgentRow(r as AgentRow) : null;
  }

  async list(workspaceId: string, opts?: { includeArchived?: boolean; take?: number }): Promise<AgentRow[]> {
    const rows = await this.db.agent.findMany({
      where: {
        workspaceId, deletedAt: null,
        ...(opts?.includeArchived ? {} : { status: { not: "ARCHIVED" } }),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts?.take ?? 100, 500),
    });
    return rows.map((r) => toAgentRow(r as AgentRow));
  }

  async listSchedulable(_now: Date): Promise<AgentRow[]> {
    const rows = await this.db.agent.findMany({
      where: {
        trigger: "SCHEDULE",
        status: { in: ["SUPERVISED", "AUTONOMOUS"] },
        schedule: { not: null },
        deletedAt: null,
      },
      take: 500,
    });
    return rows.map((r) => toAgentRow(r as AgentRow));
  }

  async touchLastScheduled(id: string, at: Date): Promise<void> {
    await this.db.agent.updateMany({ where: { id }, data: { lastScheduledAt: at } });
  }

  async incrementRunCount(id: string, by = 1): Promise<void> {
    await this.db.agent.updateMany({ where: { id }, data: { runCount: { increment: by } } });
  }
}

export class AgentRunPrismaRepository implements AgentRunRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: AgentRunCreateInput): Promise<AgentRunRow> {
    const r = await this.db.agentRun.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        agentId: input.agentId,
        workspaceId: input.workspaceId,
        mode: input.mode,
        triggerSource: input.triggerSource,
        parentRunId: input.parentRunId ?? null,
        depth: input.depth ?? 0,
        budgetSnapshot: input.budgetSnapshot as object,
        idempotencyKey: input.idempotencyKey ?? null,
        progress: (input.progress ?? { goal: input.goalSnapshot }) as object,
        status: "QUEUED",
      },
    });
    return toRunRow(r as AgentRunRow);
  }

  async get(workspaceId: string, id: string): Promise<AgentRunRow | null> {
    const r = await this.db.agentRun.findFirst({ where: { id, workspaceId } });
    return r ? toRunRow(r as AgentRunRow) : null;
  }

  async getInternal(id: string): Promise<AgentRunRow | null> {
    const r = await this.db.agentRun.findUnique({ where: { id } });
    return r ? toRunRow(r as AgentRunRow) : null;
  }

  async findByIdempotency(agentId: string, key: string): Promise<AgentRunRow | null> {
    const r = await this.db.agentRun.findFirst({ where: { agentId, idempotencyKey: key } });
    return r ? toRunRow(r as AgentRunRow) : null;
  }

  async list(workspaceId: string, opts?: {
    agentId?: string; status?: AgentRunStatus; parentRunId?: string | null;
    teamId?: string; limit?: number; before?: Date;
  }): Promise<AgentRunRow[]> {
    const rows = await this.db.agentRun.findMany({
      where: {
        workspaceId,
        ...(opts?.agentId ? { agentId: opts.agentId } : {}),
        ...(opts?.status ? { status: opts.status } : {}),
        ...(opts?.parentRunId !== undefined ? { parentRunId: opts.parentRunId } : {}),
        ...(opts?.teamId ? { teamId: opts.teamId } : {}),
        ...(opts?.before ? { createdAt: { lt: opts.before } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts?.limit ?? 50, 200),
    });
    return rows.map((r) => toRunRow(r as AgentRunRow));
  }

  async listChildren(parentRunId: string): Promise<AgentRunRow[]> {
    const rows = await this.db.agentRun.findMany({
      where: { parentRunId },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    return rows.map((r) => toRunRow(r as AgentRunRow));
  }

  async listStaleRunning(olderThan: Date, take = 100): Promise<AgentRunRow[]> {
    const rows = await this.db.agentRun.findMany({
      where: { status: "RUNNING", startedAt: { not: null, lt: olderThan } },
      orderBy: { startedAt: "asc" },
      take: Math.min(take, 500),
    });
    return rows.map((r) => toRunRow(r as AgentRunRow));
  }

  async listStaleQueued(olderThan: Date, take = 100): Promise<AgentRunRow[]> {
    const rows = await this.db.agentRun.findMany({
      where: { status: "QUEUED", createdAt: { lt: olderThan } },
      orderBy: { createdAt: "asc" },
      take: Math.min(take, 500),
    });
    return rows.map((r) => toRunRow(r as AgentRunRow));
  }

  async countActiveByAgent(agentId: string): Promise<number> {
    return this.db.agentRun.count({ where: { agentId, status: { in: ["QUEUED", "RUNNING", "NEEDS_APPROVAL"] } } });
  }

  async transition(id: string, from: AgentRunStatus[], to: AgentRunStatus, patch?: Partial<AgentRunRow>): Promise<boolean> {
    const res = await this.db.agentRun.updateMany({
      where: { id, status: { in: from } },
      data: {
        status: to,
        ...(patch?.startedAt ? { startedAt: patch.startedAt } : {}),
        ...(patch?.finishedAt ? { finishedAt: patch.finishedAt } : {}),
        ...(to === "RUNNING" && !patch?.startedAt ? {} : {}),
      },
    });
    return res.count === 1;
  }

  async savePlan(id: string, plan: unknown): Promise<void> {
    await this.db.agentRun.updateMany({ where: { id }, data: { plan: plan as object } });
  }

  async saveProgress(id: string, progress: unknown): Promise<void> {
    await this.db.agentRun.updateMany({ where: { id }, data: { progress: progress as object } });
  }

  async setStepsExecuted(id: string, stepsExecuted: number): Promise<void> {
    await this.db.agentRun.updateMany({ where: { id }, data: { stepsExecuted } });
  }

  async requestCancel(workspaceId: string, id: string): Promise<boolean> {
    const res = await this.db.agentRun.updateMany({
      where: { id, workspaceId, status: { in: ["QUEUED", "RUNNING", "NEEDS_APPROVAL"] } },
      data: { cancelRequested: true },
    });
    return res.count === 1;
  }

  async finish(id: string, patch: RunFinishPatch): Promise<void> {
    await this.db.agentRun.updateMany({
      where: { id },
      data: {
        status: patch.status,
        finishedAt: new Date(),
        ...(patch.output !== undefined ? { output: patch.output as object } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        ...(patch.errorClass !== undefined ? { errorClass: patch.errorClass } : {}),
        ...(patch.stepsExecuted !== undefined ? { stepsExecuted: patch.stepsExecuted } : {}),
        ...(patch.tokensUsed !== undefined ? { tokensUsed: patch.tokensUsed } : {}),
      },
    });
  }
}

export class RunEventPrismaRepository implements RunEventRepository {
  constructor(private readonly db: PrismaClient) {}

  async append(input: { runId: string; type: string; message: string; payload?: unknown }): Promise<RunEventRow> {
    const r = await this.db.runEvent.create({
      data: {
        runId: input.runId,
        type: input.type,
        message: input.message.slice(0, 2000),
        payload: (input.payload ?? {}) as object,
      },
    });
    return r as RunEventRow;
  }

  async list(runId: string, opts?: { afterTs?: Date; limit?: number }): Promise<RunEventRow[]> {
    const rows = await this.db.runEvent.findMany({
      where: {
        runId,
        ...(opts?.afterTs ? { ts: { gt: opts.afterTs } } : {}),
      },
      orderBy: [{ ts: "asc" }, { id: "asc" }],
      take: Math.min(opts?.limit ?? 200, 1000),
    });
    return rows as RunEventRow[];
  }
}

export class UsageQueryPrismaRepository {
  constructor(private readonly db: PrismaClient) {}

  async sumByRequestId(workspaceId: string, requestId: string): Promise<{ tokens: number; costMicros: number }> {
    const agg = await this.db.aiUsageEvent.aggregate({
      where: { workspaceId, requestId },
      _sum: { totalTokens: true, costMicros: true },
    });
    return {
      tokens: agg._sum.totalTokens ?? 0,
      costMicros: Number(agg._sum.costMicros ?? 0n),
    };
  }
}

/** Convenience container mirroring the Phase 4 repositories factory. */
export function buildAgentRepositories(db: PrismaClient) {
  return {
    agents: new AgentPrismaRepository(db),
    runs: new AgentRunPrismaRepository(db),
    events: new RunEventPrismaRepository(db),
    usage: new UsageQueryPrismaRepository(db),
  };
}
