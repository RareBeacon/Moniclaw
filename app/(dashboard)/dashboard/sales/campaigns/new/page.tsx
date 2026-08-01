import type { Metadata } from "next";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { requireSalesAction } from "@/lib/sales/require-sales";
import { CampaignForm } from "@/components/dashboard/sales/forms";

export const metadata: Metadata = { title: "Sales · New campaign", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const gate = await requireSalesAction("sales.campaigns.manage");
  if (!gate) return <AccessDenied required="Member" />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New campaign</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build a sequence of steps. Drafts are personalized from company research and your
          templates — each one waits for a manager&apos;s approval before it can be scheduled.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6">
        <CampaignForm />
      </div>
    </div>
  );
}
