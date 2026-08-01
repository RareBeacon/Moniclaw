import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, CalendarCheck, Handshake, MailCheck, Megaphone, Users } from "lucide-react";

import { formatRelative } from "@/lib/format";
import { salesAnalytics, salesPageContext, salesRepos, badgesForDraftStatus } from "@/lib/sales/page-data";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sales", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default async function SalesOverviewPage() {
  const ctx = await salesPageContext();
  if (!ctx) return null;
  const ws = ctx.workspace.id;
  const repos = salesRepos();

  const [overview, priorityCompanies, openTasks, pendingDrafts, activeCampaigns] = await Promise.all([
    salesAnalytics().overview(ws),
    repos.companies.list(ws, { take: 200 }),
    repos.activities.list(ws, { openOnly: true, take: 50 }),
    repos.drafts.list(ws, { status: "PENDING_REVIEW", take: 5 }),
    repos.campaigns.list(ws, { status: "ACTIVE", take: 5 }),
  ]);
  const top = [...priorityCompanies].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 5);
  const tasks = [...openTasks]
    .filter((a) => ["TASK", "CALL", "REMINDER"].includes(a.type))
    .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity))
    .slice(0, 5);

  const tiles = [
    { label: "Companies", value: overview.companies.total, sub: `${overview.companies.researched} researched · avg priority ${Math.round(overview.companies.avgPriority)}`, icon: Building2, href: "/dashboard/sales/companies" },
    { label: "Contacts", value: overview.contacts.total, sub: `${overview.contacts.byStatus.QUALIFIED ?? 0} qualified`, icon: Users, href: "/dashboard/sales/contacts" },
    { label: "Open pipeline", value: money(overview.deals.openValueUsd), sub: `${overview.deals.openCount} open deals`, icon: Handshake, href: "/dashboard/sales/deals" },
    { label: "Won (30d)", value: money(overview.deals.wonValueUsd30d), sub: `${overview.deals.wonCount30d} deals`, icon: Handshake, href: "/dashboard/sales/analytics" },
    { label: "Open tasks", value: overview.activities.openTasks, sub: `${overview.activities.dueThisWeek} due this week`, icon: CalendarCheck, href: "/dashboard/sales/tasks" },
    { label: "Drafts today", value: overview.campaigns.draftsToday, sub: `${overview.campaigns.enrollmentsActive} active enrollments`, icon: MailCheck, href: "/dashboard/sales/drafts" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your AI sales employee: researches companies, plans outreach, drafts for human review,
            and keeps the customer record clean. Nothing sends without approval.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/sales/companies/new" className={cn(buttonVariants(), "group")}>Add company</Link>
          <Link href="/dashboard/sales/campaigns/new" className={cn(buttonVariants({ variant: "outline" }), "group")}>New campaign</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(({ label, value, sub, icon: Icon, href }) => (
          <Link key={label} href={href} className="group rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
            <h2 className="text-sm font-semibold">Top-priority companies</h2>
            <Link href="/dashboard/sales/companies" className="text-xs text-primary hover:underline">All companies</Link>
          </header>
          {top.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">No companies yet — add your first account to start scoring.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {top.map((c) => (
                <li key={c.id}>
                  <Link href={`/dashboard/sales/companies/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{[c.industry, c.geography].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{c.priorityScore}</p>
                      <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">priority</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
            <h2 className="text-sm font-semibold">Up next for you</h2>
            <Link href="/dashboard/sales/tasks" className="text-xs text-primary hover:underline">Tasks</Link>
          </header>
          {tasks.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">No open tasks. Campaign steps create tasks automatically.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">{t.type}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.subject}</p>
                    {t.dueAt && <p className="text-xs text-muted-foreground">due {formatRelative(t.dueAt)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
            <h2 className="text-sm font-semibold">Awaiting review</h2>
            <Link href="/dashboard/sales/drafts?status=PENDING_REVIEW" className="text-xs text-primary hover:underline">All drafts</Link>
          </header>
          {pendingDrafts.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">Nothing waiting on a human. Campaign drafts land here first.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {pendingDrafts.map((d) => {
                const badge = badgesForDraftStatus(d.status);
                return (
                  <li key={d.id}>
                    <Link href={`/dashboard/sales/drafts/${d.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.subject || "(no subject)"}</p>
                        <p className="text-xs text-muted-foreground">{d.channel} · {formatRelative(new Date(d.createdAt))}</p>
                      </div>
                      <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">{badge.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
            <h2 className="text-sm font-semibold">Active campaigns</h2>
            <Link href="/dashboard/sales/campaigns" className="text-xs text-primary hover:underline">All campaigns</Link>
          </header>
          {activeCampaigns.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">No active sequences. Activate a campaign to start generating review drafts.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {activeCampaigns.map((c) => (
                <li key={c.id}>
                  <Link href={`/dashboard/sales/campaigns/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                    <Megaphone className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      {c.goal && <p className="truncate text-xs text-muted-foreground">{c.goal}</p>}
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">Active</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
