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
};

/** Start of the current UTC billing month. */
export function currentBillingPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}
