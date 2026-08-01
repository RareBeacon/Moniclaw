import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { companyCreateApiSchema, salesSearchFiltersSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

/** GET /api/sales/companies — search + filter the company book. */
export async function GET(request: Request) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    // tags arrive comma-separated in a query string
    const filters = salesSearchFiltersSchema.parse({
      ...params,
      ...(typeof params.tags === "string" ? { tags: params.tags.split(",").filter(Boolean) } : {}),
    });
    const companies = await getSalesRuntime().repos.companies.list(g.principal.workspace.id, filters);
    return ok({ companies });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/sales/companies — create (domain-deduped, scored on write). */
export async function POST(request: Request) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const input = companyCreateApiSchema.parse(await readJson(request));
    const runtime = getSalesRuntime();
    const company = await runtime.crm.createCompany(g.principal.workspace.id, g.principal.userId, input);
    return ok({ company }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
