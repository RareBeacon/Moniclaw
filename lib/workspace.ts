import { cache } from "react";
import type { MembershipRole, User, Workspace } from "@prisma/client";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can, type Action } from "@/lib/permissions";

/**
 * Authenticated user for the current request, or null.
 * Enforces:
 *  • token validity (exp is checked by Auth.js at decode time)
 *  • soft-deleted users
 *  • sessionVersion — incremented on "sign out everywhere"; stale tokens
 *    are rejected even though their exp claim is still valid.
 * Cached per request by React.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.deletedAt) return null;
  if ((session.user.sessionVersion ?? 0) !== user.sessionVersion) return null;

  return user;
});

export type WorkspaceContext = {
  user: User;
  workspace: Workspace;
  role: MembershipRole;
};

/** The user's primary (first) workspace and their role in it. */
export const getPrimaryWorkspace = cache(
  async (
    userId: string
  ): Promise<{ workspace: Workspace; role: MembershipRole } | null> => {
    const membership = await db.membership.findFirst({
      where: { userId, workspace: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
      include: { workspace: true },
    });
    if (!membership) return null;
    return { workspace: membership.workspace, role: membership.role };
  }
);

/**
 * Resolve the caller's full workspace context (auth → membership → role).
 * Returns an error string when unauthorized; the ctx otherwise.
 */
export async function resolveWorkspaceContext(): Promise<
  { ctx: WorkspaceContext } | { error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

  const primary = await getPrimaryWorkspace(user.id);
  if (!primary) return { error: "No workspace found for this account." };

  return { ctx: { user, workspace: primary.workspace, role: primary.role } };
}

/**
 * Role authorization gate for server actions and pages.
 * Returns an error string when the role lacks the capability.
 */
export function checkPermission(
  ctx: WorkspaceContext,
  action: Action
): string | null {
  if (!can(ctx.role, action)) {
    return `Your role doesn't allow “${action}”. Ask an Owner or Admin.`;
  }
  return null;
}

export async function getDashboardOverview(workspaceId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [agentsByStatus, runs7d, credits30d, pendingApprovals, recentRuns] =
    await Promise.all([
      db.agent.groupBy({
        by: ["status"],
        where: { workspaceId, status: { not: "ARCHIVED" }, deletedAt: null },
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
