import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePrincipal } from "@/lib/api-auth";
import { getAgentRuntime } from "@/lib/agents/runtime";
import { errorResponse, guard, isGuarded, ok, readJson, fail } from "@/lib/agents/api";
import { agentUpdateApiSchema } from "@/lib/validations/agents";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/agents/[id] — worker detail incl. recent runs. */
export async function GET(request: Request, ctx: Ctx) {
  const g = await guard(request, "agents.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const runtime = getAgentRuntime();
    const agent = await runtime.repos.agents.get(g.principal.workspace.id, id);
    if (!agent) return fail(404, "not_found", "Agent not found.");
    const runs = await runtime.repos.runs.list(g.principal.workspace.id, { agentId: id, limit: 10 });
    return ok({ agent, recentRuns: runs });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PATCH /api/agents/[id] — update worker config (promotion to AUTONOMOUS needs agents.promote). */
export async function PATCH(request: Request, ctx: Ctx) {
  const g = await guard(request, "agents.create");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const runtime = getAgentRuntime();
    const existing = await runtime.repos.agents.get(g.principal.workspace.id, id);
    if (!existing) return fail(404, "not_found", "Agent not found.");

    const parsed = agentUpdateApiSchema.parse(await readJson(request));
    if (parsed.status === "AUTONOMOUS" && existing.status !== "AUTONOMOUS") {
      const denied = requirePrincipal(g.principal, "agents.promote");
      if (denied) return denied;
    }

    const agent = await db.agent.update({
      where: { id: existing.id },
      data: {
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        ...(parsed.description !== undefined ? { description: parsed.description } : {}),
        ...(parsed.category !== undefined ? { category: parsed.category } : {}),
        ...(parsed.workerType !== undefined ? { workerType: parsed.workerType } : {}),
        ...(parsed.goal !== undefined ? { goal: parsed.goal } : {}),
        ...(parsed.instructions !== undefined ? { instructions: parsed.instructions } : {}),
        ...(parsed.skills !== undefined ? { skills: parsed.skills } : {}),
        ...(parsed.toolPolicy !== undefined ? { toolPolicy: parsed.toolPolicy as object } : {}),
        ...(parsed.budget !== undefined ? { budget: parsed.budget as object } : {}),
        ...(parsed.trigger !== undefined ? { trigger: parsed.trigger } : {}),
        ...(parsed.schedule !== undefined ? { schedule: parsed.schedule } : {}),
        ...(parsed.status !== undefined ? { status: parsed.status } : {}),
      },
    });
    await audit({
      workspaceId: g.principal.workspace.id,
      actorId: g.principal.userId,
      action: "agent.worker.update",
      targetType: "agent",
      targetId: agent.id,
      metadata: { fields: Object.keys(parsed) },
    });
    return ok({ agent });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/agents/[id] — archive (soft delete; evidence retained). */
export async function DELETE(request: Request, ctx: Ctx) {
  const g = await guard(request, "agents.archive");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const runtime = getAgentRuntime();
    const existing = await runtime.repos.agents.get(g.principal.workspace.id, id);
    if (!existing) return fail(404, "not_found", "Agent not found.");
    await db.agent.update({ where: { id: existing.id }, data: { status: "ARCHIVED", deletedAt: new Date() } });
    await audit({
      workspaceId: g.principal.workspace.id,
      actorId: g.principal.userId,
      action: "agent.archive",
      targetType: "agent",
      targetId: existing.id,
      metadata: { slug: existing.slug },
    });
    return ok({ archived: true });
  } catch (err) {
    return errorResponse(err);
  }
}
