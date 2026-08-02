/**
 * Multi-key rotation helpers — pure, unit-tested, no I/O.
 *
 * When a provider answers 429, the key "rests": resolve() drops it out of
 * rotation until the rest window passes, traffic flows to the workspace's
 * other keys, and the workspace is alerted once per episode. A key re-enters
 * rotation automatically when its window expires; a successful call clears
 * the marker early (markHealth ok clears rateLimitedUntil).
 */

/** Provider gave no Retry-After → rest for an hour (daily-quota 429s are rare and re-pings are cheap + deduped). */
export const RATE_LIMIT_REST_DEFAULT_S = 3600;
/** Never rest less than a minute (pointless) or more than a day (stale protection). */
export const RATE_LIMIT_REST_MIN_S = 60;
export const RATE_LIMIT_REST_MAX_S = 86_400;

export function rateLimitRestUntil(now: Date, retryAfterSeconds: number | null): Date {
  const hinted =
    retryAfterSeconds != null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds
      : RATE_LIMIT_REST_DEFAULT_S;
  const clamped = Math.min(RATE_LIMIT_REST_MAX_S, Math.max(RATE_LIMIT_REST_MIN_S, Math.ceil(hinted)));
  return new Date(now.getTime() + clamped * 1000);
}

export function isRateLimited(row: { rateLimitedUntil: Date | null }, now = new Date()): boolean {
  return row.rateLimitedUntil !== null && row.rateLimitedUntil.getTime() > now.getTime();
}

/** Rows currently usable, preserving the incoming (priority) order. */
export function withoutRestedKeys<T extends { rateLimitedUntil: Date | null }>(rows: T[], now = new Date()): T[] {
  return rows.filter((row) => !isRateLimited(row, now));
}

/** One alert per resting episode per key — no spam while an unread alert lives. */
export function rateLimitDedupKey(configId: string): string {
  return `ai.rate-limited:${configId}`;
}

export const RATE_LIMIT_HREF = "/dashboard/settings/api-keys";

export function rateLimitAlertCopy(
  config: { label: string; provider: string },
  until: Date
): { kind: string; title: string; body: string; href: string } {
  const provider = config.provider.toLowerCase();
  const untilIso = until.toISOString();
  return {
    kind: "ai.provider.rate_limited",
    title: `“${config.label}” hit its rate limit`,
    body:
      `Your ${provider} key “${config.label}” was rate-limited by the provider. ` +
      `Traffic rotates to your other keys automatically; this key rests until ${untilIso}. ` +
      `Add another ${provider} key to raise headroom.`,
    href: RATE_LIMIT_HREF,
  };
}
