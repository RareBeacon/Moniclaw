import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { dealCreateApiSchema, salesSearchFiltersSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

/** GET /api/sales/deals — list (pipeline/stage/status filters). */
export async function GET(request: Request) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const filters = salesSearchFiltersSchema.parse({
      ...params,
      ...(typeof params.tags === "string" ? { tags: params.tags.split(",").filter(Boolean) } : {}),
    });
    const deals = await getSalesRuntime().repos.deals.list(g.principal.workspace.id, filters);
    return ok({ deals });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/sales/deals — create (pipeline/stage defaulting via service). */
export async function POST(request: Request) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const input = dealCreateApiSchema.parse(await readJson(request));
    const deal = await getSalesRuntime().crm.createDeal(g.principal.workspace.id, g.principal.userId, input);
    return ok({ deal }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
