import type { WorkspacePlan } from "@prisma/client";

/**
 * Plan entitlements — single source of truth used by Usage, Billing, and
 * (later) the credit-metering runtime.
 */
export const PLAN_LIMITS: Record<
  WorkspacePlan,
  {
    creditsPerMonth: number | null; // null = committed/contracted
    agents: number | null;
    seats: number | null;
    label: string;
  }
> = {
  STARTER: { creditsPerMonth: 500, agents: 1, seats: 1, label: "Starter" },
  GROWTH: { creditsPerMonth: 25_000, agents: 5, seats: 10, label: "Growth" },
  BUSINESS: { creditsPerMonth: 150_000, agents: 25, seats: null, label: "Business" },
  ENTERPRISE: { creditsPerMonth: null, agents: null, seats: null, label: "Enterprise" },
  // Private-launch plan: the two founders plus the 20-seat cohort.
  DUO: { creditsPerMonth: 5_000, agents: 10, seats: 2, label: "Duo" },
};

/** Start of the current UTC billing month. */
export function currentBillingPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export type PlanGateDecision = {
  allowed: boolean;
  /** Credits left this month (null = unmetered plan). */
  remaining: number | null;
  message: string | null;
};

/**
 * Monthly plan-credit gate — pure decider behind the orchestrator's
 * PlanGatePort. Boundary: `used === limit` REFUSES the next run (a run must
 * never start it can't pay for; in-flight runs are budget-capped anyway).
 */
export function planGateDecision(
  used: number,
  plan: WorkspacePlan,
  period: { start: Date; end: Date } = currentBillingPeriod()
): PlanGateDecision {
  const limits = PLAN_LIMITS[plan];
  if (limits.creditsPerMonth == null) {
    return { allowed: true, remaining: null, message: null };
  }
  const remaining = limits.creditsPerMonth - used;
  if (remaining > 0) return { allowed: true, remaining, message: null };
  return {
    allowed: false,
    remaining: 0,
    message:
      `The ${limits.label} plan's ${limits.creditsPerMonth.toLocaleString()} monthly worker credits ` +
      `are exhausted (${used.toLocaleString()} used this metering month). ` +
      `Runs resume on ${period.end.toISOString().slice(0, 10)} when the month resets — ` +
      `see Billing to move to a bigger pool.`,
  };
}
