import { db } from "@/lib/db";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";

/** Platform ownership is deliberately limited to the original indefinite-access
 * owner cohort; paid workspace owners never gain platform administration. */
export async function requirePlatformOwner() {
  const user = await getCurrentUser();
  if (!user || user.accessStatus !== "ACTIVE" || user.accessUntil) return null;
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary || primary.role !== "OWNER") return null;
  return { user, workspace: primary.workspace };
}

export async function changePlatformAccess(input: {
  targetId: string;
  operation: "approve" | "extend" | "suspend" | "reactivate" | "delete";
  until?: Date | null;
  note?: string | null;
}) {
  const actor = await requirePlatformOwner();
  if (!actor) return { error: "Only a platform Owner can manage access." } as const;
  const target = await db.user.findFirst({ where: { id: input.targetId, deletedAt: null } });
  if (!target) return { error: "That account no longer exists." } as const;
  if (target.id === actor.user.id && input.operation === "delete") return { error: "You cannot delete your own platform-owner account." } as const;

  if (input.operation === "delete") {
    await db.user.update({ where: { id: target.id }, data: { deletedAt: new Date(), sessionVersion: { increment: 1 }, accessStatus: "SUSPENDED" } });
    await audit({ workspaceId: actor.workspace.id, actorId: actor.user.id, action: AUDIT_ACTIONS.accessDelete, targetType: "user", targetId: target.id, metadata: { email: target.email } });
    return { ok: true } as const;
  }
  const status = input.operation === "suspend" ? "SUSPENDED" : "ACTIVE" as const;
  const action = input.operation === "approve" ? AUDIT_ACTIONS.accessApprove : input.operation === "extend" ? AUDIT_ACTIONS.accessExtend : input.operation === "suspend" ? AUDIT_ACTIONS.accessSuspend : AUDIT_ACTIONS.accessReactivate;
  await db.user.update({ where: { id: target.id }, data: { accessStatus: status, accessUntil: input.until === undefined ? target.accessUntil : input.until, accessNote: input.note === undefined ? target.accessNote : input.note } });
  await audit({ workspaceId: actor.workspace.id, actorId: actor.user.id, action, targetType: "user", targetId: target.id, metadata: { email: target.email, accessUntil: input.until?.toISOString() ?? null, note: input.note ?? null } });
  return { ok: true } as const;
}
