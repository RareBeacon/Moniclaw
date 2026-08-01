import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/sales/api";
import { SalesError, SALES_ENROLLMENT_STATUSES } from "@sales/index";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/sales/campaigns/[id]/enrollments — list (status filter). */
export async function GET(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const q = z.object({ status: z.enum(SALES_ENROLLMENT_STATUSES).optional() })
      .parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const repos = getSalesRuntime().repos;
    const campaign = await repos.campaigns.get(g.principal.workspace.id, id);
    if (!campaign) throw new SalesError("not_found", "Campaign not found.");
    const enrollments = await repos.campaigns.listEnrollments(id, { ...(q.status ? { status: q.status } : {}) });
    return ok({ enrollments });
  } catch (err) {
    return errorResponse(err);
  }
}
