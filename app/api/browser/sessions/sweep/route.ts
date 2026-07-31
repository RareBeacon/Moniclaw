import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, fail, ok } from "@/lib/browser/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/browser/sessions/sweep — reap idle-expired sessions.
 * Auth: CRON_SECRET bearer (same idiom as the AI memory sweep) or nothing in dev.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return fail(401, "unauthenticated", "Cron secret required.");
  }
  try {
    const runtime = getBrowserRuntime();
    const reaped = await runtime.sessions.sweepIdle();
    return ok({ reaped });
  } catch (err) {
    return errorResponse(err);
  }
}
