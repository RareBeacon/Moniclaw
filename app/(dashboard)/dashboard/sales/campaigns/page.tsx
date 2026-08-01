import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";

import { db } from "@/lib/db";
import { formatRelative } from "@/lib/format";
import { salesPageContext, salesRepos } from "@/lib/sales/page-data";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sales · Campaigns", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const tone: Record<string, string> = {
  DRAFT: "bg-zinc-500/10 text-zinc-500",
  ACTIVE: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  PAUSED: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  COMPLETED: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  ARCHIVED: "bg-zinc-500/10 text-zinc-500",
};

export default async function CampaignsPage() {
  const ctx = await salesPageContext();
  if (!ctx) return null;
  const campaigns = await salesRepos().campaigns.list(ctx.workspace.id, { take: 100 });
  const enrollmentCounts = await db.salesCampaignEnrollment.groupBy({
    by: ["campaignId"],
    where: { campaign: { workspaceId: ctx.workspace.id, deletedAt: null }, status: "ACTIVE" },
    _count: { _all: true },
  });
  const counts = new Map(enrollmentCounts.map((row) => [row.campaignId, row._count._all] as const));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Multi-step sequences that produce drafts for human review — never auto-sent.
            The daily tick advances enrolled contacts through steps.
          </p>
        </div>
        {ctx.canManageCampaigns && (
          <Link href="/dashboard/sales/campaigns/new" className={cn(buttonVariants(), "group")}>
            <Plus className="h-4 w-4" aria-hidden /> New campaign
          </Link>
        )}
      </div>

      <div className="grid gap-4">
        {campaigns.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border px-8 py-16 text-center text-sm text-muted-foreground">
            No campaigns yet — build a sequence of templated steps and enroll your contacts.
          </div>
        )}
        {campaigns.map((c) => (
          <Link key={c.id} href={`/dashboard/sales/campaigns/${c.id}`}
            className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <Megaphone className="h-5 w-5 text-primary" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <p className="truncate text-sm font-semibold">{c.name}</p>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", tone[c.status])}>{c.status.toLowerCase()}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {c.goal ?? "sequence"} · {counts.get(c.id) ?? 0} active enrollments · cap {c.dailyCap}/day · created {formatRelative(new Date(c.createdAt))}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
