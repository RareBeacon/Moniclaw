"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { slugify, uniqueSuffix } from "@/lib/slug";
import {
  checkPermission,
  getCurrentUser,
  resolveWorkspaceContext,
} from "@/lib/workspace";
import {
  agentStatusSchema,
  createAgentSchema,
  deleteWorkspaceSchema,
  workspaceSettingsSchema,
} from "@/lib/validations/workspace";

export type ActionState = { error?: string; ok?: boolean; value?: string };

// ── Workspace lifecycle ──────────────────────────────────────────────

export async function createWorkspace(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 60) {
    return { error: "Workspace names must be 2–60 characters." };
  }

  const slug = `${slugify(name) || "workspace"}-${uniqueSuffix()}`;
  await db.workspace.create({
    data: {
      name,
      slug,
      memberships: { create: { userId: user.id, role: "OWNER" } },
    },
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function updateWorkspaceSettings(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "settings.edit");
  if (denied) return { error: denied };

  const parsed = workspaceSettingsSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    brandColor: formData.get("brandColor"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  }

  const { name, slug, brandColor } = parsed.data;

  if (slug !== ctx.workspace.slug) {
    const taken = await db.workspace.findUnique({ where: { slug } });
    if (taken) return { error: "That slug is taken. Try another." };
  }

  await db.workspace.update({
    where: { id: ctx.workspace.id },
    data: { name, slug, brandColor },
  });

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.settingsUpdate,
    targetType: "workspace",
    targetId: ctx.workspace.id,
    metadata: { name, slug, brandColor },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function deleteWorkspace(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "workspace.delete");
  if (denied) return { error: denied };

  const parsed = deleteWorkspaceSchema.safeParse({
    confirmSlug: formData.get("confirmSlug"),
  });
  if (!parsed.success || parsed.data.confirmSlug !== ctx.workspace.slug) {
    return { error: `Type the workspace slug (${ctx.workspace.slug}) to confirm.` };
  }

  await db.workspace.update({
    where: { id: ctx.workspace.id },
    data: { deletedAt: new Date() },
  });

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.workspaceDelete,
    targetType: "workspace",
    targetId: ctx.workspace.id,
    metadata: { slug: ctx.workspace.slug },
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

// ── Agents ───────────────────────────────────────────────────────────

export async function createAgent(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "agents.create");
  if (denied) return { error: denied };

  const parsed = createAgentSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category") || undefined,
    description: formData.get("description"),
    trigger: formData.get("trigger"),
    schedule: formData.get("schedule") || undefined,
    workerType: formData.get("workerType") || "general",
    goal: formData.get("goal") || undefined,
    instructions: formData.get("instructions") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  }

  const { name, category, description, trigger, schedule, workerType, goal, instructions } = parsed.data;
  if (trigger === "SCHEDULE" && !schedule) {
    return { error: "Scheduled agents need a cron expression." };
  }

  const base = slugify(name) || "agent";
  let slug = base;
  let attempt = 0;
  while (
    await db.agent.findUnique({
      where: { workspaceId_slug: { workspaceId: ctx.workspace.id, slug } },
    })
  ) {
    attempt += 1;
    slug = `${base}-${attempt}`;
  }

  const agent = await db.agent.create({
    data: {
      workspaceId: ctx.workspace.id,
      name,
      slug,
      category,
      description,
      trigger,
      schedule: trigger === "SCHEDULE" ? schedule : null,
      status: "DRAFT",
      workerType,
      goal: goal || null,
      instructions: instructions || null,
      policy: {
        approvals: [{ when: "amount > 0", to: ctx.user.email }],
        budgets: { dailyUsd: 25 },
      },
    },
  });

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.agentCreate,
    targetType: "agent",
    targetId: agent.id,
    metadata: { name, trigger },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/agents");
  redirect("/dashboard/agents");
}

export async function setAgentStatus(agentId: string, status: string): Promise<ActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "agents.promote");
  if (denied) return { error: denied };

  const parsed = agentStatusSchema.safeParse(status);
  if (!parsed.success) return { error: "Unsupported status." };

  const agent = await db.agent.findFirst({
    where: { id: agentId, workspaceId: ctx.workspace.id, deletedAt: null },
  });
  if (!agent) return { error: "Agent not found in this workspace." };

  await db.agent.update({
    where: { id: agent.id },
    data: { status: parsed.data },
  });

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.agentPromote,
    targetType: "agent",
    targetId: agent.id,
    metadata: { from: agent.status, to: parsed.data },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/agents");
  return { ok: true };
}

