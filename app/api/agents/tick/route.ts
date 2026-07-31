import { audit } from "@/lib/audit";
import { getAgentRuntime } from "@/lib/agents/runtime";
import { errorResponse, fail, ok } from "@/lib/agents/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/agents/tick — evaluate scheduled workers and dispatch due runs.
 * Auth: CRON_SECRET bearer (same idiom as /api/browser/sessions/sweep and
 * /api/cron/memory-sweep). Safe to call every minute.
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
    if (result.dispatched > 0) {
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
