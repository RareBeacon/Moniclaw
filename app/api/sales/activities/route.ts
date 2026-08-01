import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { activityCreateApiSchema, activityListQuerySchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

/** GET /api/sales/activities — timeline (entity filters, open-only, due). */
export async function GET(request: Request) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const q = activityListQuerySchema.parse(params);
    const activities = await getSalesRuntime().repos.activities.list(g.principal.workspace.id, {
      ...(q.companyId ? { companyId: q.companyId } : {}),
      ...(q.contactId ? { contactId: q.contactId } : {}),
      ...(q.dealId ? { dealId: q.dealId } : {}),
      ...(q.openOnly !== undefined ? { openOnly: q.openOnly } : {}),
      ...(q.dueBefore ? { dueBefore: new Date(q.dueBefore) } : {}),
      take: q.take,
    });
    return ok({ activities });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/sales/activities — log a note/task/call/meeting/email/reminder. */
export async function POST(request: Request) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const input = activityCreateApiSchema.parse(await readJson(request));
    const activity = await getSalesRuntime().crm.logActivity(g.principal.workspace.id, g.principal.userId, input);
    return ok({ activity }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
