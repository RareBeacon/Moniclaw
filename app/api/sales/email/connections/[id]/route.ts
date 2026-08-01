import { deleteConnection, updateConnection } from "@/lib/email/connections";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { emailConnectionUpdateApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/sales/email/connections/[id] — edit; transport changes force re-verification. */
export async function PATCH(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.settings.manage", { rate: "salesEmailConnection" });
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const input = emailConnectionUpdateApiSchema.parse(await readJson(request));
    const connection = await updateConnection(g.principal.workspace.id, g.principal.userId, id, input);
    return ok({ connection });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/sales/email/connections/[id] — drafts keep their history (SetNull). */
export async function DELETE(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.settings.manage", { rate: "salesEmailConnection" });
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    await deleteConnection(g.principal.workspace.id, g.principal.userId, id);
    return ok({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
