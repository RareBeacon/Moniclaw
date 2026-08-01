import { db } from "@/lib/db";
import { getRuntime } from "@/lib/ai/runtime";

/**
 * GET /api/cron/memory-sweep — daily hygiene for the memory engine.
 *
 * Invoked by Vercel Cron (see vercel.json). Guarded by CRON_SECRET via the
 * Authorization bearer header Vercel attaches to cron invocations; when
 * CRON_SECRET is unset the route refuses to run (defense in depth — a cron
 * misconfiguration must never become an open admin endpoint).
 *
 * Per workspace: delete expired records, then trim to the configured cap
 * (lowest importance + oldest first). Fail-safe per workspace so one bad
 * tenant can't block the sweep.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: "cron_disabled", message: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return Response.json(
      { ok: false, error: "unauthorized", message: "Invalid cron credential." },
      { status: 401 }
    );
  }

  const runtime = getRuntime();
  const expired = await runtime.memory.sweepExpired();

  const workspaces = await db.aiWorkspaceSettings.findMany({
    select: { workspaceId: true, memoryMaxRecords: true },
  });

  let trimmed = 0;
  const failures: Array<{ workspaceId: string; error: string }> = [];
  for (const ws of workspaces) {
    try {
      trimmed += await runtime.memory.purgeBeyondLimit(ws.workspaceId, ws.memoryMaxRecords);
    } catch (err) {
      failures.push({ workspaceId: ws.workspaceId, error: (err as Error).message.slice(0, 200) });
    }
  }

  // Durable rate-limit buckets (Phase 9): rows whose window closed are dead
  // weight — reap anything expired for more than a day. Platform-global, so a
  // failure here must surface as a failure without blocking the workspace sweeps.
  let rateLimitBucketsReaped = 0;
  try {
    rateLimitBucketsReaped = await db.$executeRaw`
      DELETE FROM "rate_limit_buckets" WHERE "resetAt" < now() - interval '1 day'
    `;
  } catch (err) {
    failures.push({ workspaceId: "platform", error: (err as Error).message.slice(0, 200) });
  }

  return Response.json({
    ok: failures.length === 0,
    data: {
      expiredRemoved: expired,
      trimmed,
      workspaces: workspaces.length,
      rateLimitBucketsReaped,
      failures: failures.slice(0, 5),
    },
  });
}
