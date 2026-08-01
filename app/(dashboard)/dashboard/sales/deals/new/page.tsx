import type { Metadata } from "next";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { requireSalesAction } from "@/lib/sales/require-sales";
import { salesRepos } from "@/lib/sales/page-data";
import { DealForm } from "@/components/dashboard/sales/forms";

export const metadata: Metadata = { title: "Sales · New deal", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireSalesAction("sales.write");
  if (!gate) return <AccessDenied required="Member" />;
  const sp = await searchParams;
  const [companies, contacts] = await Promise.all([
    salesRepos().companies.list(gate.workspace.id, { take: 500 }),
    salesRepos().contacts.list(gate.workspace.id, { take: 500 }),
  ]);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New deal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Starts on the first stage of the default pipeline; drag it forward as the conversation matures.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6">
        <DealForm
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          contacts={contacts.map((c) => ({ id: c.id, name: c.name, companyId: c.companyId }))}
          defaultCompanyId={typeof sp.companyId === "string" ? sp.companyId : null}
        />
      </div>
    </div>
  );
}
