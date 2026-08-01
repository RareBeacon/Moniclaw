"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { AUDIT_ACTIONS, audit } from "@/lib/audit";
import { checkPermission, resolveWorkspaceContext } from "@/lib/workspace";
import { getAgentRuntime } from "@/lib/agents/runtime";
import { AgentError } from "@agents/errors";
import { toolPolicySchema, workerBudgetSchema, workerTypeSchema } from "@agents/index";
import { isValidCron } from "@agents/cron";
import type { ActionState } from "@/lib/actions/workspace";

/**
 * Phase-5 worker actions. The Phase-2 `startRun` in lib/actions/workspace.ts
 * keeps its exact contract — these actions expose the richer worker surface
 * (goal override, mode, cancel/resume, config editing) on top of the same
 * orchestrator.
 */

function agentError(err: unknown, fallback: string): ActionState {
  if (err instanceof AgentError) return { error: err.message };
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Check your inputs." };
  console.error("[actions/agents]", err);
  return { error: fallback };
}

const dispatchSchema = z.object({
  goal: z.string().trim().min(3).max(4000).optional(),
  mode: z.enum(["LIVE", "SHADOW"]).optional(),
});

/** Queue a run for an agent (optionally with a goal override + mode). */
export async function dispatchAgent(agentId: string, input: { goal?: string; mode?: "LIVE" | "SHADOW" } = {}): Promise<ActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "agents.run");
  if (denied) return { error: denied };

  const parsed = dispatchSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };

  try {
    const runtime = getAgentRuntime();
    await runtime.orchestrator.dispatch({
      workspaceId: ctx.workspace.id,
      agentId,
      byUserId: ctx.user.id,
      triggerSource: "manual",
      ...(parsed.data.goal ? { goal: parsed.data.goal } : {}),
      ...(parsed.data.mode ? { mode: parsed.data.mode } : {}),
    });
  } catch (err) {
    return agentError(err, "Could not queue the run.");
  }

  revalidatePath("/dashboard/runs");
  revalidatePath(`/dashboard/agents/${agentId}`);
  return { ok: true };
}

/** Kill switch for an active run. */
export async function cancelAgentRun(runId: string): Promise<ActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "agents.run");
  if (denied) return { error: denied };

  try {
    const runtime = getAgentRuntime();
    await runtime.orchestrator.cancelRun(ctx.workspace.id, runId, ctx.user.id);
  } catch (err) {
    return agentError(err, "Could not cancel the run.");
  }
  revalidatePath(`/dashboard/runs/${runId}`);
  revalidatePath("/dashboard/runs");
  return { ok: true };
}

/** Resume a run parked on a human-approval gate. */
export async function resumeAgentRun(runId: string): Promise<ActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "agents.run");
  if (denied) return { error: denied };

  try {
    const runtime = getAgentRuntime();
    await runtime.orchestrator.resumeRun(ctx.workspace.id, runId, ctx.user.id);
  } catch (err) {
    return agentError(err, "Could not resume the run.");
  }
  revalidatePath(`/dashboard/runs/${runId}`);
  return { ok: true };
}

const workerConfigSchema = z.object({
  workerType: workerTypeSchema,
  goal: z.string().trim().max(4000).nullable(),
  instructions: z.string().trim().max(4000).nullable(),
  toolPolicy: toolPolicySchema,
  budget: workerBudgetSchema,
  trigger: z.enum(["MANUAL", "SCHEDULE", "WEBHOOK", "EVENT"]),
  schedule: z.string().trim().max(60).nullable(),
});

/** Edit the worker configuration of an existing agent. */
export async function updateAgentWorkerConfig(agentId: string, input: unknown): Promise<ActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "agents.create");
  if (denied) return { error: denied };

  const parsed = workerConfigSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  const data = parsed.data;

  if (data.trigger === "SCHEDULE") {
    if (!data.schedule) return { error: "Scheduled workers need a cron expression." };
    if (!isValidCron(data.schedule)) return { error: "Not a valid 5-field cron expression." };
  }

  const agent = await db.agent.findFirst({ where: { id: agentId, workspaceId: ctx.workspace.id, deletedAt: null } });
  if (!agent) return { error: "Agent not found in this workspace." };

  await db.agent.update({
    where: { id: agent.id },
    data: {
      workerType: data.workerType,
      goal: data.goal?.trim() || null,
      instructions: data.instructions?.trim() || null,
      toolPolicy: data.toolPolicy as object,
      budget: data.budget as object,
      trigger: data.trigger,
      schedule: data.trigger === "SCHEDULE" ? data.schedule : null,
    },
  });

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.agentWorkerUpdate,
    targetType: "agent",
    targetId: agent.id,
    metadata: { workerType: data.workerType, trigger: data.trigger },
  });

  revalidatePath(`/dashboard/agents/${agentId}`);
  revalidatePath("/dashboard/agents");
  return { ok: true };
}

// ── Phase 7 · Multi-agent teams ──────────────────────────────────────────

import {
  createTeam,
  updateTeam,
  deleteTeam,
  runTeam,
  type TeamInput,
} from "@/lib/agents/teams";
import {
  teamCreateApiSchema,
  teamUpdateApiSchema,
  teamRunApiSchema,
} from "@/lib/validations/agents";

/** Create a team (leader + roster). */
export async function createAgentTeam(input: TeamInput): Promise<ActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;
  const denied = checkPermission(ctx, "agents.create");
  if (denied) return { error: denied };
  const parsed = teamCreateApiSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  try {
    const team = await createTeam(ctx.workspace.id, ctx.user.id, parsed.data);
    revalidatePath("/dashboard/teams");
    return { ok: true, value: team.id };
  } catch (err) {
    return agentError(err, "Could not create the team.");
  }
}

/** Update team fields; `members` (when present) replaces the roster. */
export async function updateAgentTeam(id: string, patch: Partial<TeamInput>): Promise<ActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;
  const denied = checkPermission(ctx, "agents.create");
  if (denied) return { error: denied };
  const parsed = teamUpdateApiSchema.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  try {
    await updateTeam(ctx.workspace.id, ctx.user.id, id, parsed.data);
    revalidatePath("/dashboard/teams");
    revalidatePath(`/dashboard/teams/${id}`);
    return { ok: true };
  } catch (err) {
    return agentError(err, "Could not update the team.");
  }
}

/** Delete a team; historical runs keep their lineage (teamId cleared). */
export async function deleteAgentTeam(id: string): Promise<ActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;
  const denied = checkPermission(ctx, "agents.create");
  if (denied) return { error: denied };
  try {
    await deleteTeam(ctx.workspace.id, ctx.user.id, id);
    revalidatePath("/dashboard/teams");
    return { ok: true };
  } catch (err) {
    return agentError(err, "Could not delete the team.");
  }
}

/** Dispatch the team: leader + composed briefing through the same orchestrator. */
export async function runAgentTeam(id: string, input: { goal: string; mode?: "LIVE" | "SHADOW" }): Promise<ActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;
  const denied = checkPermission(ctx, "agents.run");
  if (denied) return { error: denied };
  const parsed = teamRunApiSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  try {
    const result = await runTeam(ctx.workspace.id, ctx.user.id, id, parsed.data);
    revalidatePath("/dashboard/runs");
    revalidatePath(`/dashboard/teams/${id}`);
    return { ok: true, value: result.run.id };
  } catch (err) {
    return agentError(err, "Could not queue the team run.");
  }
}
