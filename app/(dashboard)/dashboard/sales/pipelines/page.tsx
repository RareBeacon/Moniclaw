import type { Metadata } from "next";

import { db } from "@/lib/db";
import { salesPageContext, salesRepos } from "@/lib/sales/page-data";
import { PipelineForm } from "@/components/dashboard/sales/forms";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sales · Pipelines", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PipelinesPage() {
  const ctx = await salesPageContext();
  if (!ctx) return null;
  const repos = salesRepos();
  await repos.pipelines.ensureDefault(ctx.workspace.id);
  const pipelines = await repos.pipelines.list(ctx.workspace.id);
  const openCounts = await db.salesDeal.groupBy({
    by: ["pipelineId"],
    where: { workspaceId: ctx.workspace.id, status: "OPEN", deletedAt: null },
    _count: { _all: true },
  });
  const counts = new Map(openCounts.map((r) => [r.pipelineId, r._count._all] as const));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipelines</h1>
        <p className="mt-1 text-sm text-muted-foreground">Stages, win probabilities, and open-deal load per pipeline.</p>
      </div>

      <div className="grid gap-4">
        {pipelines.map((p) => (
          <section key={p.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold">{p.name}</h2>
              {p.isDefault && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">default</span>}
              <span className="text-xs text-muted-foreground">{counts.get(p.id) ?? 0} open deals</span>
            </div>
            <ol className="mt-3 flex flex-wrap gap-2">
              {p.stages.map((s) => (
                <li key={s.id} className={cn("rounded-xl border px-3.5 py-2 text-sm", "border-border bg-background")}>
                  <span className="font-medium">{s.order + 1}. {s.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{s.winProbability}%</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      {ctx.canWrite && (
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-base font-semibold">Create pipeline</h2>
          <PipelineForm />
        </section>
      )}
    </div>
  );
}
