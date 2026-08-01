import { SalesError } from "@sales/index";
import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { contactUpdateApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/sales/contacts/[id] — detail with recent activity + drafts. */
export async function GET(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const runtime = getSalesRuntime();
    const contact = await runtime.repos.contacts.get(g.principal.workspace.id, id);
    if (!contact) throw new SalesError("not_found", "Contact not found.");
    const [activities, drafts, company] = await Promise.all([
      runtime.repos.activities.list(g.principal.workspace.id, { contactId: id, take: 30 }),
      runtime.repos.drafts.list(g.principal.workspace.id, { contactId: id, take: 20 }),
      contact.companyId ? runtime.repos.companies.get(g.principal.workspace.id, contact.companyId) : null,
    ]);
    return ok({ contact, activities, drafts, company });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PATCH /api/sales/contacts/[id] — update (email re-dedupe checked). */
export async function PATCH(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const patch = contactUpdateApiSchema.parse(await readJson(request));
    const contact = await getSalesRuntime().crm.updateContact(g.principal.workspace.id, g.principal.userId, id, patch);
    return ok({ contact });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/sales/contacts/[id] — soft delete. */
export async function DELETE(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    await getSalesRuntime().crm.deleteContact(g.principal.workspace.id, g.principal.userId, id);
    return ok({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
