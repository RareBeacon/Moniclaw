import { getAgentRuntime } from "@/lib/agents/runtime";
import { errorResponse, fail, guard, isGuarded, ok } from "@/lib/agents/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/agents/runs/[id] — run detail with output, progress and children. */
export async function GET(request: Request, ctx: Ctx) {
  const g = await guard(request, "agents.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const runtime = getAgentRuntime();
    const run = await runtime.repos.runs.get(g.principal.workspace.id, id);
    if (!run) return fail(404, "not_found", "Run not found.");
    const [agent, children] = await Promise.all([
      runtime.repos.agents.get(run.workspaceId, run.agentId),
      runtime.repos.runs.listChildren(run.id),
    ]);
    return ok({ run, agent: agent ? { id: agent.id, name: agent.name, slug: agent.slug, workerType: agent.workerType } : null, children });
  } catch (err) {
    return errorResponse(err);
  }
}
