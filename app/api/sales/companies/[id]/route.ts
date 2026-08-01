import { SalesError } from "@sales/index";
import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { companyUpdateApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/sales/companies/[id] — detail; lazily reconciles research runs. */
export async function GET(_request: Request, ctx: Ctx) {
  const g = await guard(_request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const runtime = getSalesRuntime();
    const company = await runtime.repos.companies.get(g.principal.workspace.id, id);
    if (!company) throw new SalesError("not_found", "Company not found.");
    // Idempotent reconcile — a run finished between page loads lands cleanly.
    if (company.researchStatus === "QUEUED" || company.researchStatus === "RUNNING") {
      await runtime.research.refreshResearch(g.principal.workspace.id, id, null);
    }
    const fresh = await runtime.repos.companies.get(g.principal.workspace.id, id);
    const [contacts, deals, activities, counts] = await Promise.all([
      runtime.repos.contacts.listByCompany(g.principal.workspace.id, id, 20),
      runtime.repos.deals.list(g.principal.workspace.id, { take: 50 }).then((all) => all.filter((d) => d.companyId === id)),
      runtime.repos.activities.list(g.principal.workspace.id, { companyId: id, take: 30 }),
      runtime.repos.companies.countsByCompany(g.principal.workspace.id, id),
    ]);
    return ok({ company: fresh, contacts, deals, activities, counts });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PATCH /api/sales/companies/[id] — update (rescored on write). */
export async function PATCH(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const patch = companyUpdateApiSchema.parse(await readJson(request));
    const company = await getSalesRuntime().crm.updateCompany(g.principal.workspace.id, g.principal.userId, id, patch);
    return ok({ company });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/sales/companies/[id] — soft delete (audit trail retained). */
export async function DELETE(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    await getSalesRuntime().crm.deleteCompany(g.principal.workspace.id, g.principal.userId, id);
    return ok({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