export async function archiveAgent(agentId: string): Promise<ActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "agents.archive");
  if (denied) return { error: denied };

  const agent = await db.agent.findFirst({
    where: { id: agentId, workspaceId: ctx.workspace.id, deletedAt: null },
  });
  if (!agent) return { error: "Agent not found in this workspace." };

  await db.agent.update({
    where: { id: agent.id },
    data: { status: "ARCHIVED", deletedAt: new Date() },
  });

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.agentArchive,
    targetType: "agent",
    targetId: agent.id,
    metadata: { name: agent.name },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/agents");
  return { ok: true };
}

export async function startRun(agentId: string): Promise<ActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "agents.run");
  if (denied) return { error: denied };

  const agent = await db.agent.findFirst({
    where: { id: agentId, workspaceId: ctx.workspace.id, deletedAt: null },
  });
  if (!agent) return { error: "Agent not found in this workspace." };
  if (agent.status === "DRAFT" || agent.status === "PAUSED" || agent.status === "ARCHIVED") {
    return { error: "Promote the agent out of DRAFT (shadow mode is the first step) before running it." };
  }

  // Phase 5: the execution plane is live — dispatch through the worker
  // orchestrator (budgets, tool policy, event trail, real execution).
  let runId: string;
  try {
    const { getAgentRuntime } = await import("@/lib/agents/runtime");
    const runtime = getAgentRuntime();
    const { run } = await runtime.orchestrator.dispatch({
      workspaceId: ctx.workspace.id,
      agentId: agent.id,
      byUserId: ctx.user.id,
      triggerSource: "manual",
      // Legacy Phase-2 agents carry their brief in `description` — always runnable.
      ...(agent.goal ? {} : { goal: agent.description }),
    });
    runId = run.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not queue the run.";
    return { error: message };
  }

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.agentRun,
    targetType: "run",
    targetId: runId,
    metadata: { agent: agent.name, mode: agent.status === "SHADOW" ? "SHADOW" : "LIVE" },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/runs");
  return { ok: true };
}

// ── Approvals ────────────────────────────────────────────────────────

export async function decideApproval(
  approvalId: string,
  decision: "APPROVED" | "REJECTED",
  note?: string
): Promise<ActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "approvals.decide");
  if (denied) return { error: denied };

  const approval = await db.approval.findFirst({
    where: {
      id: approvalId,
      status: "PENDING",
      // Run-derived approvals scope through the run; plan-derived (planner)
      // approvals scope through their direct workspace link.
      OR: [{ run: { workspaceId: ctx.workspace.id } }, { workspaceId: ctx.workspace.id }],
    },
    include: { run: true },
  });
  if (!approval) return { error: "Approval not found or already decided." };

  const writes: import("@prisma/client").Prisma.PrismaPromise<unknown>[] = [
    db.approval.update({
      where: { id: approval.id },
      data: {
        status: decision,
        decidedById: ctx.user.id,
        decidedAt: new Date(),
        note: note || null,
      },
    }),
  ];
  if (approval.runId && approval.run) {
    writes.push(
      db.runEvent.create({
        data: {
          runId: approval.runId,
          type: "approval",
          message: `${approval.actionType} ${decision.toLowerCase()} by ${ctx.user.name ?? ctx.user.email}`,
          payload: note ? { note } : {},
        },
      }),
      db.agentRun.update({
        where: { id: approval.runId },
        data: {
          status:
            decision === "APPROVED"
              ? "RUNNING"
              : approval.run.status === "NEEDS_APPROVAL"
                ? "CANCELED"
                : approval.run.status,
        },
      })
    );
  }
  // Phase 6: sales draft-review decisions propagate to the linked draft in
  // the SAME transaction — the approvals inbox and the drafts API can never
  // disagree. (Draft-scoped decideDraft in lib/sales/drafts.ts does the
  // mirror-image update for the API path.)
  if (approval.actionType === "sales.draft.review") {
    writes.push(
      db.salesDraft.updateMany({
        where: { approvalId: approval.id, status: "PENDING_REVIEW" },
        data: {
          status: decision === "APPROVED" ? "APPROVED" : "REJECTED",
          ...(decision === "REJECTED" ? { rejectionNote: note || null } : { rejectionNote: null }),
        },
      })
    );
  }
  await db.$transaction(writes);

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.approvalDecide,
    targetType: "approval",
    targetId: approval.id,
    metadata: { actionType: approval.actionType, decision, runId: approval.runId },
  });

  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
