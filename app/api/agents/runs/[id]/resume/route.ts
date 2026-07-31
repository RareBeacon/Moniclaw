import { getAgentRuntime } from "@/lib/agents/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/agents/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/agents/runs/[id]/resume — continue after the linked approval is APPROVED. */
export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request, "agents.run");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const runtime = getAgentRuntime();
    const run = await runtime.orchestrator.resumeRun(g.principal.workspace.id, id, g.principal.userId);
    return ok({ run });
  } catch (err) {
    return errorResponse(err);
  }
}
