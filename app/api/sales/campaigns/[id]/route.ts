import { SalesError } from "@sales/index";
import { audit } from "@/lib/audit";
import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { campaignStatusApiSchema, campaignUpdateApiSchema } from "@/lib/validations/sales";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/sales/campaigns/[id] — detail with steps + enrollments. */
export async function GET(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const repos = getSalesRuntime().repos;
    const campaign = await repos.campaigns.get(g.principal.workspace.id, id);
    if (!campaign) throw new SalesError("not_found", "Campaign not found.");
    const [steps, enrollments] = await Promise.all([
      repos.campaigns.listSteps(id),
      repos.campaigns.listEnrollments(id, { }),
    ]);
    return ok({ campaign, steps, enrollments });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PATCH /api/sales/campaigns/[id] — edit fields and/or transition status.
 *  `{ status }` follows transition guards (ACTIVE needs ≥1 step). */
export async function PATCH(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.campaigns.manage");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const body = await readJson(request);
    const statusPatch = z.object({ status: campaignStatusApiSchema.shape.status.optional() }).parse(body);
    const fieldPatch = campaignUpdateApiSchema.parse(body);
    const repos = getSalesRuntime().repos;
    const campaign = await repos.campaigns.get(g.principal.workspace.id, id);
    if (!campaign) throw new SalesError("not_found", "Campaign not found.");

    if (statusPatch.status && statusPatch.status !== campaign.status) {
      if (statusPatch.status === "ACTIVE") {
        if (!["DRAFT", "PAUSED"].includes(campaign.status)) {
          throw new SalesError("conflict", `A ${campaign.status} campaign cannot be activated.`);
        }
        const steps = await repos.campaigns.listSteps(id);
        if (steps.length === 0) throw new SalesError("validation", "Add at least one step before activating.");
      }
      if (statusPatch.status === "PAUSED" && campaign.status !== "ACTIVE") {
        throw new SalesError("conflict", `Only ACTIVE campaigns can be paused (this one is ${campaign.status}).`);
      }
      if (statusPatch.status === "DRAFT" && campaign.status !== "PAUSED") {
        throw new SalesError("conflict", "Only PAUSED campaigns return to DRAFT.");
      }
      if ((statusPatch.status === "COMPLETED" || statusPatch.status === "ARCHIVED") &&
          !["ACTIVE", "PAUSED", "DRAFT", "COMPLETED"].includes(campaign.status)) {
        throw new SalesError("conflict", `A ${campaign.status} campaign cannot become ${statusPatch.status}.`);
      }
      await repos.campaigns.update(id, { status: statusPatch.status });
      await audit({
        workspaceId: g.principal.workspace.id, actorId: g.principal.userId,
        action: "sales.campaign.status", targetType: "sales_campaign", targetId: id,
        metadata: { from: campaign.status, to: statusPatch.status },
      });
    }

    const fields = Object.fromEntries(Object.entries(fieldPatch).filter(([, v]) => v !== undefined));
    if (Object.keys(fields).length) {
      await repos.campaigns.update(id, fields);
      await audit({
        workspaceId: g.principal.workspace.id, actorId: g.principal.userId,
        action: "sales.campaign.update", targetType: "sales_campaign", targetId: id,
        metadata: { fields: Object.keys(fields) },
      });
    }
    return ok({ campaign: (await repos.campaigns.get(g.principal.workspace.id, id))! });
  } catch (err) {
    return errorResponse(err);
  }
}
