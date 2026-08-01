import { createTeam, listTeams } from "@/lib/agents/teams";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/agents/api";
import { teamCreateApiSchema } from "@/lib/validations/agents";

export const dynamic = "force-dynamic";

/**
 * /api/agent-teams — Phase 7 multi-agent teams.
 * GET: workspace teams with rosters + run counts.
 * POST: create a team (leader + up to 12 members, optional budget override).
 */

export async function GET(request: Request) {
  const g = await guard(request, "agents.read");
  if (isGuarded(g)) return g.response;
  try {
    const teams = await listTeams(g.principal.workspace.id);
    return ok({ teams });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  const g = await guard(request, "agents.create");
  if (isGuarded(g)) return g.response;
  try {
    const input = teamCreateApiSchema.parse(await readJson(request));
    const team = await createTeam(g.principal.workspace.id, g.principal.userId, input);
    return ok({ team }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
