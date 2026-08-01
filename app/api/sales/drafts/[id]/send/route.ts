import { sendDraft } from "@/lib/email/connections";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { draftSendApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/sales/drafts/[id]/send — the manager's explicit "send now"
 * decision on an APPROVED draft. Rate-limited per workspace; the send is
 * claimed atomically (double-click safe) and audited. A transient provider
 * failure reschedules the draft for the cron tick; three attempts = FAILED.
 */
export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.drafts.review", { rate: "salesEmailSend" });
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const input = draftSendApiSchema.parse(await readJson(request));
    const result = await sendDraft(g.principal.workspace.id, g.principal.userId, id, {
      ...(input.connectionId ? { connectionId: input.connectionId } : {}),
    });
    return ok({ result }, { status: result.error && result.status === "FAILED" ? 502 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
