import type { PrismaClient, UsageKind, UsageStatus } from "@prisma/client";
import type { UsageStats } from "../types";

/**
 * Usage tracking — one AiUsageEvent row per billable operation.
 *
 * Design contract (mirrors the audit log): tracking must NEVER break the
 * caller. Failures are swallowed after a one-line console warning, because
 * losing a metric is better than losing a response.
 */

export interface UsageRecord {
  workspaceId: string;
  userId?: string | null;
  kind: UsageKind;
  status: UsageStatus;
  provider: string;
  model: string;
  usage?: Partial<UsageStats>;
  toolCallCount?: number;
  errorCode?: string;
}

export class UsageTracker {
  constructor(private readonly db: PrismaClient) {}

  async record(entry: UsageRecord): Promise<void> {
    try {
      await this.db.aiUsageEvent.create({
        data: {
          workspaceId: entry.workspaceId,
          userId: entry.userId ?? null,
          kind: entry.kind,
          status: entry.status,
          provider: entry.provider,
          model: entry.model,
          promptTokens: entry.usage?.promptTokens ?? 0,
          completionTokens: entry.usage?.completionTokens ?? 0,
          totalTokens: entry.usage?.totalTokens ?? 0,
          latencyMs: entry.usage?.latencyMs ?? 0,
          costMicros: BigInt(entry.usage?.costMicros ?? 0),
          toolCallCount: entry.toolCallCount ?? 0,
          errorCode: entry.errorCode ?? null,
        },
      });
    } catch (error) {
      console.warn("[usage] failed to record event:", (error as Error).message);
    }
  }

  /** Aggregate totals for the usage dashboard over a rolling window. */
  async summarize(workspaceId: string, sinceDays = 30) {
    const since = new Date(Date.now() - sinceDays * 86_400_000);
    const [totals, byProvider, byModel, daily, errors] = await Promise.all([
      this.db.aiUsageEvent.aggregate({
        where: { workspaceId, createdAt: { gte: since } },
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          costMicros: true,
          toolCallCount: true,
        },
        _count: { _all: true },
        _avg: { latencyMs: true },
      }),
      this.db.aiUsageEvent.groupBy({
        by: ["provider"],
        where: { workspaceId, createdAt: { gte: since } },
        _sum: { totalTokens: true, costMicros: true },
        _count: { _all: true },
      }),
      this.db.aiUsageEvent.groupBy({
        by: ["model"],
        where: { workspaceId, createdAt: { gte: since } },
        _sum: { totalTokens: true },
        _count: { _all: true },
        orderBy: { _sum: { totalTokens: "desc" } },
        take: 8,
      }),
      this.db.$queryRaw<Array<{ day: string; tokens: bigint; requests: bigint }>>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
               SUM("totalTokens")::bigint AS tokens,
               COUNT(*)::bigint AS requests
        FROM ai_usage_events
        WHERE "workspaceId" = ${workspaceId} AND "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1
      `,
      this.db.aiUsageEvent.groupBy({
        by: ["errorCode"],
        where: {
          workspaceId,
          createdAt: { gte: since },
          status: "ERROR",
        },
        _count: { _all: true },
        orderBy: { _count: { errorCode: "desc" } },
        take: 5,
      }),
    ]);

    const okCount = await this.db.aiUsageEvent.count({
      where: { workspaceId, createdAt: { gte: since }, status: "OK" },
    });

    return {
      windowDays: sinceDays,
      requests: totals._count._all,
      okRate: totals._count._all ? okCount / totals._count._all : 1,
      promptTokens: totals._sum.promptTokens ?? 0,
      completionTokens: totals._sum.completionTokens ?? 0,
      totalTokens: totals._sum.totalTokens ?? 0,
      costUsd: Number(totals._sum.costMicros ?? 0n) / 1_000_000,
      toolCalls: totals._sum.toolCallCount ?? 0,
      avgLatencyMs: Math.round(totals._avg.latencyMs ?? 0),
      byProvider: byProvider.map((p) => ({
        provider: p.provider,
        requests: p._count._all,
        totalTokens: p._sum.totalTokens ?? 0,
        costUsd: Number(p._sum.costMicros ?? 0n) / 1_000_000,
      })),
      byModel: byModel.map((m) => ({
        model: m.model,
        requests: m._count._all,
        totalTokens: m._sum.totalTokens ?? 0,
      })),
      daily: daily.map((d) => ({
        day: d.day,
        tokens: Number(d.tokens),
        requests: Number(d.requests),
      })),
      topErrors: errors.map((e) => ({
        code: e.errorCode ?? "unknown",
        count: e._count._all,
      })),
    };
  }
}
