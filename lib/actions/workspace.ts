"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";

export type ActionState = { error?: string; ok?: boolean };

async function requireWorkspace() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated." as const };

  const primary = await getPrimaryWorkspace(user.id);
  if (!primary) return { error: "No workspace found for this account." as const };

  return { user, ...primary };
}

// ── Agents ───────────────────────────────────────────────────────────

const createAgentSchema = z.object({
  name: z.string().trim().min(2, "Give the agent a name.").max(60),
  category: z.string().trim().max(40).optional(),
  description: z
    .string()
    .trim()
    .min(30, "A useful job description needs at least a couple of sentences (30+ characters).")
    .max(2000),
  trigger: z.enum(["MANUAL", "SCHEDULE", "WEBHOOK"]),
  schedule: z.string().trim().max(60).optional(),
});

export async function createAgent(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return { error: ctx.error };

  const parsed = createAgentSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category") || undefined,
    description: formData.get("description"),
    trigger: formData.get("trigger"),
    schedule: formData.get("schedule") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  }

  const { name, category, description, trigger, schedule } = parsed.data;

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

  await db.agent.create({
    data: {
      workspaceId: ctx.workspace.id,
      name,
      slug,
      category,
      description,
      trigger,
      schedule: trigger === "SCHEDULE" ? schedule : null,
      // Every agent starts as a draft; shadow mode is the first promotion.
      status: "DRAFT",
      policy: {
        approvals: [{ when: "amount > 0", to: ctx.user.email }],
        budgets: { dailyUsd: 25 },
      },
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/agents");
  redirect("/dashboard/agents");
}

const agentStatusTransitions = z.enum(["SHADOW", "SUPERVISED", "AUTONOMOUS", "PAUSED"]);

export async function setAgentStatus(agentId: string, status: string): Promise<ActionState> {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return { error: ctx.error };

  const parsed = agentStatusTransitions.safeParse(status);
  if (!parsed.success) return { error: "Unsupported status." };

  const agent = await db.agent.findFirst({
    where: { id: agentId, workspaceId: ctx.workspace.id },
  });
  if (!agent) return { error: "Agent not found in this workspace." };

  await db.agent.update({
    where: { id: agent.id },
    data: { status: parsed.data },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/agents");
  return { ok: true };
}

export async function startRun(agentId: string): Promise<ActionState> {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return { error: ctx.error };

  const agent = await db.agent.findFirst({
    where: { id: agentId, workspaceId: ctx.workspace.id },
  });
  if (!agent) return { error: "Agent not found in this workspace." };
  if (agent.status === "DRAFT" || agent.status === "PAUSED" || agent.status === "ARCHIVED") {
    return { error: "Promote the agent out of DRAFT (shadow mode is the first step) before running it." };
  }

  await db.agentRun.create({
    data: {
      agentId: agent.id,
      workspaceId: ctx.workspace.id,
      mode: agent.status === "SHADOW" ? "SHADOW" : "LIVE",
      status: "QUEUED",
      triggerSource: "manual",
      events: {
        create: {
          type: "note",
          message: `Run queued by ${ctx.user.name ?? ctx.user.email}. The runner fleet picks up queued runs as the execution plane rolls out.`,
        },
      },
    },
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
  const ctx = await requireWorkspace();
  if ("error" in ctx) return { error: ctx.error };

  const approval = await db.approval.findFirst({
    where: { id: approvalId, status: "PENDING", run: { workspaceId: ctx.workspace.id } },
    include: { run: true },
  });
  if (!approval) return { error: "Approval not found or already decided." };

  await db.$transaction([
    db.approval.update({
      where: { id: approval.id },
      data: {
        status: decision,
        decidedById: ctx.user.id,
        decidedAt: new Date(),
        note: note || null,
      },
    }),
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
        status: decision === "APPROVED" ? "RUNNING" : approval.run.status === "NEEDS_APPROVAL" ? "CANCELED" : approval.run.status,
      },
    }),
  ]);

  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ── Workspace settings ───────────────────────────────────────────────

export async function renameWorkspace(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ctx = await requireWorkspace();
  if ("error" in ctx) return { error: ctx.error };
  if (ctx.role === "VIEWER") return { error: "Viewers can't change workspace settings." };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 60) {
    return { error: "Workspace names must be 2–60 characters." };
  }

  await db.workspace.update({
    where: { id: ctx.workspace.id },
    data: { name },
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
