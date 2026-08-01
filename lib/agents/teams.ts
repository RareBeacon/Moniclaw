import { AgentError, resolveToolPolicy, workerBudgetSchema, type WorkerBudget } from "@agents/index";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getAgentRuntime } from "@/lib/agents/runtime";
import { composeTeamBriefing, slugify } from "@/lib/agents/team-briefing";

export { slugify, composeTeamBriefing } from "@/lib/agents/team-briefing";

/**
 * Phase 7 — Multi-agent teams (service layer).
 *
 * A team is a NAMED delegation topology: one leader + members with playbook
 * hints. `runTeam` dispatches the leader through the exact same orchestrator
 * path as a solo run — same dispatch function, same status/idempotency/
 * evidence rules — then stamps the run with `teamId`. No parallel engine:
 * delegation itself stays capability-gated (`allowDelegation`), depth-capped,
 * budget-shared and cycle-guarded by the Phase 5 runtime.
 */

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export interface TeamMemberInput {
  agentId: string;
  promptHint?: string | null;
  position?: number;
}

export interface TeamInput {
  name: string;
  slug?: string;
  description?: string | null;
  leaderAgentId?: string | null;
  members?: TeamMemberInput[];
  budget?: unknown;
}

const AGENT_SUMMARY = {
  id: true, name: true, slug: true, status: true, workerType: true,
  description: true, toolPolicy: true, deletedAt: true,
} as const;

async function assertAgentsInWorkspace(workspaceId: string, agentIds: string[]) {
  if (agentIds.length === 0) return;
  const found = await db.agent.count({
    where: { id: { in: agentIds }, workspaceId, deletedAt: null },
  });
  if (found !== agentIds.length) {
    throw new AgentError("validation", "Every member (and the leader) must be an agent in this workspace.");
  }
}

function parseBudget(raw: unknown): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null) return undefined;
  const parsed = workerBudgetSchema.partial().safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    throw new AgentError("validation", `Team budget is invalid: ${parsed.success ? "empty" : parsed.error.issues[0]?.message}`);
  }
  return parsed.data as Record<string, unknown>;
}

export async function listTeams(workspaceId: string) {
  const teams = await db.agentTeam.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    include: {
      leader: { select: AGENT_SUMMARY },
      members: { orderBy: { position: "asc" }, include: { agent: { select: AGENT_SUMMARY } } },
      _count: { select: { runs: true } },
    },
  });
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    leader: t.leader
      ? { id: t.leader.id, name: t.leader.name, slug: t.leader.slug, status: t.leader.status }
      : null,
    members: t.members.map((m) => ({
      agentId: m.agentId,
      name: m.agent.name,
      slug: m.agent.slug,
      status: m.agent.status,
      promptHint: m.promptHint,
      position: m.position,
    })),
    budget: t.budget,
    runCount: t._count.runs,
    createdAt: t.createdAt,
  }));
}

export async function getTeam(workspaceId: string, id: string) {
  const team = await db.agentTeam.findFirst({
    where: { id, workspaceId },
    include: {
      leader: { select: AGENT_SUMMARY },
      members: { orderBy: { position: "asc" }, include: { agent: { select: AGENT_SUMMARY } } },
    },
  });
  if (!team) throw new AgentError("not_found", "Team not found.");
  return team;
}

