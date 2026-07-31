"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";

import { db } from "@/lib/db";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { sendWorkspaceInvitationEmail } from "@/lib/mail";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { canManageMember } from "@/lib/permissions";
import {
  checkPermission,
  getCurrentUser,
  resolveWorkspaceContext,
} from "@/lib/workspace";
import { inviteSchema, memberRoleSchema } from "@/lib/validations/workspace";

export type MembersActionState = { error?: string; ok?: boolean };

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function inviteMember(
  _prev: MembersActionState,
  formData: FormData
): Promise<MembersActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "members.invite");
  if (denied) return { error: denied };

  const gate = rateLimit(
    `invite:${ctx.workspace.id}`,
    RATE_LIMITS.invite.limit,
    RATE_LIMITS.invite.windowMs
  );
  if (!gate.success) {
    return { error: `Invitation rate limit reached. Try again in ${gate.retryAfterSeconds}s.` };
  }

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  }
  const { email, role } = parsed.data;

  const existingMember = await db.membership.findFirst({
    where: { workspaceId: ctx.workspace.id, user: { email } },
  });
  if (existingMember) return { error: "That person is already a member." };

  const pending = await db.workspaceInvitation.findUnique({
    where: { workspaceId_email: { workspaceId: ctx.workspace.id, email } },
  });
  if (pending?.status === "PENDING" && pending.expiresAt > new Date()) {
    return { error: "An invitation is already pending for that email." };
  }

  const invitation = await db.workspaceInvitation.upsert({
    where: { workspaceId_email: { workspaceId: ctx.workspace.id, email } },
    update: {
      role,
      status: "PENDING",
      token: randomBytes(24).toString("hex"),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      invitedById: ctx.user.id,
      acceptedAt: null,
    },
    create: {
      workspaceId: ctx.workspace.id,
      email,
      role,
      token: randomBytes(24).toString("hex"),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      invitedById: ctx.user.id,
    },
  });

  await sendWorkspaceInvitationEmail({
    email,
    token: invitation.token,
    workspaceName: ctx.workspace.name,
    inviterName: ctx.user.name ?? ctx.user.email ?? "A teammate",
    role,
  });

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.memberInvite,
    targetType: "invitation",
    targetId: invitation.id,
    metadata: { email, role },
  });

  revalidatePath("/dashboard/members");
  return { ok: true };
}

export async function revokeInvitation(invitationId: string): Promise<MembersActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "members.invite");
  if (denied) return { error: denied };

  const invitation = await db.workspaceInvitation.findFirst({
    where: { id: invitationId, workspaceId: ctx.workspace.id, status: "PENDING" },
  });
  if (!invitation) return { error: "Invitation not found." };

  await db.workspaceInvitation.update({
    where: { id: invitation.id },
    data: { status: "REVOKED" },
  });

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.memberInviteRevoke,
    targetType: "invitation",
    targetId: invitation.id,
    metadata: { email: invitation.email },
  });

  revalidatePath("/dashboard/members");
  return { ok: true };
}

export async function changeMemberRole(
  memberId: string,
  newRole: string
): Promise<MembersActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "members.role");
  if (denied) return { error: denied };

  const parsed = memberRoleSchema.safeParse(newRole);
  if (!parsed.success) return { error: "Unsupported role." };

  const member = await db.membership.findFirst({
    where: { id: memberId, workspaceId: ctx.workspace.id },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!member) return { error: "Member not found." };
  if (member.userId === ctx.user.id) return { error: "You can't change your own role." };
  if (!canManageMember(ctx.role, member.role)) {
    return { error: "You can only manage members below your own rank." };
  }

  await db.membership.update({
    where: { id: member.id },
    data: { role: parsed.data },
  });

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.memberRoleChange,
    targetType: "membership",
    targetId: member.id,
    metadata: { email: member.user.email, from: member.role, to: parsed.data },
  });

  revalidatePath("/dashboard/members");
  return { ok: true };
}

export async function removeMember(memberId: string): Promise<MembersActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "members.remove");
  if (denied) return { error: denied };

  const member = await db.membership.findFirst({
    where: { id: memberId, workspaceId: ctx.workspace.id },
    include: { user: { select: { email: true } } },
  });
  if (!member) return { error: "Member not found." };
  if (member.userId === ctx.user.id) return { error: "You can't remove yourself." };
  if (!canManageMember(ctx.role, member.role)) {
    return { error: "You can only remove members below your own rank." };
  }

  await db.membership.delete({ where: { id: member.id } });

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.memberRemove,
    targetType: "membership",
    targetId: member.id,
    metadata: { email: member.user.email, role: member.role },
  });

  revalidatePath("/dashboard/members");
  return { ok: true };
}

export async function transferOwnership(memberId: string): Promise<MembersActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  if (ctx.role !== "OWNER") return { error: "Only the owner can transfer ownership." };

  const member = await db.membership.findFirst({
    where: { id: memberId, workspaceId: ctx.workspace.id },
    include: { user: { select: { email: true } } },
  });
  if (!member) return { error: "Member not found." };
  if (member.userId === ctx.user.id) return { error: "You already own this workspace." };
  if (member.role === "OWNER") return { error: "That member is already an owner." };

  const actorMembership = await db.membership.findUnique({
    where: {
      userId_workspaceId: { userId: ctx.user.id, workspaceId: ctx.workspace.id },
    },
  });
  if (!actorMembership) return { error: "Membership not found." };

  await db.$transaction([
    db.membership.update({ where: { id: member.id }, data: { role: "OWNER" } }),
    db.membership.update({ where: { id: actorMembership.id }, data: { role: "ADMIN" } }),
  ]);

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.ownershipTransfer,
    targetType: "membership",
    targetId: member.id,
    metadata: { newOwner: member.user.email },
  });

  revalidatePath("/dashboard/members");
  return { ok: true };
}

// ── Accepting an invitation (invitee side) ────────────────────────────

export async function acceptInvitation(token: string): Promise<MembersActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

  const invitation = await db.workspaceInvitation.findUnique({
    where: { token },
    include: { workspace: true },
  });

  if (!invitation || invitation.status !== "PENDING") {
    return { error: "This invitation is no longer valid." };
  }
  if (invitation.expiresAt < new Date()) {
    await db.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    return { error: "This invitation has expired. Ask for a fresh one." };
  }
  if (invitation.workspace.deletedAt) {
    return { error: "That workspace no longer exists." };
  }
  if (invitation.email !== user.email) {
    return {
      error: `This invitation was sent to ${invitation.email}. Sign in with that address to accept it.`,
    };
  }

  const existing = await db.membership.findUnique({
    where: {
      userId_workspaceId: { userId: user.id, workspaceId: invitation.workspaceId },
    },
  });

  await db.$transaction([
    ...(existing
      ? []
      : [
          db.membership.create({
            data: {
              userId: user.id,
              workspaceId: invitation.workspaceId,
              role: invitation.role,
            },
          }),
        ]),
    db.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    }),
  ]);

  await audit({
    workspaceId: invitation.workspaceId,
    actorId: user.id,
    action: AUDIT_ACTIONS.memberJoin,
    targetType: "membership",
    targetId: invitation.id,
    metadata: { email: user.email, role: invitation.role },
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
