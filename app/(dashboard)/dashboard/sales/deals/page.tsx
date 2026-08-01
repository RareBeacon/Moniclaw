import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { formatRelative } from "@/lib/format";
import { salesPageContext, salesRepos } from "@/lib/sales/page-data";
import { CloseDealButtons, DealStageSelect } from "@/components/dashboard/sales/controls";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sales · Deals", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await salesPageContext();
  if (!ctx) return null;
  const sp = await searchParams;
  const repos = salesRepos();

  const [pipelines, deals, companies, contacts] = await Promise.all([
    repos.pipelines.list(ctx.workspace.id),
    repos.deals.list(ctx.workspace.id, {
      status: typeof sp.status === "string" && sp.status ? sp.status : undefined,
      stageId: typeof sp.stageId === "string" ? sp.stageId : undefined,
      take: 500,
    }),
    repos.companies.list(ctx.workspace.id, { take: 500 }),
    repos.contacts.list(ctx.workspace.id, { take: 500 }),
  ]);
  const pipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0];
  const companyById = new Map(companies.map((c) => [c.id, c.name] as const));
  const contactById = new Map(contacts.map((c) => [c.id, c.name] as const));

  const open = deals.filter((d) => d.status === "OPEN" && (!pipeline || d.pipelineId === pipeline.id));
  const closed = deals.filter((d) => d.status !== "OPEN");
  const byStage = new Map<string, typeof open>();
  if (pipeline) for (const s of pipeline.stages) byStage.set(s.id, open.filter((d) => d.stageId === s.id));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pipeline ? `${pipeline.name} — ` : ""}{open.length} open · {closed.length} closed
          </p>
        </div>
        {ctx.canWrite && (
          <Link href="/dashboard/sales/deals/new" className={cn(buttonVariants(), "group")}>
            <Plus className="h-4 w-4" aria-hidden /> New deal
          </Link>
        )}
      </div>

      {pipeline ? (
        <div className="grid gap-4 overflow-x-auto md:grid-cols-2 xl:grid-cols-4">
          {pipeline.stages.map((stage) => {
            const stageDeals = byStage.get(stage.id) ?? [];
            const value = stageDeals.reduce((sum, d) => sum + Number(d.valueUsd ?? 0), 0);
            return (
              <section key={stage.id} className="rounded-2xl border border-border bg-card">
                <header className="border-b border-border/60 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">{stage.name}</h2>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] text-muted-foreground">{stageDeals.length}</span>
                  </div>
                  <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                    {stage.winProbability}% close · ${value.toLocaleString()}
                  </p>
                </header>
                <div className="grid gap-2.5 p-3">
                  {stageDeals.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">No deals.</p>}
                  {stageDeals.map((d) => (
                    <article key={d.id} className="rounded-xl border border-border/80 bg-background p-3.5 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{d.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {companyById.get(d.companyId) ?? "—"}
                            {d.primaryContactId ? ` · ${contactById.get(d.primaryContactId) ?? ""}` : ""}
                          </p>
                        </div>
                        {d.valueUsd && <p className="text-sm font-semibold tabular-nums">${Number(d.valueUsd).toLocaleString()}</p>}
                      </div>
                      {d.expectedCloseAt && (
                        <p className="mt-1 text-[0.7rem] text-muted-foreground">close {formatRelative(d.expectedCloseAt)}</p>
                      )}
                      {ctx.canWrite && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <DealStageSelect dealId={d.id} stageId={d.stageId} stages={pipeline.stages} />
                          <CloseDealButtons dealId={d.id} />
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-8 py-16 text-center text-sm text-muted-foreground">
          No pipeline yet — one is created automatically with your first deal.
        </p>
      )}

      {closed.length > 0 && (
        <section className="rounded-2xl border border-border bg-card">
          <header className="border-b border-border/60 px-5 py-3.5">
            <h2 className="text-sm font-semibold">Closed ({closed.length})</h2>
          </header>
          <ul className="divide-y divide-border/60">
            {closed.slice(0, 25).map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium",
                  d.status === "WON" ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500")}>{d.status}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {companyById.get(d.companyId) ?? "—"}
                    {d.lostReason ? ` · ${d.lostReason}` : ""}
                    {d.closedAt ? ` · closed ${formatRelative(d.closedAt)}` : ""}
                  </p>
                </div>
                {d.valueUsd && <p className="text-sm font-semibold tabular-nums">${Number(d.valueUsd).toLocaleString()}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
