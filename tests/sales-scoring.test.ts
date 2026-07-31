/**
 * Prospecting scoring battery — fit / icp / priority determinism, weight
 * renormalization, staleness cap, recency boosts, domain normalization.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeFitScore, computeIcpFit, computePriority, daysSince, normalizeDomain,
  type CompanySignals,
} from "../packages/sales-runtime/scoring";

const richSignals: CompanySignals = {
  domain: "acme.com", industry: "Logistics", size: "51-200", geography: "Nigeria",
  summary: "Acme moves freight across West Africa with a hybrid fleet model and an API-first ops stack.",
  techStack: ["react", "postgres", "kafka"], socialLinkCount: 3,
  researchCompleted: true, contactCount: 4, openDealCount: 1,
};

test("fit score accumulates every signal family and explains itself", () => {
  const rich = computeFitScore(richSignals);
  assert.equal(rich.score, 91); // 10+10+5+5+15+15+3+6+12+10
  assert.ok(rich.reasons.length >= 8);
  assert.ok(rich.reasons.some((r) => r.includes("contacts on file (4)")));
});

test("fit score for an empty record is zero with no reasons", () => {
  const empty = computeFitScore({
    domain: null, industry: null, size: null, geography: null, summary: null,
    techStack: [], socialLinkCount: 0, researchCompleted: false, contactCount: 0, openDealCount: 0,
  });
  assert.equal(empty.score, 0);
  assert.deepEqual(empty.reasons, []);
});

test("summary below the usefulness threshold contributes nothing", () => {
  const short = computeFitScore({ ...richSignals, summary: "too short", techStack: [], socialLinkCount: 0, researchCompleted: false, contactCount: 0, openDealCount: 0 });
  assert.equal(short.score, 10 + 10 + 5 + 5); // domain+industry+size+geo only
});

test("icp fit matches exact/partial values with reasons", () => {
  const icp = { industries: ["freight", "logistics"], sizes: ["51-200", "201-500"], geographies: ["Nigeria"], keywords: ["api", "fleet"] };
  const result = computeIcpFit(
    {
      industry: "West-African Logistics", size: "51-200", geography: "Lagos, Nigeria",
      textCorpus: "API-first ops stack with a hybrid fleet model.",
    },
    icp
  )!;
  assert.ok(result.score >= 95, `score ${result.score}`);
  assert.ok(result.reasons.some((r) => r.includes("industry matches ICP")));
  assert.ok(result.reasons.some((r) => r.includes("keyword signals")));
});

test("icp fit renormalizes weights over configured dimensions only", () => {
  const result = computeIcpFit(
    { industry: "Logistics", size: null, geography: null, textCorpus: "nothing relevant" },
    { industries: ["logistics"], sizes: [], geographies: [], keywords: [] }
  )!;
  assert.equal(result.score, 100, "single-dimension industry match still tops out at 100");
});

test("icp fit misses score zero, and an empty ICP means 'not configured' (null)", () => {
  const miss = computeIcpFit(
    { industry: "Fintech", size: "1-10", geography: "Kenya", textCorpus: "banking" },
    { industries: ["logistics"], sizes: ["51-200"], geographies: ["Nigeria"], keywords: ["fleet"] }
  )!;
  assert.equal(miss.score, 0);
  assert.equal(
    computeIcpFit({ industry: "X", size: null, geography: null, textCorpus: "" },
      { industries: [], sizes: [], geographies: [], keywords: [] }),
    null
  );
});

test("priority blends icp+fit with engagement, recency, staleness and deals", () => {
  const now = new Date("2026-08-01T12:00:00Z");
  const hot = computePriority({
    fitScore: 80, icpFit: 90, contactStatus: "ENGAGED",
    lastTouchedAt: new Date("2026-07-29T12:00:00Z"), openDealCount: 2, now,
  });
  assert.ok(hot.score > 75, `hot ${hot.score}`);
  assert.ok(hot.reasons.some((r) => r.includes("touched this week")));

  const stale = computePriority({
    fitScore: 80, icpFit: 90, contactStatus: "CUSTOMER",
    lastTouchedAt: new Date("2026-03-01T12:00:00Z"), openDealCount: 1, now,
  });
  assert.equal(stale.score, 55, "stale accounts cap at 55");
  assert.ok(stale.reasons.some((r) => r.includes("stale")));

  const cold = computePriority({
    fitScore: 30, icpFit: null, contactStatus: null, lastTouchedAt: null, openDealCount: 0, now,
  });
  assert.equal(cold.score, Math.round(0.45 * 30 + 0.35 * 30), "null icp falls back to fit");
});

test("daysSince handles nulls and invalid dates", () => {
  assert.equal(daysSince(null), null);
  assert.equal(daysSince("not-a-date"), null);
  assert.equal(daysSince(new Date(Date.now() - 3 * 86_400_000)), 3);
});

test("normalizeDomain handles urls, www, paths, case and junk", () => {
  assert.equal(normalizeDomain("https://www.Acme.com/pricing?x=1"), "acme.com");
  assert.equal(normalizeDomain("ACME.COM"), "acme.com");
  assert.equal(normalizeDomain("acme.com/careers"), "acme.com");
  assert.equal(normalizeDomain("user@acme.com"), "acme.com");
  assert.equal(normalizeDomain("not a domain"), null);
  assert.equal(normalizeDomain(""), null);
  assert.equal(normalizeDomain(null), null);
});
