import { decideDraft } from "@/lib/sales/drafts";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { draftRejectApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/sales/drafts/[id]/reject — manager decision; reason kept. */
export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.drafts.review");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const { note } = draftRejectApiSchema.parse(await readJson(request));
    const draft = await decideDraft(g.principal.workspace.id, g.principal.userId, id, "REJECTED", note);
    return ok({ draft });
  } catch (err) {
    return errorResponse(err);
  }
}
