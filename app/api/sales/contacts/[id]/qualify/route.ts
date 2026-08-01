import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/sales/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/sales/contacts/[id]/qualify — mark QUALIFIED (audited). */
export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const contact = await getSalesRuntime().crm.qualifyContact(g.principal.workspace.id, g.principal.userId, id);
    return ok({ contact });
  } catch (err) {
    return errorResponse(err);
  }
}
