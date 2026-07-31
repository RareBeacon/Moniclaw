import { getAgentRuntime } from "@/lib/agents/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/agents/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/agents/runs/[id]/cancel — kill switch. */
export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request, "agents.run");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const runtime = getAgentRuntime();
    const run = await runtime.orchestrator.cancelRun(g.principal.workspace.id, id, g.principal.userId);
    return ok({ run });
  } catch (err) {
    return errorResponse(err);
  }
}
