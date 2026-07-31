import { getAgentRuntime } from "@/lib/agents/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/agents/api";
import { dispatchApiSchema } from "@/lib/validations/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/agents/[id]/dispatch — queue a run (202). Idempotent by key. */
export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request, "agents.run", { rate: "agentsRun" });
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const parsed = dispatchApiSchema.parse(await readJson(request));
    const runtime = getAgentRuntime();
    const { run, deduplicated } = await runtime.orchestrator.dispatch({
      workspaceId: g.principal.workspace.id,
      agentId: id,
      byUserId: g.principal.userId,
      triggerSource: "api",
      ...(parsed.goal !== undefined ? { goal: parsed.goal } : {}),
      ...(parsed.data !== undefined ? { data: parsed.data } : {}),
      ...(parsed.mode !== undefined ? { mode: parsed.mode } : {}),
      ...(parsed.idempotencyKey !== undefined ? { idempotencyKey: parsed.idempotencyKey } : {}),
    });
    return ok({ run, deduplicated }, { status: run.status === "QUEUED" && !deduplicated ? 202 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
