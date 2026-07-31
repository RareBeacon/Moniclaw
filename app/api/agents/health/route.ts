import { getAgentRuntime } from "@/lib/agents/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/agents/api";

export const dynamic = "force-dynamic";

/** GET /api/agents/health — worker engine diagnostics (queue, counts). */
export async function GET(request: Request) {
  const g = await guard(request, "agents.read");
  if (isGuarded(g)) return g.response;
  try {
    const runtime = getAgentRuntime();
    const [queued, running, awaiting, agents] = await Promise.all([
      runtime.repos.runs.list(g.principal.workspace.id, { status: "QUEUED", limit: 200 }),
      runtime.repos.runs.list(g.principal.workspace.id, { status: "RUNNING", limit: 200 }),
      runtime.repos.runs.list(g.principal.workspace.id, { status: "NEEDS_APPROVAL", limit: 200 }),
      runtime.repos.agents.list(g.principal.workspace.id),
    ]);
    return ok({
      status: "ok",
      queue: runtime.queue.stats(),
      runs: { queued: queued.length, running: running.length, awaitingApproval: awaiting.length },
      agents: { total: agents.length },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
