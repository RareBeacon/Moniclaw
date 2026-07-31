"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { sendVerificationEmail } from "@/lib/mail";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  changePasswordSchema,
  deleteAccountSchema,
  profileSchema,
  updateEmailSchema,
} from "@/lib/validations/workspace";

export type UserActionState = { error?: string; ok?: boolean };

// ── Profile ──────────────────────────────────────────────────────────

export async function updateProfile(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

  const parsed = profileSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name },
  });

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateEmail(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };
  if (!user.passwordHash) {
    return { error: "OAuth-only accounts change email at their provider." };
  }

  const parsed = updateEmailSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) return { error: "Password didn't match." };
  if (parsed.data.email === user.email) return { ok: true };

  const taken = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (taken) return { error: "That email is already in use." };

  await db.user.update({
    where: { id: user.id },
    data: {
      email: parsed.data.email,
      emailVerified: null,
      // Force a fresh session carrying the new identity.
      sessionVersion: { increment: 1 },
    },
  });

  const token = randomBytes(32).toString("hex");
  await db.verificationToken.create({
    data: {
      identifier: `verify:${parsed.data.email}`,
      token,
      expires: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
  await sendVerificationEmail(parsed.data.email, token);

  await audit({
    actorId: user.id,
    action: AUDIT_ACTIONS.emailChange,
    targetType: "user",
    targetId: user.id,
    metadata: { to: parsed.data.email },
  });

  redirect("/login?updated=email");
}

export async function changePassword(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };
  if (!user.passwordHash) {
    return { error: "OAuth-only accounts don't use a MoniClaw password." };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect." };

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.newPassword, 12),
      // Rotate sessions: the safest default after a credential change.
      sessionVersion: { increment: 1 },
    },
  });

  await audit({
    actorId: user.id,
    action: AUDIT_ACTIONS.passwordChange,
    targetType: "user",
    targetId: user.id,
  });

  redirect("/login?updated=password");
}

// ── Avatar ───────────────────────────────────────────────────────────

export async function updateAvatar(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

  const gate = rateLimit(`upload:${user.id}`, RATE_LIMITS.upload.limit, RATE_LIMITS.upload.windowMs);
  if (!gate.success) {
    return { error: `Upload rate limit reached. Try again in ${gate.retryAfterSeconds}s.` };
  }

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image first." };
  }
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { error: "PNG, JPEG, or WebP only." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { error: "Avatars must be under 512 KB." };
  }

  const primary = await getPrimaryWorkspace(user.id);
  const bytes = Buffer.from(await file.arrayBuffer());

  // Replace any previous avatar asset.
  const previousAssetId = user.image?.startsWith("/api/assets/")
    ? user.image.split("/api/assets/")[1]
    : null;

  const asset = await db.asset.create({
    data: {
      workspaceId: primary?.workspace.id ?? null,
      kind: "AVATAR",
      name: `avatar-${user.id}`,
      mimeType: file.type,
      sizeBytes: file.size,
      content: bytes,
      createdById: user.id,
    },
  });

  if (previousAssetId) {
    await db.asset.deleteMany({
      where: { id: previousAssetId, kind: "AVATAR", createdById: user.id },
    });
  }

  await db.user.update({
    where: { id: user.id },
    data: { image: `/api/assets/${asset.id}` },
  });

  await audit({
    workspaceId: primary?.workspace.id,
    actorId: user.id,
    action: AUDIT_ACTIONS.avatarUpdate,
    targetType: "asset",
    targetId: asset.id,
  });

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function removeAvatar(): Promise<UserActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

  const previousAssetId = user.image?.startsWith("/api/assets/")
    ? user.image.split("/api/assets/")[1]
    : null;

  await db.user.update({ where: { id: user.id }, data: { image: null } });
  if (previousAssetId) {
    await db.asset.deleteMany({
      where: { id: previousAssetId, kind: "AVATAR", createdById: user.id },
    });
  }

  revalidatePath("/dashboard/profile");
  return { ok: true };
}

// ── Sessions ─────────────────────────────────────────────────────────

export async function signOutEverywhere(): Promise<UserActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

  await db.user.update({
    where: { id: user.id },
    data: { sessionVersion: { increment: 1 } },
  });

  await audit({
    actorId: user.id,
    action: AUDIT_ACTIONS.sessionsRevoke,
    targetType: "user",
    targetId: user.id,
  });

  // The current token is now stale too; end it.
  await signOut({ redirectTo: "/login?revoked=1" });
  return { ok: true };
}

// ── Connected accounts ────────────────────────────────────────────────

export async function unlinkAccount(provider: string): Promise<UserActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

  const [accounts, hasPassword] = await Promise.all([
    db.account.findMany({ where: { userId: user.id } }),
    Promise.resolve(!!user.passwordHash),
  ]);

  const target = accounts.find((a) => a.provider === provider);
  if (!target) return { error: "That account isn't connected." };

  // Never strand the user without a sign-in method.
  if (!hasPassword && accounts.length <= 1) {
    return { error: "Set a password before unlinking your only sign-in method." };
  }

  await db.account.delete({ where: { id: target.id } });

  await audit({
    actorId: user.id,
    action: AUDIT_ACTIONS.accountUnlink,
    targetType: "account",
    targetId: target.id,
    metadata: { provider },
  });

  revalidatePath("/dashboard/profile");
  return { ok: true };
}

// ── Account deletion ─────────────────────────────────────────────────

export async function deleteAccount(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

  if (user.passwordHash) {
    const parsed = deleteAccountSchema.safeParse({
      password: formData.get("password"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Confirm with your password." };
    }
    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) return { error: "Password didn't match." };
  }

  // Ownership check: sole-owner workspaces with other members must be
  // transferred or deleted first — we never orphan a team.
  const ownedMemberships = await db.membership.findMany({
    where: { userId: user.id, role: "OWNER", workspace: { deletedAt: null } },
    include: {
      workspace: { include: { memberships: { select: { id: true } } } },
    },
  });

  const blocking = ownedMemberships.filter(
    (membership) => membership.workspace.memberships.length > 1
  );
  if (blocking.length > 0) {
    const names = blocking.map((b) => b.workspace.name).join(", ");
    return {
      error: `Transfer ownership or delete these workspaces first: ${names}.`,
    };
  }

  // Sole-member workspaces leave with the account (soft delete).
  for (const membership of ownedMemberships) {
    await db.workspace.update({
      where: { id: membership.workspaceId },
      data: { deletedAt: new Date() },
    });
  }

  const tombstone = `deleted+${user.id}@deleted.moniclaw.invalid`;
  await db.$transaction([
    db.membership.deleteMany({ where: { userId: user.id } }),
    db.account.deleteMany({ where: { userId: user.id } }),
    db.user.update({
      where: { id: user.id },
      data: {
        name: "Deleted user",
        email: tombstone,
        emailVerified: null,
        image: null,
        passwordHash: null,
        deletedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    }),
  ]);

  await audit({
    actorId: user.id,
    action: AUDIT_ACTIONS.accountDelete,
    targetType: "user",
    targetId: user.id,
  });

  await signOut({ redirectTo: "/?deleted=1" });
  return { ok: true };
}
