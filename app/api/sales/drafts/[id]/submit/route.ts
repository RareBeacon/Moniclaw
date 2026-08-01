import { submitDraftForReview } from "@/lib/sales/drafts";
import { errorResponse, guard, isGuarded, ok } from "@/lib/sales/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/sales/drafts/[id]/submit — DRAFT/REJECTED → PENDING_REVIEW. */
export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const result = await submitDraftForReview(g.principal.workspace.id, g.principal.userId, id);
    return ok(result, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
