import type { Metadata } from "next";
import Link from "next/link";

import { formatRelative } from "@/lib/format";
import { badgesForDraftStatus, salesPageContext, salesRepos } from "@/lib/sales/page-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sales · Drafts", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "PENDING_REVIEW", label: "Pending review" },
  { key: "DRAFT", label: "Drafts" },
  { key: "APPROVED", label: "Approved" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "REJECTED", label: "Rejected" },
  { key: "", label: "All" },
] as const;

export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await salesPageContext();
  if (!ctx) return null;
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "PENDING_REVIEW";
  const repos = salesRepos();

  const [drafts, contacts, companies] = await Promise.all([
    repos.drafts.list(ctx.workspace.id, { ...(status ? { status } : {}), take: 200 }),
    repos.contacts.list(ctx.workspace.id, { take: 500 }),
    repos.companies.list(ctx.workspace.id, { take: 500 }),
  ]);
  const contactById = new Map(contacts.map((c) => [c.id, c] as const));
  const companyById = new Map(companies.map((c) => [c.id, c] as const));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Outreach drafts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every message — human-written or campaign-generated — passes review before it can be scheduled.
          Nothing auto-sends. Ever.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <Link key={tab.key} href={`/dashboard/sales/drafts${tab.key ? `?status=${tab.key}` : ""}`}
            className={cn("rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
              status === tab.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/40")}>
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Draft</th>
              <th className="px-4 py-3">To</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Scheduled</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {drafts.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nothing here — compose a draft from a contact or let a campaign produce them.
              </td></tr>
            )}
            {drafts.map((d) => {
              const contact = d.contactId ? contactById.get(d.contactId) : undefined;
              const company = d.companyId ? companyById.get(d.companyId) : undefined;
              const badge = badgesForDraftStatus(d.status);
              return (
                <tr key={d.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/sales/drafts/${d.id}`} className="font-medium hover:text-primary">{d.subject || "(no subject)"}</Link>
                    <p className="text-xs text-muted-foreground">{d.channel}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[contact?.name, company?.name].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{badge.label}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{d.scheduledAt ? formatRelative(d.scheduledAt) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatRelative(new Date(d.createdAt))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{drafts.length} draft{drafts.length === 1 ? "" : "s"}</p>
    </div>
  );
}
