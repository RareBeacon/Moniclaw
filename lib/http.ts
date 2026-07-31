import { headers } from "next/headers";

/** Best-effort client IP behind Vercel's edge (x-forwarded-for, first hop). */
export function clientIp(): string | null {
  const h = headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip");
}

export function clientUserAgent(): string | null {
  const ua = headers().get("user-agent");
  return ua ? ua.slice(0, 300) : null;
}
