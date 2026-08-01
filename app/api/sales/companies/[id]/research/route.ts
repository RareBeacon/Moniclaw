import { SalesError } from "@sales/index";
import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/sales/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/sales/companies/[id]/research — queue the research worker.
 * Dedupes in-flight requests; run lands on the record via refresh (GET here
 * or any detail view). Public sources only — enforced in the worker goal.
 */
export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.research.run", { rate: "salesResearch" });
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const result = await getSalesRuntime().research.requestResearch(
      g.principal.workspace.id, id, g.principal.userId
    );
    return ok(result, { status: result.reused ? 200 : 202 });
  } catch (err) {
    return errorResponse(err);
  }
}

/** GET …/research — current status; reconciles a finished run on demand. */
export async function GET(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const runtime = getSalesRuntime();
    await runtime.research.refreshResearch(g.principal.workspace.id, id, null);
    const company = await runtime.repos.companies.get(g.principal.workspace.id, id);
    if (!company) throw new SalesError("not_found", "Company not found.");
    return ok({
      researchStatus: company.researchStatus,
      lastResearchedAt: company.lastResearchedAt,
      lastResearchRunId: company.lastResearchRunId,
      summary: company.summary,
      sources: company.sources,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
