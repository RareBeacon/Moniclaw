/**
 * Sliding-window rate limiter.
 *
 * Per-instance, in-memory — the correct baseline for a single-region
 * serverless deployment and integration tests. When traffic spans many
 * instances, swap the store for Redis (e.g. a shared key per window bucket);
 * the call sites won't change.
 */

type Window = number[]; // timestamps of accepted hits within the window

const store = new Map<string, Window>();
let lastSweep = Date.now();

const MAX_KEYS = 10_000;

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < windowMs * 4 && store.size < MAX_KEYS) return;
  lastSweep = now;
  for (const [key, window] of store) {
    const live = window.filter((t) => now - t < windowMs);
    if (live.length === 0) store.delete(key);
    else store.set(key, live);
  }
  // Hard cap: if still oversized, drop the oldest keys entirely.
  if (store.size > MAX_KEYS) {
    const keys = [...store.keys()];
    for (let i = 0; i < keys.length - MAX_KEYS; i++) store.delete(keys[i]);
  }
}

export type RateLimitResult =
  | { success: true; remaining: number }
  | { success: false; retryAfterSeconds: number };

/** In-memory sliding-window limiter — the unit-test store + fallback path. */
export function rateLimitMemory(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now, windowMs);

  const window = (store.get(key) ?? []).filter((t) => now - t < windowMs);

  if (window.length >= limit) {
    const oldest = window[0];
    return {
      success: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  window.push(now);
  store.set(key, window);
  return { success: true, remaining: limit - window.length };
}

// ── Phase 9 · Durable store (shared across serverless instances) ─────────
//
// Fixed-window counters in Postgres, one atomic upsert per hit — two racing
// instances both increment the SAME row, so distributed traffic trips the
// limit deterministically (in-memory counters never could). On any store
// failure we fail over to the in-memory limiter and warn — a rate limiter
// is a safety valve, never a reason to take the platform down.
import { db } from "@/lib/db";

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  try {
    const resetAt = new Date(Date.now() + windowMs);
    const rows = await db.$queryRaw<Array<{ count: number; resetAt: Date }>>`
      INSERT INTO "rate_limit_buckets" ("key", "count", "resetAt", "updatedAt")
      VALUES (${key}, 1, ${resetAt}, now())
      ON CONFLICT ("key") DO UPDATE SET
        "count"     = CASE WHEN "rate_limit_buckets"."resetAt" <= now() THEN 1
                           ELSE "rate_limit_buckets"."count" + 1 END,
        "resetAt"   = CASE WHEN "rate_limit_buckets"."resetAt" <= now() THEN EXCLUDED."resetAt"
                           ELSE "rate_limit_buckets"."resetAt" END,
        "updatedAt" = now()
      RETURNING "count", "resetAt"
    `;
    const row = rows[0];
    if (!row) throw new Error("rate-limit upsert returned no row");
    if (row.count > limit) {
      return {
        success: false,
        retryAfterSeconds: Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000)),
      };
    }
    return { success: true, remaining: Math.max(0, limit - row.count) };
  } catch (err) {
    console.warn(`[rate-limit] durable store unavailable (${(err as Error).message.slice(0, 80)}) — in-memory fallback`);
    return rateLimitMemory(key, limit, windowMs);
  }
}

/** Test hook: clear all buckets. Not used by application code. */
export function __resetRateLimitStore() {
  store.clear();
}

// ── Named policies (shared between actions and tests) ──────────────────
export const RATE_LIMITS = {
  login: { limit: 5, windowMs: 5 * 60_000 }, // 5 attempts / 5 min / ip+email
  register: { limit: 3, windowMs: 60 * 60_000 }, // 3 accounts / hour / ip
  reset: { limit: 5, windowMs: 60 * 60_000 }, // 5 reset emails / hour / ip+email
  resendVerify: { limit: 5, windowMs: 60 * 60_000 },
  invite: { limit: 20, windowMs: 60 * 60_000 }, // per workspace
  upload: { limit: 30, windowMs: 60 * 60_000 }, // per user
  export: { limit: 12, windowMs: 60 * 60_000 }, // per workspace
  aiChat: { limit: 60, windowMs: 60 * 60_000 }, // per user (messages)
  aiEmbed: { limit: 60, windowMs: 60 * 60_000 }, // per workspace (documents/batches)
  aiUpload: { limit: 20, windowMs: 60 * 60_000 }, // per workspace (documents)
  aiWorkflowRun: { limit: 30, windowMs: 60 * 60_000 }, // per workspace
  browserSession: { limit: 40, windowMs: 60 * 60_000 }, // per workspace (session creates)
  browserExecute: { limit: 150, windowMs: 60 * 60_000 }, // per workspace (executions+actions)
  agentsRun: { limit: 60, windowMs: 60 * 60_000 }, // per workspace (worker dispatches)
  browserUpload: { limit: 30, windowMs: 60 * 60_000 }, // per workspace (file uploads)
  salesResearch: { limit: 20, windowMs: 60 * 60_000 }, // per workspace (research dispatches)
  salesDraftCreate: { limit: 120, windowMs: 60 * 60_000 }, // per workspace (manual drafts)
  salesEmailConnection: { limit: 30, windowMs: 60 * 60_000 }, // per workspace (connection writes)
  salesEmailVerify: { limit: 20, windowMs: 60 * 60_000 }, // per workspace (SMTP handshakes/test mails)
  salesEmailSend: { limit: 60, windowMs: 60 * 60_000 }, // per workspace (manual send decisions)
} as const;
