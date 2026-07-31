import { cache } from "react";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { MembershipRole, Workspace } from "@prisma/client";

/** Authenticated user for the current request, or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return db.user.findUnique({
    where: { id: session.user.id },
  });
});

/** The user's primary (first) workspace and their role in it. */
export const getPrimaryWorkspace = cache(
  async (
    userId: string
  ): Promise<{ workspace: Workspace; role: MembershipRole } | null> => {
    const membership = await db.membership.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { workspace: true },
    });
    if (!membership) return null;
    return { workspace: membership.workspace, role: membership.role };
  }
);

export async function getDashboardOverview(workspaceId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [agentsByStatus, runs7d, credits30d, pendingApprovals, recentRuns] =
    await Promise.all([
      db.agent.groupBy({
        by: ["status"],
        where: { workspaceId, status: { not: "ARCHIVED" } },
        _count: { id: true },
      }),
      db.agentRun.count({
        where: { workspaceId, createdAt: { gte: sevenDaysAgo } },
      }),
      db.agentRun.aggregate({
        where: { workspaceId, createdAt: { gte: thirtyDaysAgo } },
        _sum: { creditsUsed: true },
      }),
      db.approval.count({
        where: { status: "PENDING", run: { workspaceId } },
      }),
      db.agentRun.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { agent: { select: { name: true } } },
      }),
    ]);

  return {
    agentsByStatus: Object.fromEntries(
      agentsByStatus.map((row) => [row.status, row._count.id])
    ),
    agentCount: agentsByStatus.reduce((sum, row) => sum + row._count.id, 0),
    runs7d,
    credits30d: credits30d._sum.creditsUsed ?? 0,
    pendingApprovals,
    recentRuns,
  };
}
