import type { Metadata } from "next";

import { salesAnalytics, salesPageContext } from "@/lib/sales/page-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sales · Analytics", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function BreakdownTable({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map(([key, value]) => (
            <li key={key}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{key}</span>
                <span className="tabular-nums text-muted-foreground">{value}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function SalesAnalyticsPage() {
  const ctx = await salesPageContext();
  if (!ctx) return null;
  const o = await salesAnalytics().overview(ctx.workspace.id);

  const tiles = [
    { label: "Companies", value: String(o.companies.total), sub: `${o.companies.researched} researched · avg priority ${Math.round(o.companies.avgPriority)}` },
    { label: "Contacts", value: String(o.contacts.total), sub: `${o.contacts.byStatus.NEW ?? 0} untouched` },
    { label: "Open pipeline", value: money(o.deals.openValueUsd), sub: `${o.deals.openCount} open deals` },
    { label: "Won · 30d", value: money(o.deals.wonValueUsd30d), sub: `${o.deals.wonCount30d} deals closed` },
    { label: "Tasks due this week", value: String(o.activities.dueThisWeek), sub: `${o.activities.openTasks} open total · ${o.activities.completed30d} done (30d)` },
    { label: "Campaigns active", value: String(o.campaigns.active), sub: `${o.campaigns.enrollmentsActive} enrollments · ${o.campaigns.draftsToday} drafts today` },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Live rollup across prospecting, outreach, and pipeline.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className={cn("rounded-2xl border border-border bg-card p-5")}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{t.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownTable title="Contacts by status" data={o.contacts.byStatus} />
        <BreakdownTable title="Drafts by status" data={o.drafts.byStatus} />
      </div>

      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm leading-6">
        <p className="font-medium text-amber-700 dark:text-amber-400">Measurement note</p>
        <p className="mt-1 text-amber-700/80 dark:text-amber-400/80">
          Send-rate, open-rate, and reply-rate metrics activate with the email-provider integration
          (drafts are currently approved artifacts — delivery tracking begins once a provider is connected).
          Everything above is computed from live records, never sampled.
        </p>
      </section>
    </div>
  );
}
