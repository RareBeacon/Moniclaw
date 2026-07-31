/**
 * Prospecting scoring — pure deterministic functions (no I/O, no imports).
 *
 * Two lenses, both explainable (every score ships its reasons, persisted on
 * the record so the dashboard can show WHY):
 *   fit      — how complete/strong the company profile is
 *   priority — should a rep touch this account NOW (fit + icp + engagement +
 *              recency), the primary sort for prospecting surfaces
 */

export interface CompanySignals {
  domain: string | null;
  industry: string | null;
  size: string | null;
  geography: string | null;
  summary: string | null;
  techStack: string[];
  socialLinkCount: number;
  researchCompleted: boolean;
  contactCount: number;
  openDealCount: number;
}

export interface ScoreResult {
  score: number; // 0-100
  reasons: string[];
}

const cap = (score: number): number => Math.max(0, Math.min(100, Math.round(score)));

export function computeFitScore(s: CompanySignals): ScoreResult {
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, why: string) => { score += points; reasons.push(`+${points} ${why}`); };

  if (s.domain) add(10, "has domain");
  if (s.industry) add(10, `industry known (${s.industry})`);
  if (s.size) add(5, `size known (${s.size})`);
  if (s.geography) add(5, "geography known");
  if (s.summary && s.summary.length >= 40) add(15, "written profile available");
  if (s.researchCompleted) add(15, "research worker completed");
  if (s.techStack.length > 0) add(Math.min(10, s.techStack.length), `tech stack signals (${s.techStack.length})`);
  if (s.socialLinkCount > 0) add(Math.min(10, s.socialLinkCount * 2), `public social presence (${s.socialLinkCount})`);
  if (s.contactCount > 0) add(Math.min(15, s.contactCount * 3), `contacts on file (${s.contactCount})`);
  if (s.openDealCount > 0) add(10, `open pipeline (${s.openDealCount} deal${s.openDealCount > 1 ? "s" : ""})`);

  return { score: cap(score), reasons };
}

export interface IcpWeights {
  industry: number;
  size: number;
  geography: number;
  keywords: number;
}

export const DEFAULT_ICP_WEIGHTS: IcpWeights = { industry: 40, size: 20, geography: 20, keywords: 20 };

/** Case/diacritic-insensitive substring match against any list entry. */
function matchesAny(value: string, candidates: string[]): string | null {
  const v = value.toLowerCase();
  for (const candidate of candidates) {
    const c = candidate.toLowerCase();
    if (v === c || v.includes(c) || c.includes(v)) return candidate;
  }
  return null;
}

export interface IcpInput {
  industry: string | null;
  size: string | null;
  geography: string | null;
  /** Free text scanned for icp keywords (summary + products + target market). */
  textCorpus: string;
}

/** null when the ICP is empty (nothing configured — not a judgment). */
export function computeIcpFit(
  input: IcpInput,
  icp: { industries: string[]; sizes: string[]; geographies: string[]; keywords: string[] },
  weights: IcpWeights = DEFAULT_ICP_WEIGHTS
): ScoreResult | null {
  const active: Array<{ key: keyof Pick<IcpInput, "industry" | "size" | "geography">; candidates: string[]; weight: number }> = [];
  if (icp.industries.length) active.push({ key: "industry", candidates: icp.industries, weight: weights.industry });
  if (icp.sizes.length) active.push({ key: "size", candidates: icp.sizes, weight: weights.size });
  if (icp.geographies.length) active.push({ key: "geography", candidates: icp.geographies, weight: weights.geography });
  const useKeywords = icp.keywords.length > 0;
  if (!active.length && !useKeywords) return null;

  // Weights renormalize over the configured dimensions only, so an ICP
  // defined as "industry + keywords" still spreads across 100 points.
  const totalWeight = active.reduce((s, a) => s + a.weight, 0) + (useKeywords ? weights.keywords : 0);

  let score = 0;
  const reasons: string[] = [];
  for (const dim of active) {
    const value = input[dim.key];
    const w = (dim.weight / totalWeight) * 100;
    if (!value) { reasons.push(`+0 ${dim.key} unknown`); continue; }
    const hit = matchesAny(value, dim.candidates);
    if (hit) {
      score += w;
      reasons.push(`+${Math.round(w)} ${dim.key} matches ICP (${hit})`);
    } else {
      reasons.push(`+0 ${dim.key} outside ICP (${value})`);
    }
  }
  if (useKeywords) {
    const w = (weights.keywords / totalWeight) * 100;
    const hits = icp.keywords.filter((k) => input.textCorpus.toLowerCase().includes(k.toLowerCase()));
    const partial = hits.length > 0 ? Math.min(1, hits.length / Math.min(3, icp.keywords.length)) : 0;
    score += w * partial;
    reasons.push(
      partial > 0
        ? `+${Math.round(w * partial)} keyword signals (${hits.slice(0, 3).join(", ")})`
        : "+0 no ICP keywords found"
    );
  }
  return { score: cap(score), reasons };
}

export interface PriorityInput {
  fitScore: number;
  icpFit: number | null; // null → fallback to fitScore
  contactStatus: string | null; // strongest relationship on account
  lastTouchedAt: Date | string | null;
  openDealCount: number;
  now?: Date;
}

const STATUS_BOOST: Record<string, number> = {
  CUSTOMER: 15,
  ENGAGED: 10,
  QUALIFIED: 10,
  CONTACTED: 5,
};

export function daysSince(a: Date | string | null, now: Date = new Date()): number | null {
  if (!a) return null;
  const ms = now.getTime() - new Date(a).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86_400_000);
}

export function computePriority(i: PriorityInput): ScoreResult {
  const now = i.now ?? new Date();
  const reasons: string[] = [];

  const icp = i.icpFit ?? i.fitScore;
  let score = 0.45 * icp + 0.35 * i.fitScore;
  reasons.push(`base ${Math.round(score)} (icp ${icp} × .45 + fit ${i.fitScore} × .35)`);

  const boost = i.contactStatus ? STATUS_BOOST[i.contactStatus] : undefined;
  if (boost) { score += boost; reasons.push(`+${boost} relationship ${i.contactStatus}`); }

  if (i.openDealCount > 0) { score += 10; reasons.push(`+10 open deal${i.openDealCount > 1 ? "s" : ""}`); }

  const touchedDays = daysSince(i.lastTouchedAt, now);
  if (touchedDays !== null) {
    if (touchedDays <= 7) { score += 10; reasons.push("+10 touched this week"); }
    else if (touchedDays <= 30) { score += 5; reasons.push("+5 touched this month"); }
    else if (touchedDays > 90) { score = Math.min(score, 55); reasons.push("stale >90 days caps priority at 55"); }
  }

  return { score: cap(score), reasons };
}

/**
 * Normalize a user-supplied company domain/URL for dedupe: strips protocol,
 * credentials, www-, path and trailing slash; null when nothing parseable.
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let raw = input.trim().toLowerCase();
  if (!raw) return null;
  raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^[^@/]+@/, "");
  const cut = raw.search(/[/?#]/);
  if (cut >= 0) raw = raw.slice(0, cut);
  if (raw.startsWith("www.")) raw = raw.slice(4);
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(raw) ? raw : null;
}
