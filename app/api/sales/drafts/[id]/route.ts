import { SalesError } from "@sales/index";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { assertEditable, deleteDraft } from "@/lib/sales/drafts";
import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { draftUpdateApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/sales/drafts/[id] — detail + linked approval status. */
export async function GET(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const runtime = getSalesRuntime();
    const draft = await runtime.repos.drafts.get(g.principal.workspace.id, id);
    if (!draft) throw new SalesError("not_found", "Draft not found.");
    const [contact, company, approval] = await Promise.all([
      draft.contactId ? runtime.repos.contacts.get(g.principal.workspace.id, draft.contactId) : null,
      draft.companyId ? runtime.repos.companies.get(g.principal.workspace.id, draft.companyId) : null,
      draft.approvalId ? db.approval.findUnique({ where: { id: draft.approvalId } }) : null,
    ]);
    return ok({ draft, contact, company, approval });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PATCH /api/sales/drafts/[id] — edit; DRAFT status only. */
export async function PATCH(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const patch = draftUpdateApiSchema.parse(await readJson(request));
    const runtime = getSalesRuntime();
    const draft = await runtime.repos.drafts.get(g.principal.workspace.id, id);
    if (!draft) throw new SalesError("not_found", "Draft not found.");
    assertEditable(draft);
    await runtime.repos.drafts.setStatus(draft.id, "DRAFT", {
      ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
    });
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId,
      action: "sales.draft.update", targetType: "sales_draft", targetId: id,
      metadata: { fields: Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined) },
    });
    return ok({ draft: (await runtime.repos.drafts.get(g.principal.workspace.id, id))! });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/sales/drafts/[id] — DRAFT/REJECTED/CANCELED only. */
export async function DELETE(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    await deleteDraft(g.principal.workspace.id, g.principal.userId, id);
    return ok({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
