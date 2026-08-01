import { audit } from "@/lib/audit";
import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/sales/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/sales/searches/[id] — remove a saved search. */
export async function DELETE(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    await getSalesRuntime().repos.searches.delete(g.principal.workspace.id, id);
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId,
      action: "sales.search.delete", targetType: "sales_search", targetId: id,
    });
    return ok({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
