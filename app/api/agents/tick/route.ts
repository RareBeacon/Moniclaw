import { audit } from "@/lib/audit";
import { getAgentRuntime } from "@/lib/agents/runtime";
import { getSalesRuntime } from "@/lib/sales/runtime";
import { sendDueDrafts } from "@/lib/email/connections";
import { errorResponse, fail, ok } from "@/lib/agents/api";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST|GET /api/agents/tick — evaluate scheduled workers and dispatch due runs
 * (plus zombie reaping and QUEUED dispatch recovery).
 * Auth: CRON_SECRET bearer (same idiom as /api/cron/memory-sweep and
 * /api/browser/sessions/sweep). Vercel Cron invokes GET; external schedulers
 * may use POST. Idempotent and safe to call every minute.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return fail(401, "unauthenticated", "Cron secret required.");
  }
  try {
    const runtime = getAgentRuntime();
    const result = await runtime.orchestrator.tick(new Date());
    if (result.dispatched > 0 || result.reaped > 0 || result.requeued > 0) {
      await audit({
        action: "agent.trigger.tick",
        metadata: result,
      });
    }

    // Phase 6: sales campaign engine advances due enrollments on the same
    // cadence (draft production for human review — never auto-sends).
    // A campaign failure must never break the worker tick (and vice versa).
    let campaigns: unknown = { skipped: true };
    try {
      const salesResult = await getSalesRuntime().campaignsEngine.tick();
      campaigns = salesResult;
      if (salesResult.processed > 0 || salesResult.drafted > 0) {
        await audit({ action: "sales.campaign.tick", metadata: salesResult as unknown as Record<string, unknown> });
      }
    } catch (err) {
      console.error("[tick] sales campaign engine failed:", err);
      campaigns = { error: err instanceof Error ? err.message : "failed" };
    }

    // Phase 6 (email): deliver human-approved, due SCHEDULED drafts through
    // the workspace's connected identity (SES/SMTP). Only drafts a manager
    // APPROVED and SCHEDULED ever reach this path — nothing auto-sends.
    let email: unknown = { skipped: true };
    try {
      const emailResult = await sendDueDrafts();
      email = emailResult;
      if (emailResult.processed > 0) {
        await audit({ action: "sales.email.tick", metadata: emailResult as unknown as Record<string, unknown> });
      }
    } catch (err) {
      console.error("[tick] email dispatch failed:", err);
      email = { error: err instanceof Error ? err.message : "failed" };
    }

    return ok({ ...result, campaigns, email });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Vercel Cron issues GET — same behavior as POST. */
export const GET = POST;
