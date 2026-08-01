import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { salesPageContext, salesRepos, sourcesOf } from "@/lib/sales/page-data";
import { DeleteSearchButton, SavedSearchControls } from "@/components/dashboard/sales/controls";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sales · Companies", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const researchTone: Record<string, string> = {
  NONE: "bg-zinc-500/10 text-zinc-500",
  QUEUED: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  RUNNING: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  COMPLETED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  FAILED: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await salesPageContext();
  if (!ctx) return null;
  const sp = await searchParams;
  const repos = salesRepos();

  const filters = {
    query: typeof sp.q === "string" ? sp.q : undefined,
    industry: typeof sp.industry === "string" ? sp.industry : undefined,
    segment: typeof sp.segment === "string" ? sp.segment : undefined,
    territory: typeof sp.territory === "string" ? sp.territory : undefined,
    minPriority: typeof sp.minPriority === "string" && sp.minPriority ? Number(sp.minPriority) : undefined,
    minFit: typeof sp.minFit === "string" && sp.minFit ? Number(sp.minFit) : undefined,
    tags: typeof sp.tags === "string" && sp.tags ? sp.tags.split(",").filter(Boolean) : undefined,
    hasOpenDeal: sp.openDeal === "1" ? true : undefined,
    take: 200,
  } as const;

  const [companies, searches] = await Promise.all([
    repos.companies.list(ctx.workspace.id, filters),
    repos.searches.list(ctx.workspace.id, "companies"),
  ]);

  const qs = (patch: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: filters.query ?? "", industry: filters.industry ?? "", segment: filters.segment ?? "", territory: filters.territory ?? "", minPriority: filters.minPriority?.toString() ?? "", tags: (filters.tags ?? []).join(","), ...patch })) {
      if (v) params.set(k, v);
    }
    const s = params.toString();
    return `/dashboard/sales/companies${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your account book — scored, researched, deduped by domain.</p>
        </div>
        {ctx.canWrite && (
          <Link href="/dashboard/sales/companies/new" className={cn(buttonVariants(), "group")}>
            <Plus className="h-4 w-4" aria-hidden /> Add company
          </Link>
        )}
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <input name="q" defaultValue={filters.query} placeholder="Search name or domain…" className="h-9 min-w-52 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
        <input name="industry" defaultValue={filters.industry} placeholder="Industry" className="h-9 w-32 rounded-md border border-input bg-background px-3 text-sm" />
        <input name="segment" defaultValue={filters.segment} placeholder="Segment" className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm" />
        <input name="territory" defaultValue={filters.territory} placeholder="Territory" className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm" />
        <input name="minPriority" defaultValue={filters.minPriority?.toString()} placeholder="Min priority" type="number" min={0} max={100} className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm" />
        <input name="tags" defaultValue={(filters.tags ?? []).join(",")} placeholder="tags,a,b" className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm" />
        <button type="submit" className={cn(buttonVariants({ size: "sm" }))}>Filter</button>
        <Link href="/dashboard/sales/companies" className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}>Reset</Link>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {ctx.canWrite && <SavedSearchControls entity="companies" filters={filters} searches={searches} />}
        {searches.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {searches.map((s) => {
              const f = (s.filters ?? {}) as Record<string, unknown>;
              const params = new URLSearchParams();
              if (typeof f.query === "string") params.set("q", f.query);
              if (Array.isArray(f.tags)) params.set("tags", f.tags.join(","));
              if (typeof f.industry === "string") params.set("industry", f.industry);
              if (typeof f.minPriority === "number") params.set("minPriority", String(f.minPriority));
              return (
                <span key={s.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs">
                  <Link href={`/dashboard/sales/companies?${params.toString()}`} className="hover:text-primary">{s.name}</Link>
                  {ctx.canWrite && <DeleteSearchButton id={s.id} />}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Industry</th>
              <th className="px-4 py-3 text-center">Priority</th>
              <th className="px-4 py-3 text-center">ICP fit</th>
              <th className="px-4 py-3">Research</th>
              <th className="px-4 py-3">Tags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {companies.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                No companies match — adjust filters or add your first account.
              </td></tr>
            )}
            {companies.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/sales/companies/${c.id}`} className="font-medium hover:text-primary">{c.name}</Link>
                  {c.domain && <p className="text-xs text-muted-foreground">{c.domain}</p>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.industry ?? "—"}</td>
                <td className="px-4 py-3 text-center font-semibold tabular-nums">{c.priorityScore}</td>
                <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">{c.icpFit ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", researchTone[c.researchStatus] ?? researchTone.NONE)}>
                    {c.researchStatus === "COMPLETED" ? `${sourcesOf(c.sources).length} sources` : c.researchStatus.toLowerCase()}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.tags.slice(0, 3).map((t) => (
                      <Link key={t} href={qs({ tags: t })} className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] text-muted-foreground hover:text-primary">{t}</Link>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{companies.length} compan{companies.length === 1 ? "y" : "ies"}</p>
    </div>
  );
}
