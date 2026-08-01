import type { Metadata } from "next";
import Link from "next/link";

import { formatRelative } from "@/lib/format";
import { salesPageContext, salesRepos, sourcesOf } from "@/lib/sales/page-data";
import { RefreshButton, ResearchButton } from "@/components/dashboard/sales/controls";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sales · Research", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const tone: Record<string, string> = {
  NONE: "bg-zinc-500/10 text-zinc-500",
  QUEUED: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  RUNNING: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  COMPLETED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  FAILED: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default async function ResearchPage() {
  const ctx = await salesPageContext();
  if (!ctx) return null;
  const companies = await salesRepos().companies.list(ctx.workspace.id, { take: 200 });
  const ordered = [...companies].sort((a, b) => {
    const rank = (s: string) => (s === "RUNNING" || s === "QUEUED" ? 0 : s === "NONE" ? 1 : s === "FAILED" ? 2 : 3);
    return rank(a.researchStatus) - rank(b.researchStatus);
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Company research</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The research worker reads public pages only — company sites, public directories, news.
            Every claim lands with a source; nothing private or paywalled is touched.
            Requires an AI provider key in{" "}
            <Link href="/dashboard/ai-providers" className="text-primary hover:underline">AI Providers</Link>.
          </p>
        </div>
        <RefreshButton />
      </div>

      <div className="grid gap-4">
        {ordered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border px-8 py-16 text-center text-sm text-muted-foreground">
            No companies yet — add accounts, then research them here.
          </div>
        )}
        {ordered.map((c) => {
          const sources = sourcesOf(c.sources);
          return (
            <article key={c.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <Link href={`/dashboard/sales/companies/${c.id}`} className="text-base font-semibold hover:text-primary">{c.name}</Link>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", tone[c.researchStatus] ?? tone.NONE)}>
                      {c.researchStatus.toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.domain ?? "no domain"} · {c.lastResearchedAt ? `last refreshed ${formatRelative(c.lastResearchedAt)}` : "never researched"}
                  </p>
                </div>
                {ctx.canWrite && <ResearchButton companyId={c.id} status={c.researchStatus} />}
              </div>
              {c.summary && <p className="mt-3 text-sm leading-6 text-muted-foreground line-clamp-3">{c.summary}</p>}
              {sources.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {sources.slice(0, 5).map((s) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noreferrer"
                      className="max-w-72 truncate rounded-full bg-muted px-2.5 py-1 text-[0.7rem] text-muted-foreground hover:text-primary">
                      {s.title || s.url}
                    </a>
                  ))}
                  {sources.length > 5 && <span className="px-1.5 py-1 text-[0.7rem] text-muted-foreground">+{sources.length - 5} more</span>}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
