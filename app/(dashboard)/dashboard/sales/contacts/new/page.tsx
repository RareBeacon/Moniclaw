import type { Metadata } from "next";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { requireSalesAction } from "@/lib/sales/require-sales";
import { salesRepos } from "@/lib/sales/page-data";
import { ContactForm } from "@/components/dashboard/sales/forms";

export const metadata: Metadata = { title: "Sales · New contact", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireSalesAction("sales.write");
  if (!gate) return <AccessDenied required="Member" />;
  const sp = await searchParams;
  const companies = (await salesRepos().companies.list(gate.workspace.id, { take: 500 }))
    .map((c) => ({ id: c.id, name: c.name }));
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add contact</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Only people you may lawfully contact: public details or channels they gave you. Note the source.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6">
        <ContactForm companies={companies} defaultCompanyId={typeof sp.companyId === "string" ? sp.companyId : null} />
      </div>
    </div>
  );
}
