import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { formatRelative } from "@/lib/format";
import { salesPageContext, salesRepos } from "@/lib/sales/page-data";
import { DeleteSearchButton, SavedSearchControls } from "@/components/dashboard/sales/controls";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sales · Contacts", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const statusTone: Record<string, string> = {
  NEW: "bg-zinc-500/10 text-zinc-500",
  CONTACTED: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  ENGAGED: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  QUALIFIED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  CUSTOMER: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300",
  LOST: "bg-red-500/10 text-red-500",
};

export default async function ContactsPage({
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
    status: typeof sp.status === "string" && sp.status ? sp.status : undefined,
    tags: typeof sp.tags === "string" && sp.tags ? sp.tags.split(",").filter(Boolean) : undefined,
    take: 200,
  } as const;

  const [contacts, searches, companies] = await Promise.all([
    repos.contacts.list(ctx.workspace.id, filters),
    repos.searches.list(ctx.workspace.id, "contacts"),
    repos.companies.list(ctx.workspace.id, { take: 500 }),
  ]);
  const companyNames = new Map(companies.map((c) => [c.id, c.name] as const));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            People you may lawfully reach — public or authorized sources only, with notes on provenance.
          </p>
        </div>
        {ctx.canWrite && (
          <Link href="/dashboard/sales/contacts/new" className={cn(buttonVariants(), "group")}>
            <Plus className="h-4 w-4" aria-hidden /> Add contact
          </Link>
        )}
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
        <input name="q" defaultValue={filters.query} placeholder="Search name, email, title…" className="h-9 min-w-52 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
        <select name="status" defaultValue={filters.status ?? ""} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Any status</option>
          {["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "CUSTOMER", "LOST"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input name="tags" defaultValue={(filters.tags ?? []).join(",")} placeholder="tags,a,b" className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm" />
        <button type="submit" className={cn(buttonVariants({ size: "sm" }))}>Filter</button>
        <Link href="/dashboard/sales/contacts" className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}>Reset</Link>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {ctx.canWrite && <SavedSearchControls entity="contacts" filters={filters} searches={searches} />}
        {searches.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {searches.map((s) => {
              const f = (s.filters ?? {}) as Record<string, unknown>;
              const params = new URLSearchParams();
              if (typeof f.query === "string") params.set("q", f.query);
              if (typeof f.status === "string") params.set("status", f.status);
              if (Array.isArray(f.tags)) params.set("tags", f.tags.join(","));
              return (
                <span key={s.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs">
                  <Link href={`/dashboard/sales/contacts?${params.toString()}`} className="hover:text-primary">{s.name}</Link>
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
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Last touch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {contacts.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">No contacts match.</td></tr>
            )}
            {contacts.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/sales/contacts/${c.id}`} className="font-medium hover:text-primary">{c.name}</Link>
                  <p className="text-xs text-muted-foreground">{[c.title, c.email].filter(Boolean).join(" · ") || "—"}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.companyId ? (companyNames.get(c.companyId) ?? "—") : "—"}</td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", statusTone[c.status])}>{c.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{c.source}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{c.lastTouchedAt ? formatRelative(c.lastTouchedAt) : "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{contacts.length} contact{contacts.length === 1 ? "" : "s"}</p>
    </div>
  );
}
