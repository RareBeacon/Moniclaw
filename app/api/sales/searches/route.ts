import { audit } from "@/lib/audit";
import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { savedSearchApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

/** GET /api/sales/searches — saved searches (optional entity filter). */
export async function GET(request: Request) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const entity = new URL(request.url).searchParams.get("entity") ?? undefined;
    const searches = await getSalesRuntime().repos.searches.list(g.principal.workspace.id, entity);
    return ok({ searches });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/sales/searches — upsert by (workspace, name). */
export async function POST(request: Request) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { name, entity, filters } = savedSearchApiSchema.parse(await readJson(request));
    await getSalesRuntime().repos.searches.upsert(g.principal.workspace.id, name, entity, filters, g.principal.userId);
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId,
      action: "sales.search.save", targetType: "sales_search", metadata: { name, entity },
    });
    const searches = await getSalesRuntime().repos.searches.list(g.principal.workspace.id, entity);
    return ok({ searches }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
