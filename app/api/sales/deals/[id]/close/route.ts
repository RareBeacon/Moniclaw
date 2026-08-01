import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { dealCloseApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/sales/deals/[id]/close — WON/LOST (terminal, audited). */
export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const { status, lostReason } = dealCloseApiSchema.parse(await readJson(request));
    const deal = await getSalesRuntime().crm.closeDeal(
      g.principal.workspace.id, g.principal.userId, id, status, lostReason
    );
    return ok({ deal });
  } catch (err) {
    return errorResponse(err);
  }
}
