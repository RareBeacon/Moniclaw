import type { Metadata } from "next";

import { db } from "@/lib/db";
import { currentBillingPeriod, PLAN_LIMITS } from "@/lib/billing";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { formatCredits } from "@/lib/format";
import { getRuntime } from "@/lib/ai/runtime";

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

      <AiUsageSection workspaceId={workspace.id} />

      <p className="mt-8 text-xs leading-5 text-muted-foreground">
        Credits measure agent work — browser actions, API calls, reasoning
        steps. Per-run breakdowns live in Runs; CSV exports in Files for
        finance reconciliation.
      </p>
    </div>
  );
}

const int = new Intl.NumberFormat("en-US");

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return int.format(n);
}

async function AiUsageSection({ workspaceId }: { workspaceId: string }) {
  const summary = await getRuntime().usage.summarize(workspaceId, 30);
  const maxDaily = Math.max(1, ...summary.daily.map((d) => d.tokens));
  const maxProvider = Math.max(1, ...summary.byProvider.map((p) => p.totalTokens));

  return (
    <section className="mt-8" aria-label="AI runtime usage">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">AI runtime (last {summary.windowDays} days)</h2>
        <p className="text-xs text-muted-foreground">
          Every model call through the runtime — provider-agnostic.
        </p>
      </div>

      {summary.requests === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed bg-card/50 px-5 py-10 text-center text-sm text-muted-foreground">
          No AI calls yet. Open the Playground or run a workflow to start the
          meter — tokens, latency, and costs land here.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Requests" value={int.format(summary.requests)} hint={`${Math.round(summary.okRate * 100)}% ok`} />
            <Kpi label="Tokens" value={formatTokens(summary.totalTokens)} hint={`${formatTokens(summary.promptTokens)} in · ${formatTokens(summary.completionTokens)} out`} />
            <Kpi label="Avg latency" value={`${summary.avgLatencyMs}ms`} hint={`${int.format(summary.toolCalls)} tool calls`} />
            <Kpi label="Est. cost" value={`$${summary.costUsd.toFixed(4)}`} hint="reported by providers" />
          </div>

          {summary.daily.length > 0 && (
            <div className="mt-6 rounded-xl border bg-card px-5 py-4">
              <p className="text-xs font-medium text-muted-foreground">Tokens per day</p>
              <div className="mt-3 flex h-24 items-end gap-1" role="img" aria-label="Daily token usage bar chart">
                {summary.daily.map((d) => (
                  <div
                    key={d.day}
                    className="flex-1 rounded-t bg-primary/70"
                    style={{ height: `${Math.max(3, Math.round((d.tokens / maxDaily) * 100))}%` }}
                    title={`${d.day}: ${formatTokens(d.tokens)} tokens · ${int.format(d.requests)} requests`}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                <span>{summary.daily[0]?.day}</span>
                <span>{summary.daily[summary.daily.length - 1]?.day}</span>
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-card px-5 py-4">
              <p className="text-xs font-medium text-muted-foreground">By provider</p>
              <ul className="mt-3 space-y-2.5">
                {summary.byProvider.map((p) => (
                  <li key={p.provider}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium capitalize">{p.provider}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTokens(p.totalTokens)} tokens · {int.format(p.requests)} req · ${p.costUsd.toFixed(4)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max(2, Math.round((p.totalTokens / maxProvider) * 100))}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border bg-card px-5 py-4">
                <p className="text-xs font-medium text-muted-foreground">Top models</p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {summary.byModel.map((m) => (
                    <li key={m.model} className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-mono text-xs">{m.model}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatTokens(m.totalTokens)} · {int.format(m.requests)} req
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {summary.topErrors.length > 0 && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
                  <p className="text-xs font-medium text-red-600">Top errors</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {summary.topErrors.map((e) => (
                      <li key={e.code} className="flex justify-between text-xs">
                        <span className="font-mono">{e.code}</span>
                        <span className="text-muted-foreground">×{e.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
