import type { Metadata } from "next";
import Link from "next/link";

import { formatRelative } from "@/lib/format";
import { salesPageContext, salesRepos } from "@/lib/sales/page-data";
import { CompleteActivityButton } from "@/components/dashboard/sales/controls";
import { ActivityForm, type CompanyOption } from "@/components/dashboard/sales/forms";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sales · Tasks", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function bucketOf(dueAt: Date | null, now: Date): string {
  if (!dueAt) return "Anytime";
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfToday = new Date(startOfToday.getTime() + 86_400_000);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 86_400_000);
  if (dueAt < startOfToday) return "Overdue";
  if (dueAt < endOfToday) return "Today";
  if (dueAt < endOfWeek) return "This week";
  return "Later";
}

export default async function TasksPage() {
  const ctx = await salesPageContext();
  if (!ctx) return null;
  const repos = salesRepos();
  const [activities, contacts, companies] = await Promise.all([
    repos.activities.list(ctx.workspace.id, { openOnly: true, take: 200 }),
    repos.contacts.list(ctx.workspace.id, { take: 500 }),
    repos.companies.list(ctx.workspace.id, { take: 500 }),
  ]);
  const work = activities.filter((a) => ["TASK", "CALL", "REMINDER"].includes(a.type));
  const now = new Date();
  const buckets = ["Overdue", "Today", "This week", "Later", "Anytime"].map((name) => ({
    name,
    items: work
      .filter((a) => bucketOf(a.dueAt, now) === name)
      .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity)),
  }));
  const contactById = new Map(contacts.map((c) => [c.id, c] as const));
  const companyById = new Map(companies.map((c) => [c.id, c] as const));
  const companyOptions: CompanyOption[] = companies.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your call list and follow-ups — campaign TASK steps land here automatically.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {buckets.map(({ name, items }) => (
            <section key={name} className="rounded-2xl border border-border bg-card">
              <header className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                <h2 className="text-sm font-semibold">{name}</h2>
                <span className={cn("rounded-full px-2 py-0.5 text-[0.7rem]",
                  name === "Overdue" && items.length ? "bg-red-500/10 text-red-500" : "bg-muted text-muted-foreground")}>
                  {items.length}
                </span>
              </header>
              <ul className="divide-y divide-border/60">
                {items.length === 0 && <li className="px-5 py-5 text-xs text-muted-foreground">Nothing here.</li>}
                {items.map((a) => {
                  const contact = a.contactId ? contactById.get(a.contactId) : undefined;
                  const company = a.companyId ? companyById.get(a.companyId) : undefined;
                  return (
                    <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="mt-0.5 rounded-md bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">{a.type}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{a.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            contact ? contact.name : undefined,
                            company ? company.name : undefined,
                            a.dueAt ? `due ${formatRelative(a.dueAt)}` : undefined,
                          ].filter(Boolean).join(" · ")}
                        </p>
                        {a.body && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.body}</p>}
                        {(contact || company) && (
                          <p className="mt-0.5">
                            {contact && <Link href={`/dashboard/sales/contacts/${contact.id}`} className="text-xs text-primary hover:underline">open contact</Link>}
                            {contact && company ? " · " : ""}
                            {company && <Link href={`/dashboard/sales/companies/${company.id}`} className="text-xs text-primary hover:underline">open company</Link>}
                          </p>
                        )}
                      </div>
                      {ctx.canWrite && <CompleteActivityButton activityId={a.id} />}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {ctx.canWrite && (
          <aside className="h-fit rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-6">
            <h2 className="mb-4 text-sm font-semibold">Quick add</h2>
            <ActivityForm companies={companyOptions} defaultType="TASK" />
          </aside>
        )}
      </div>
    </div>
  );
}
