import { rescheduleDraft } from "@/lib/sales/drafts";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { draftRescheduleApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/sales/drafts/[id]/reschedule — approved drafts to SCHEDULED. */
export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const { scheduledAt } = draftRescheduleApiSchema.parse(await readJson(request));
    const draft = await rescheduleDraft(g.principal.workspace.id, g.principal.userId, id, new Date(scheduledAt));
    return ok({ draft });
  } catch (err) {
    return errorResponse(err);
  }
}
