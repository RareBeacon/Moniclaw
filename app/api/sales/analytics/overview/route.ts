import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/sales/api";

export const dynamic = "force-dynamic";

/** GET /api/sales/analytics/overview — dashboard rollup across modules. */
export async function GET(request: Request) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const overview = await getSalesRuntime().analytics.overview(g.principal.workspace.id);
    return ok({ overview });
  } catch (err) {
    return errorResponse(err);
  }
}
