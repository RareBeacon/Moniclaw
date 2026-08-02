import { db } from "@/lib/db";
import { errorResponse, guard, isGuarded, ok } from "@/lib/agents/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/templates — the Phase 8 catalog with workspace-local install state.
 * Manifests are included (declarative packages are public by design) so a
 * client can render the permission manifest BEFORE installing.
 */
export async function GET(request: Request) {
  const g = await guard(request, "agents.read");
  if (isGuarded(g)) return g.response;
  try {
    const [templates, installed] = await Promise.all([
      db.agentTemplate.findMany({ orderBy: [{ category: "asc" }, { installs: "desc" }] }),
      db.agent.findMany({
        where: { workspaceId: g.principal.workspace.id, templateSlug: { not: null }, status: { not: "ARCHIVED" } },
        select: { id: true, templateSlug: true },
      }),
    ]);
    const bySlug = new Map<string, string[]>();
    for (const row of installed) {
      const list = bySlug.get(row.templateSlug!) ?? [];
      list.push(row.id);
      bySlug.set(row.templateSlug!, list);
    }
    return ok({
      templates: templates.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        installedAgentIds: bySlug.get(t.slug) ?? [],
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
