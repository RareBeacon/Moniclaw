import { SalesError } from "@sales/index";
import { audit } from "@/lib/audit";
import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { campaignStepsApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/sales/campaigns/[id]/steps — ordered sequence. */
export async function GET(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const repos = getSalesRuntime().repos;
    const campaign = await repos.campaigns.get(g.principal.workspace.id, id);
    if (!campaign) throw new SalesError("not_found", "Campaign not found.");
    return ok({ steps: await repos.campaigns.listSteps(id) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT /api/sales/campaigns/[id]/steps — replace the sequence (transactional). */
export async function PUT(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.campaigns.manage");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const { steps } = campaignStepsApiSchema.parse(await readJson(request));
    const repos = getSalesRuntime().repos;
    const campaign = await repos.campaigns.get(g.principal.workspace.id, id);
    if (!campaign) throw new SalesError("not_found", "Campaign not found.");
    if (campaign.status === "ACTIVE") {
      throw new SalesError("conflict", "Pause the campaign before editing its steps.");
    }
    await repos.campaigns.replaceSteps(id, steps.map((s) => ({ ...s })));
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId,
      action: "sales.campaign.update", targetType: "sales_campaign", targetId: id,
      metadata: { steps: steps.length },
    });
    return ok({ steps: await repos.campaigns.listSteps(id) });
  } catch (err) {
    return errorResponse(err);
  }
}
