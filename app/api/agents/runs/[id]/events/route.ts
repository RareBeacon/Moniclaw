import { getAgentRuntime } from "@/lib/agents/runtime";
import { errorResponse, fail, guard, isGuarded, ok } from "@/lib/agents/api";
import { eventListQuerySchema } from "@/lib/validations/agents";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/agents/runs/[id]/events?after=<iso ts>&limit= — evidence trail. */
export async function GET(request: Request, ctx: Ctx) {
  const g = await guard(request, "agents.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const url = new URL(request.url);
    const query = eventListQuerySchema.parse({
      after: url.searchParams.get("after") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const runtime = getAgentRuntime();
    const run = await runtime.repos.runs.get(g.principal.workspace.id, id);
    if (!run) return fail(404, "not_found", "Run not found.");
    const events = await runtime.repos.events.list(run.id, {
      ...(query.after ? { afterTs: new Date(query.after) } : {}),
      limit: query.limit,
    });
    return ok({ events, status: run.status });
  } catch (err) {
    return errorResponse(err);
  }
}
