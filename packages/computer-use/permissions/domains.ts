/**
 * Domain policy primitives — pure functions, zero dependencies.
 *
 * Pattern grammar:
 *   "example.com"      exact host (and only that host)
 *   "*.example.com"    one-level wildcard: matches sub.example.com AND example.com origins? No —
 *                      one-level wildcard matches any single subdomain level AND the apex,
 *                      documented explicitly so operators aren't surprised.
 *   "*"                any host
 */
export function normalizePattern(pattern: string): string {
  return pattern.trim().toLowerCase().replace(/^\./, "").replace(/\/+$/, "");
}

export function hostMatches(host: string, pattern: string): boolean {
  const p = normalizePattern(pattern);
  if (!p) return false;
  if (p === "*") return true;
  const h = host.toLowerCase();
  if (p.startsWith("*.")) {
    const apex = p.slice(2);
    return h === apex || h.endsWith(`.${apex}`);
  }
  return h === p;
}

export function matchAny(host: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    if (hostMatches(host, pattern)) return normalizePattern(pattern);
  }
  return null;
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

export type DomainVerdict =
  | { decision: "blocked"; matched: string }
  | { decision: "confirm"; matched: string }
  | { decision: "allowed"; matched: string | null }; // matched=null → fell through to defaultAllowed

/**
 * Evaluation order (documented on the Permissions page): blocked >
 * confirmation > allowed > defaultAllowed.
 */
export function evaluateDomain(
  url: string,
  policy: { allowedDomains: string[]; blockedDomains: string[]; confirmationDomains: string[]; defaultAllowed: boolean }
): DomainVerdict {
  const host = hostOf(url);
  if (!host) return { decision: "blocked", matched: "invalid-url" };
  const blocked = matchAny(host, policy.blockedDomains);
  if (blocked) return { decision: "blocked", matched: blocked };
  const confirm = matchAny(host, policy.confirmationDomains);
  if (confirm) return { decision: "confirm", matched: confirm };
  const allowed = matchAny(host, policy.allowedDomains);
  if (allowed) return { decision: "allowed", matched: allowed };
  return policy.defaultAllowed
    ? { decision: "allowed", matched: null }
    : { decision: "blocked", matched: "default-deny" };
}
