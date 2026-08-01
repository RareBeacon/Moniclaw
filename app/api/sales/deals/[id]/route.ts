import { SalesError } from "@sales/index";
import { audit } from "@/lib/audit";
import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { dealUpdateApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/sales/deals/[id] — detail with pipeline context + activities. */
export async function GET(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const runtime = getSalesRuntime();
    const deal = await runtime.repos.deals.get(g.principal.workspace.id, id);
    if (!deal) throw new SalesError("not_found", "Deal not found.");
    const [pipeline, company, contact, activities] = await Promise.all([
      runtime.repos.pipelines.get(g.principal.workspace.id, deal.pipelineId),
      runtime.repos.companies.get(g.principal.workspace.id, deal.companyId),
      deal.primaryContactId ? runtime.repos.contacts.get(g.principal.workspace.id, deal.primaryContactId) : null,
      runtime.repos.activities.list(g.principal.workspace.id, { dealId: id, take: 30 }),
    ]);
    return ok({ deal, pipeline, company, contact, activities });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PATCH /api/sales/deals/[id] — update commercial fields (audited). */
export async function PATCH(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const patch = dealUpdateApiSchema.parse(await readJson(request));
    const runtime = getSalesRuntime();
    const existing = await runtime.repos.deals.get(g.principal.workspace.id, id);
    if (!existing) throw new SalesError("not_found", "Deal not found.");
    if (existing.status !== "OPEN") {
      throw new SalesError("conflict", `${existing.status} deals cannot be edited.`);
    }
    const data: Record<string, unknown> = { ...patch };
    if (patch.expectedCloseAt !== undefined) {
      data.expectedCloseAt = patch.expectedCloseAt ? new Date(patch.expectedCloseAt) : null;
    }
    if (patch.primaryContactId) {
      const contact = await runtime.repos.contacts.get(g.principal.workspace.id, patch.primaryContactId);
      if (!contact) throw new SalesError("not_found", "Contact not found.", { contactId: patch.primaryContactId });
    }
    const deal = await runtime.repos.deals.update(g.principal.workspace.id, id, data);
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId,
      action: "sales.deal.update", targetType: "sales_deal", targetId: id,
      metadata: { fields: Object.keys(patch) },
    });
    return ok({ deal });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/sales/deals/[id] — soft delete (audited). */
export async function DELETE(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    await getSalesRuntime().crm.deleteDeal(g.principal.workspace.id, g.principal.userId, id);
    return ok({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
