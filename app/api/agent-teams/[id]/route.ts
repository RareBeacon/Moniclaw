import { deleteTeam, getTeam, updateTeam } from "@/lib/agents/teams";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/agents/api";
import { teamUpdateApiSchema } from "@/lib/validations/agents";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/agent-teams/[id] — roster + config. */
export async function GET(request: Request, ctx: Ctx) {
  const g = await guard(request, "agents.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const team = await getTeam(g.principal.workspace.id, id);
    return ok({ team });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PATCH /api/agent-teams/[id] — partial update; members list replaces wholesale. */
export async function PATCH(request: Request, ctx: Ctx) {
  const g = await guard(request, "agents.create");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const patch = teamUpdateApiSchema.parse(await readJson(request));
    const team = await updateTeam(g.principal.workspace.id, g.principal.userId, id, patch);
    return ok({ team });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/agent-teams/[id] — past runs keep their history (teamId → NULL). */
export async function DELETE(request: Request, ctx: Ctx) {
  const g = await guard(request, "agents.create");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const result = await deleteTeam(g.principal.workspace.id, g.principal.userId, id);
    return ok(result);
  } catch (err) {
    return errorResponse(err);
  }
}
