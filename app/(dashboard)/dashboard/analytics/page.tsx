import type { Metadata } from "next";

import { db } from "@/lib/db";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { formatCredits } from "@/lib/format";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const DAYS = 30;

export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary) return null;
  const { workspace } = primary;

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

  const runs = await db.agentRun.findMany({
    where: { workspaceId: workspace.id, createdAt: { gte: since } },
    select: { status: true, creditsUsed: true, createdAt: true, mode: true },
    orderBy: { createdAt: "asc" },
  });

  // Bucket runs per day.
  const buckets: { label: string; total: number; succeeded: number }[] = [];
  const byDay = new Map<string, { total: number; succeeded: number }>();
  runs.forEach((run) => {
    const key = run.createdAt.toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? { total: 0, succeeded: 0 };
    entry.total += 1;
    if (run.status === "SUCCEEDED") entry.succeeded += 1;
    byDay.set(key, entry);
  });
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? { total: 0, succeeded: 0 };
    buckets.push({
      label: date.toLocaleDateString("en", { month: "short", day: "numeric" }),
      ...entry,
    });
  }

  const maxPerDay = Math.max(1, ...buckets.map((b) => b.total));

  const totals = runs.reduce(
    (acc, run) => {
      acc[run.status] = (acc[run.status] ?? 0) + 1;
      acc.credits += run.creditsUsed;
      if (run.mode === "SHADOW") acc.shadow += 1;
      return acc;
    },
    { credits: 0, shadow: 0 } as Record<string, number>
  );

  const finished = (totals.SUCCEEDED ?? 0) + (totals.FAILED ?? 0);
  const successRate = finished > 0 ? Math.round(((totals.SUCCEEDED ?? 0) / finished) * 100) : null;

  const kpis = [
    { label: "Runs · 30d", value: formatCredits(runs.length), sub: `${totals.shadow} in shadow mode` },
    {
      label: "Success rate",
      value: successRate === null ? "—" : `${successRate}%`,
      sub: finished > 0 ? `${formatCredits(finished)} finished runs` : "no finished runs yet",
    },
    { label: "Credits · 30d", value: formatCredits(totals.credits), sub: "all agents, all triggers" },
    {
      label: "Needs approval",
      value: formatCredits(totals.NEEDS_APPROVAL ?? 0),
      sub: "policy stops, by design",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Thirty days of operational truth — volume, reliability, and spend.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border bg-card p-5">
            <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
            <p className="mt-2.5 text-2xl font-semibold tracking-tight">{kpi.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border bg-card p-6" aria-label="Runs per day">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Runs per day</h2>
          <p className="text-xs text-muted-foreground">bars: total · fill: succeeded</p>
        </div>
        {runs.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed bg-card/50 px-5 py-12 text-center text-sm text-muted-foreground">
            No runs in the last 30 days. The chart lights up with your first run.
          </p>
        ) : (
          <div
            className="mt-6 flex h-44 items-end gap-[3px]"
            role="img"
            aria-label={`Daily runs over the last 30 days, peak ${maxPerDay} per day`}
          >
            {buckets.map((bucket) => (
              <div
                key={bucket.label}
                title={`${bucket.label}: ${bucket.total} runs (${bucket.succeeded} succeeded)`}
                className="group relative flex-1 rounded-t bg-secondary transition-colors hover:bg-secondary/80"
                style={{ height: `${Math.max(3, (bucket.total / maxPerDay) * 100)}%` }}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-t bg-primary/80"
                  style={{ height: `${bucket.total ? (bucket.succeeded / bucket.total) * 100 : 0}%` }}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-6 text-xs leading-5 text-muted-foreground">
        Analytics are computed from the runs ledger — the same data behind the
        audit log and CSV exports, so finance and ops always see one truth.
      </p>
    </div>
  );
}
