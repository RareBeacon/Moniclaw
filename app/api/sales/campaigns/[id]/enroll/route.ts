import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { campaignEnrollApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/sales/campaigns/[id]/enroll — enroll one or many contacts
 *  (deduped by the (campaignId, contactId) unique key; results per contact). */
export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.campaigns.manage");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const parsed = campaignEnrollApiSchema.parse(await readJson(request));
    const contactIds = parsed.contactIds ?? [parsed.contactId!];
    const engine = getSalesRuntime().campaignsEngine;
    const results: Array<{ contactId: string; enrollmentId?: string; created?: boolean; error?: string }> = [];
    for (const contactId of contactIds) {
      try {
        const r = await engine.enrollContact(g.principal.workspace.id, g.principal.userId, id, contactId);
        results.push({ contactId, enrollmentId: r.enrollmentId, created: r.created });
      } catch (err) {
        results.push({ contactId, error: err instanceof Error ? err.message : "failed" });
      }
    }
    const created = results.filter((r) => r.created).length;
    return ok({ results, created }, { status: created > 0 ? 201 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
