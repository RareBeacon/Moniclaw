import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { dealMoveApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/sales/deals/[id]/move — stage transition (guarded, audited). */
export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const { stageId } = dealMoveApiSchema.parse(await readJson(request));
    const deal = await getSalesRuntime().crm.moveDealStage(g.principal.workspace.id, g.principal.userId, id, stageId);
    return ok({ deal });
  } catch (err) {
    return errorResponse(err);
  }
}
