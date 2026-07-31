import type { Metadata } from "next";

import { db } from "@/lib/db";
import { currentBillingPeriod, PLAN_LIMITS } from "@/lib/billing";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { formatCredits } from "@/lib/format";

export const metadata: Metadata = {
  title: "Usage",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary) return null;
  const { workspace } = primary;

  const { start, end } = currentBillingPeriod();
  const limits = PLAN_LIMITS[workspace.plan];

  const [creditSum, byAgent, runsCount] = await Promise.all([
    db.agentRun.aggregate({
      where: { workspaceId: workspace.id, createdAt: { gte: start, lt: end } },
      _sum: { creditsUsed: true },
    }),
    db.agentRun.groupBy({
      by: ["agentId"],
      where: { workspaceId: workspace.id, createdAt: { gte: start, lt: end } },
      _sum: { creditsUsed: true },
      _count: { id: true },
      orderBy: { _sum: { creditsUsed: "desc" } },
      take: 12,
    }),
    db.agentRun.count({
      where: { workspaceId: workspace.id, createdAt: { gte: start, lt: end } },
    }),
  ]);

  const agentIds = byAgent.map((row) => row.agentId);
  const agents = await db.agent.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true, status: true },
  });
  const agentNames = new Map(agents.map((a) => [a.id, a.name]));

  const used = creditSum._sum.creditsUsed ?? 0;
  const included = limits.creditsPerMonth;
  const pct = included ? Math.min(100, Math.round((used / included) * 100)) : 0;
  const maxAgentCredits = Math.max(1, ...byAgent.map((row) => row._sum.creditsUsed ?? 0));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Billing period {start.toLocaleDateString("en", { month: "long", day: "numeric" })} –{" "}
        {new Date(end.getTime() - 1).toLocaleDateString("en", { month: "long", day: "numeric" })} (UTC)
        · {limits.label} plan
      </p>

      <section className="mt-8 rounded-2xl border bg-card p-6" aria-label="Credits this period">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">Credits consumed</p>
          <p className="text-sm text-muted-foreground">
            <strong className="text-2xl font-semibold tracking-tight text-foreground">
              {formatCredits(used)}
            </strong>{" "}
            {included ? `of ${formatCredits(included)} included` : "committed-use plan"}
          </p>
        </div>
        {included && (
          <>
            <div
              className="mt-4 h-2.5 overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Credit usage"
            >
              <div
                className={
                  pct > 90
                    ? "h-full rounded-full bg-red-500 transition-all"
                    : "h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all"
                }
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {pct}% used · runs pause politely at 100% unless overage is
              enabled in Billing.
            </p>
          </>
        )}
        <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
          <strong className="text-foreground">{formatCredits(runsCount)}</strong> runs
          this period across <strong className="text-foreground">{byAgent.length}</strong> agents.
        </p>
      </section>

      <section className="mt-8" aria-label="Usage by agent">
        <h2 className="text-sm font-semibold">By agent</h2>
        {byAgent.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed bg-card/50 px-5 py-10 text-center text-sm text-muted-foreground">
            No consumption this period. Queue a run to start the meter.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {byAgent.map((row) => {
              const credits = row._sum.creditsUsed ?? 0;
              return (
                <li key={row.agentId} className="rounded-xl border bg-card px-5 py-4">
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <p className="font-medium">{agentNames.get(row.agentId) ?? "Archived agent"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCredits(credits)} credits · {formatCredits(row._count.id)} runs
                    </p>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${Math.max(2, Math.round((credits / maxAgentCredits) * 100))}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs leading-5 text-muted-foreground">
        Credits measure agent work — browser actions, API calls, reasoning
        steps. Per-run breakdowns live in Runs; CSV exports in Files for
        finance reconciliation.
      </p>
    </div>
  );
}