async function uniqueSlug(workspaceId: string, desired: string, excludeId?: string) {
  let slug = desired;
  for (let i = 2; ; i++) {
    const clash = await db.agentTeam.findFirst({
      where: { workspaceId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!clash) return slug;
    slug = `${desired}-${i}`.slice(0, 60);
    if (i > 20) throw new AgentError("run_conflict", `Slug "${desired}" is taken.`);
  }
}

export async function createTeam(workspaceId: string, actorId: string | null, input: TeamInput) {
  const members = input.members ?? [];
  if (members.length > 0 && input.leaderAgentId && members.some((m) => m.agentId === input.leaderAgentId)) {
    throw new AgentError("validation", "The leader delegates; it is not also a member.");
  }
  await assertAgentsInWorkspace(
    workspaceId,
    [input.leaderAgentId, ...members.map((m) => m.agentId)].filter((x): x is string => typeof x === "string")
  );
  const requested = (input.slug ?? slugify(input.name)).toLowerCase();
  if (!SLUG_RE.test(requested)) throw new AgentError("validation", "Slug: lowercase letters, digits, dashes.");
  const slug = await uniqueSlug(workspaceId, requested);
  const budget = parseBudget(input.budget);

  const team = await db.agentTeam.create({
    data: {
      workspaceId,
      name: input.name,
      slug,
      description: input.description ?? null,
      leaderAgentId: input.leaderAgentId ?? null,
      ...(budget ? { budget: budget as Prisma.InputJsonValue } : {}),
      createdById: actorId,
      members: {
        create: members.map((m, i) => ({
          agentId: m.agentId,
          promptHint: m.promptHint ?? null,
          position: m.position ?? i,
        })),
      },
    },
  });
  await audit({
    workspaceId, actorId, action: "agents.team.create",
    targetType: "agent_team", targetId: team.id,
    metadata: { name: team.name, leaderAgentId: team.leaderAgentId, members: members.length },
  });
  return team;
}

export async function updateTeam(
  workspaceId: string,
  actorId: string | null,
  id: string,
  patch: Partial<TeamInput>
) {
  const existing = await db.agentTeam.findFirst({ where: { id, workspaceId } });
  if (!existing) throw new AgentError("not_found", "Team not found.");

  if (patch.leaderAgentId || patch.members) {
    const memberIds = (patch.members ?? []).map((m) => m.agentId);
    const leader = patch.leaderAgentId ?? existing.leaderAgentId;
    if (leader && memberIds.includes(leader)) {
      throw new AgentError("validation", "The leader delegates; it is not also a member.");
    }
    await assertAgentsInWorkspace(workspaceId, [leader, ...memberIds].filter((x): x is string => typeof x === "string"));
  }
  if (patch.slug && !SLUG_RE.test(patch.slug.toLowerCase())) {
    throw new AgentError("validation", "Slug: lowercase letters, digits, dashes.");
  }
  const budget = patch.budget !== undefined ? parseBudget(patch.budget) : undefined;

  const team = await db.$transaction(async (tx) => {
    const updated = await tx.agentTeam.update({
      where: { id: existing.id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.slug ? { slug: await uniqueSlug(workspaceId, patch.slug.toLowerCase(), existing.id) } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.leaderAgentId !== undefined
          ? { leader: patch.leaderAgentId ? { connect: { id: patch.leaderAgentId } } : { disconnect: true } }
          : {}),
        ...(patch.budget !== undefined ? { budget: (budget ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.JsonNullValueInput } : {}),
      },
    });
    if (patch.members) {
      await tx.agentTeamMember.deleteMany({ where: { teamId: existing.id } });
      if (patch.members.length) {
        await tx.agentTeamMember.createMany({
          data: patch.members.map((m, i) => ({
            teamId: existing.id,
            agentId: m.agentId,
            promptHint: m.promptHint ?? null,
            position: m.position ?? i,
          })),
        });
      }
    }
    return updated;
  });
  await audit({
    workspaceId, actorId, action: "agents.team.update",
    targetType: "agent_team", targetId: team.id,
    metadata: { changed: Object.keys(patch) },
  });
  return team;
}

export async function deleteTeam(workspaceId: string, actorId: string | null, id: string) {
  const existing = await db.agentTeam.findFirst({ where: { id, workspaceId }, select: { id: true, name: true } });
  if (!existing) throw new AgentError("not_found", "Team not found.");
  await db.agentTeam.delete({ where: { id: existing.id } }); // runs keep history (teamId → NULL)
  await audit({
    workspaceId, actorId, action: "agents.team.delete",
    targetType: "agent_team", targetId: existing.id,
    metadata: { name: existing.name },
  });
  return { deleted: true as const };
}

// ── Run ──────────────────────────────────────────────────────────────────

export interface TeamRunInput {
  goal: string;
  mode?: "LIVE" | "SHADOW";
  idempotencyKey?: string;
}

export async function runTeam(
  workspaceId: string,
  actorId: string | null,
  id: string,
  input: TeamRunInput
) {
  const team = await getTeam(workspaceId, id);
  if (!team.leader) {
    throw new AgentError("agent_unavailable", "This team has no leader — set one before running.");
  }
  if (team.members.length === 0) {
    throw new AgentError("validation", "A team run needs at least one member to delegate to.");
  }
  // Capability-gated: the leader must be allowed to delegate (safe-by-default).
  const policy = resolveToolPolicy(team.leader.toolPolicy);
  if (!policy.allowDelegation) {
    throw new AgentError(
      "delegation_denied",
      `The leader "${team.leader.name}" cannot delegate yet — enable "allowDelegation" in its tool policy (Agents → ${team.leader.name} → edit → tool policy), then run the team again.`,
      { leaderAgentId: team.leader.id, leaderSlug: team.leader.slug }
    );
  }

  const composedGoal = `${input.goal}\n\n--- TEAM BRIEFING ---\n${composeTeamBriefing(team)}`;
  const runtime = getAgentRuntime();
  const { run, deduplicated } = await runtime.orchestrator.dispatch({
    workspaceId,
    agentId: team.leader.id,
    byUserId: actorId,
    triggerSource: "team",
    goal: composedGoal,
    data: {
      teamId: team.id,
      teamName: team.name,
      memberSlugs: team.members.map((m) => m.agent.slug),
      userGoal: input.goal,
    },
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.idempotencyKey ? { idempotencyKey: `team:${team.id}:${input.idempotencyKey}` } : {}),
    budgetOverride: (team.budget ?? undefined) as Partial<WorkerBudget> | undefined,
  });
  if (!deduplicated) {
    await db.agentRun.update({ where: { id: run.id }, data: { teamId: team.id } });
  }
  await audit({
    workspaceId, actorId, action: "agents.team.run",
    targetType: "agent_team", targetId: team.id,
    metadata: { runId: run.id, deduplicated, leaderAgentId: team.leader.id },
  });
  return { run: { ...run, teamId: team.id }, deduplicated, team: { id: team.id, name: team.name, slug: team.slug } };
}
