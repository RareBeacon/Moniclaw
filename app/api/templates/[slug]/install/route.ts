import { errorResponse, fail, guard, isGuarded, ok } from "@/lib/agents/api";
import { installTemplate, InstallError } from "@/lib/templates/install";
import { PLAN_LIMITS } from "@/lib/billing";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/templates/[slug]/install — mint a real workspace Agent from the
 * package (SHADOW/DRAFT by design) + install lineage. Plan agent caps apply.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = await guard(request, "agents.create");
  if (isGuarded(g)) return g.response;
  const { slug } = await params;
  try {
    const cap = PLAN_LIMITS[g.principal.workspace.plan]?.agents ?? null;
    if (cap != null) {
      const live = await db.agent.count({
        where: { workspaceId: g.principal.workspace.id, status: { not: "ARCHIVED" } },
      });
      if (live >= cap) {
        return fail(
          402,
          "plan_limit",
          `The ${PLAN_LIMITS[g.principal.workspace.plan].label} plan allows ${cap} live agents (${live} in use). Archive one or move to a bigger plan on the Billing page.`
        );
      }
    }

    const { agent, template } = await installTemplate(g.principal.workspace.id, g.principal.userId, slug);
    return ok({ agent, template: { slug: template.slug, name: template.name, version: template.version } }, { status: 201 });
  } catch (err) {
    if (err instanceof InstallError && err.code === "not_found") {
      return fail(404, "not_found", err.message);
    }
    return errorResponse(err);
  }
}
