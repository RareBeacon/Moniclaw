import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Gauge, History, Plus, ShieldCheck } from "lucide-react";

import { getCurrentUser, getDashboardOverview, getPrimaryWorkspace } from "@/lib/workspace";
import { formatCredits, formatRelative } from "@/lib/format";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Workspace overview",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null; // layout already guards

  const overview = await getDashboardOverview(primary.workspace.id);
  const firstName = user.name?.split(" ")[0] ?? "there";
  const autonomous = (overview.agentsByStatus["AUTONOMOUS"] ?? 0) +
    (overview.agentsByStatus["SUPERVISED"] ?? 0);

  const kpis = [
    {
      icon: Bot,
      label: "Agents",
      value: String(overview.agentCount),
      sub: autonomous > 0 ? `${autonomous} live` : "none live yet",
    },
    {
      icon: History,
      label: "Runs · 7 days",
      value: formatCredits(overview.runs7d),
      sub: "all triggers",
    },
    {
      icon: Gauge,
      label: "Credits · 30 days",
      value: formatCredits(overview.credits30d),
      sub: `of ${primary.workspace.plan === "STARTER" ? "500" : "plan"} included`,
    },
    {
      icon: ShieldCheck,
      label: "Pending approvals",
      value: String(overview.pendingApprovals),
      sub: overview.pendingApprovals > 0 ? "waiting on you" : "inbox zero",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Good to see you, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {primary.workspace.name} · {overview.agentCount === 0
              ? "No agents on staff yet"
              : `${overview.agentCount} agent${overview.agentCount === 1 ? "" : "s"} on staff`}
          </p>
        </div>
        <Link href="/dashboard/agents/new" className={cn(buttonVariants(), "group")}>
          <Plus className="h-4 w-4" aria-hidden />
          New agent
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <p className="text-xs font-medium">{kpi.label}</p>
              <kpi.icon className="h-4 w-4" aria-hidden />
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight">{kpi.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {overview.agentCount === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Bot}
            title="Hire your first agent"
            description="Describe the job in plain language, start it in shadow mode tonight, and promote it to supervised when the evidence convinces you."
            cta="Create your first agent"
            href="/dashboard/agents/new"
          />
          <ol className="mx-auto mt-8 grid max-w-3xl gap-3 text-sm text-muted-foreground sm:grid-cols-3">
            {[
              "1 · Describe the job and definition of done",
              "2 · Shadow-run it against live data",
              "3 · Promote with thresholds you set",
            ].map((step) => (
              <li key={step} className="rounded-lg border bg-card px-4 py-3">
                {step}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent runs</h2>
            <Link
              href="/dashboard/runs"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="mt-4 divide-y rounded-xl border bg-card">
            {overview.recentRuns.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-muted-foreground">
                No runs yet — start one from the Agents page.
              </li>
            )}
            {overview.recentRuns.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 text-sm"
              >
                <span className="font-medium">{run.agent.name}</span>
                <StatusBadge status={run.status} kind="run" />
                <span className="text-xs text-muted-foreground">
                  {run.mode === "SHADOW" ? "shadow" : "live"} · {run.triggerSource}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatRelative(run.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
