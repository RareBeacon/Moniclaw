import { audit } from "@/lib/audit";
import { getAgentRuntime } from "@/lib/agents/runtime";
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
    return ok(result);
  } catch (err) {
    return errorResponse(err);
  }
}

/** Vercel Cron issues GET — same behavior as POST. */
export const GET = POST;
