import { headers } from "next/headers";

/**
 * Request metadata helpers. Safe outside a request scope — Next's `headers()`
 * throws when called from background contexts (queue ticks, CLI scripts,
 * integration tests); those callers simply get nulls instead of a crash.
 */
function tryHeaders(): ReturnType<typeof headers> | null {
  try {
    return headers();
  } catch {
    return null;
  }
}

/** Best-effort client IP behind Vercel's edge (x-forwarded-for, first hop). */
export function clientIp(): string | null {
  const h = tryHeaders();
  if (!h) return null;
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip");
}

export function clientUserAgent(): string | null {
  const h = tryHeaders();
  if (!h) return null;
  const ua = h.get("user-agent");
  return ua ? ua.slice(0, 300) : null;
}
