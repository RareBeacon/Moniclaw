import { audit } from "@/lib/audit";
import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { campaignCreateApiSchema } from "@/lib/validations/sales";
import { SALES_CAMPAIGN_STATUSES } from "@sales/index";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** GET /api/sales/campaigns — list (optional status filter) with steps. */
export async function GET(request: Request) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const q = z.object({
      status: z.enum(SALES_CAMPAIGN_STATUSES).optional(),
      take: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const campaigns = await getSalesRuntime().repos.campaigns.list(g.principal.workspace.id, {
      ...(q.status ? { status: q.status } : {}),
      take: q.take,
    });
    return ok({ campaigns });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/sales/campaigns — create with optional initial steps. */
export async function POST(request: Request) {
  const g = await guard(request, "sales.campaigns.manage");
  if (isGuarded(g)) return g.response;
  try {
    const input = campaignCreateApiSchema.parse(await readJson(request));
    const repos = getSalesRuntime().repos;
    const campaign = await repos.campaigns.create(g.principal.workspace.id, {
      name: input.name,
      goal: input.goal ?? null,
      dailyCap: input.dailyCap,
      sendWindow: input.sendWindow,
      knowledgeContext: input.knowledgeContext ?? null,
      status: "DRAFT",
      createdById: g.principal.userId,
    });
    if (input.steps.length) {
      await repos.campaigns.replaceSteps(campaign.id, input.steps.map((s) => ({ ...s })));
    }
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId,
      action: "sales.campaign.create", targetType: "sales_campaign", targetId: campaign.id,
      metadata: { name: campaign.name, steps: input.steps.length },
    });
    return ok({ campaign: (await repos.campaigns.get(g.principal.workspace.id, campaign.id))!, steps: input.steps.length }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
