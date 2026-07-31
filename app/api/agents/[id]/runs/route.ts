import { getAgentRuntime } from "@/lib/agents/runtime";
import { errorResponse, fail, guard, isGuarded, ok } from "@/lib/agents/api";
import { runListQuerySchema } from "@/lib/validations/agents";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/agents/[id]/runs — run history for one worker. */
export async function GET(request: Request, ctx: Ctx) {
  const g = await guard(request, "agents.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const query = runListQuerySchema.parse({
      status: new URL(request.url).searchParams.get("status") ?? undefined,
      limit: new URL(request.url).searchParams.get("limit") ?? undefined,
    });
    const runtime = getAgentRuntime();
    const agent = await runtime.repos.agents.get(g.principal.workspace.id, id);
    if (!agent) return fail(404, "not_found", "Agent not found.");
    const runs = await runtime.repos.runs.list(g.principal.workspace.id, {
      agentId: id,
      ...(query.status ? { status: query.status } : {}),
      limit: query.limit,
    });
    return ok({ runs });
  } catch (err) {
    return errorResponse(err);
  }
}
