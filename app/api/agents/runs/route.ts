import { getAgentRuntime } from "@/lib/agents/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/agents/api";
import { runListQuerySchema } from "@/lib/validations/agents";

export const dynamic = "force-dynamic";

/** GET /api/agents/runs — workspace-wide run feed (?agentId=&status=&limit=). */
export async function GET(request: Request) {
  const g = await guard(request, "agents.read");
  if (isGuarded(g)) return g.response;
  try {
    const url = new URL(request.url);
    const query = runListQuerySchema.parse({
      agentId: url.searchParams.get("agentId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const runtime = getAgentRuntime();
    const runs = await runtime.repos.runs.list(g.principal.workspace.id, {
      ...(query.agentId ? { agentId: query.agentId } : {}),
      ...(query.status ? { status: query.status } : {}),
      limit: query.limit,
    });
    return ok({ runs });
  } catch (err) {
    return errorResponse(err);
  }
}
