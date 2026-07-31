"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { checkPermission, resolveWorkspaceContext } from "@/lib/workspace";
import { knowledgeSchema } from "@/lib/validations/workspace";

export type KnowledgeActionState = { error?: string; ok?: boolean };

export async function createKnowledgeEntry(
  _prev: KnowledgeActionState,
  formData: FormData
): Promise<KnowledgeActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "knowledge.write");
  if (denied) return { error: denied };

  const parsed = knowledgeSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    tags: formData.get("tags") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  }

  const entry = await db.knowledgeEntry.create({
    data: {
      workspaceId: ctx.workspace.id,
      title: parsed.data.title,
      body: parsed.data.body,
      tags: parsed.data.tags,
      createdById: ctx.user.id,
    },
  });

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.knowledgeCreate,
    targetType: "knowledge",
    targetId: entry.id,
    metadata: { title: entry.title },
  });

  revalidatePath("/dashboard/knowledge");
  return { ok: true };
}

export async function updateKnowledgeEntry(
  entryId: string,
  formData: FormData
): Promise<KnowledgeActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "knowledge.write");
  if (denied) return { error: denied };

  const parsed = knowledgeSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    tags: formData.get("tags") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  }

  const existing = await db.knowledgeEntry.findFirst({
    where: { id: entryId, workspaceId: ctx.workspace.id, deletedAt: null },
  });
  if (!existing) return { error: "Entry not found." };

  await db.knowledgeEntry.update({
    where: { id: entryId },
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      tags: parsed.data.tags,
      updatedById: ctx.user.id,
    },
  });

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.knowledgeUpdate,
    targetType: "knowledge",
    targetId: entryId,
    metadata: { title: parsed.data.title },
  });

  revalidatePath("/dashboard/knowledge");
  revalidatePath(`/dashboard/knowledge/${entryId}`);
  return { ok: true };
}

export async function deleteKnowledgeEntry(entryId: string): Promise<KnowledgeActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const existing = await db.knowledgeEntry.findFirst({
    where: { id: entryId, workspaceId: ctx.workspace.id, deletedAt: null },
  });
  if (!existing) return { error: "Entry not found." };

  // Creators may delete their own entries; otherwise requires knowledge.delete.
  if (existing.createdById !== ctx.user.id) {
    const denied = checkPermission(ctx, "knowledge.delete");
    if (denied) return { error: denied };
  }

  await db.knowledgeEntry.update({
    where: { id: entryId },
    data: { deletedAt: new Date() },
  });

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.knowledgeDelete,
    targetType: "knowledge",
    targetId: entryId,
    metadata: { title: existing.title },
  });

  revalidatePath("/dashboard/knowledge");
  return { ok: true };
}
