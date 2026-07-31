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

export function rateLimit(
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
} as const;
