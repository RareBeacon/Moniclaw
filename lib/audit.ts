import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { clientIp, clientUserAgent } from "@/lib/http";

/**
 * Append-only audit trail. Every mutating server action records a row.
 * Auditing must never break the business operation: failures are logged
 * to the server console, and the action continues.
 */

export const AUDIT_ACTIONS = {
  agentCreate: "agent.create",
  agentPromote: "agent.promote",
  agentRun: "agent.run",
  agentArchive: "agent.archive",
  approvalDecide: "approval.decide",
  memberInvite: "member.invite",
  memberInviteRevoke: "member.invite.revoke",
  memberRoleChange: "member.role.change",
  memberRemove: "member.remove",
  memberJoin: "member.join",
  ownershipTransfer: "workspace.ownership.transfer",
  settingsUpdate: "settings.update",
  workspaceDelete: "workspace.delete",
  knowledgeCreate: "knowledge.create",
  knowledgeUpdate: "knowledge.update",
  knowledgeDelete: "knowledge.delete",
  fileExport: "file.export",
  avatarUpdate: "user.avatar.update",
  passwordChange: "user.password.change",
  emailChange: "user.email.change",
  accountDelete: "user.account.delete",
  accountUnlink: "user.account.unlink",
  sessionsRevoke: "user.sessions.revoke",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export async function audit(entry: {
  workspaceId?: string | null;
  actorId?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        workspaceId: entry.workspaceId ?? null,
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        ip: clientIp(),
        userAgent: clientUserAgent(),
      },
    });
  } catch (error) {
    console.error("[audit] failed to record", entry.action, error);
  }
}
