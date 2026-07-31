import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CreditCard } from "lucide-react";

import { currentBillingPeriod, PLAN_LIMITS } from "@/lib/billing";
import { db } from "@/lib/db";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { formatCredits } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Billing",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary) return null;
  const { workspace } = primary;

  const { start, end } = currentBillingPeriod();
  const limits = PLAN_LIMITS[workspace.plan];
  const creditSum = await db.agentRun.aggregate({
    where: { workspaceId: workspace.id, createdAt: { gte: start, lt: end } },
    _sum: { creditsUsed: true },
  });
  const used = creditSum._sum.creditsUsed ?? 0;

  return (
    <div className="mx-auto max-4xl max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Plan, payment method, and invoices.
      </p>

      <section className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold">
          <CreditCard className="h-4 w-4 text-amber-500" aria-hidden />
          Paid billing activates at the end of the open preview
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          You&apos;re on the <strong className="text-foreground">{limits.label}</strong>{" "}
          plan, free during the preview. The ledger below already tracks your
          credits against plan limits, so the day billing switches on there
          are no surprises — and your card is never required before then.
          Plans downgrade or cancel from this page when it activates.
        </p>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-3" aria-label="Current plan facts">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground">Current plan</p>
          <p className="mt-2 text-xl font-semibold">{limits.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {limits.agents ? `${limits.agents} agents` : "unlimited agents"} ·{" "}
            {limits.seats ? `${limits.seats} seats` : "unlimited seats"}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground">Credits this period</p>
          <p className="mt-2 text-xl font-semibold">
            {formatCredits(used)}
            <span className="text-sm font-normal text-muted-foreground">
              {limits.creditsPerMonth ? ` / ${formatCredits(limits.creditsPerMonth)}` : " / committed"}
            </span>
          </p>
          <Link
            href="/dashboard/usage"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            Usage breakdown <ArrowUpRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground">Payment method</p>
          <p className="mt-2 text-xl font-semibold text-muted-foreground">None on file</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Not needed while the preview is free.
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border bg-card p-6">
        <h2 className="text-sm font-semibold">Invoices</h2>
        <p className="mt-3 rounded-xl border border-dashed bg-card/50 px-5 py-8 text-center text-sm text-muted-foreground">
          No invoices yet — nothing has ever been charged. Full invoice
          history with credit-itemized line items will live here.
        </p>
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-6">
        <div>
          <h2 className="text-sm font-semibold">Need Enterprise terms today?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Committed-use pricing, custom DPAs, and VPC runners are available now.
          </p>
        </div>
        <Link
          href="/contact?topic=sales"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Talk to sales
        </Link>
      </div>
    </div>
  );
}
