import type { Metadata } from "next";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { requireSalesAction } from "@/lib/sales/require-sales";
import { CompanyForm } from "@/components/dashboard/sales/forms";

export const metadata: Metadata = { title: "Sales · New company", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewCompanyPage() {
  const gate = await requireSalesAction("sales.write");
  if (!gate) return <AccessDenied required="Member" />;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add company</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The account is scored immediately; run research to enrich it from public sources.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6">
        <CompanyForm />
      </div>
    </div>
  );
}
