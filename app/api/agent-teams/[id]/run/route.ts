import { runTeam } from "@/lib/agents/teams";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/agents/api";
import { teamRunApiSchema } from "@/lib/validations/agents";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/agent-teams/[id]/run — dispatch the team's leader through the
 * standard orchestrator with a composed team briefing (202 on a fresh run).
 * The leader must hold the allowDelegation capability — safe-by-default; the
 * error names the exact fix. Shares the agentsRun per-workspace budget.
 */
export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request, "agents.run", { rate: "agentsRun" });
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const input = teamRunApiSchema.parse(await readJson(request));
    const result = await runTeam(g.principal.workspace.id, g.principal.userId, id, input);
    return ok(result, { status: result.run.status === "QUEUED" && !result.deduplicated ? 202 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
