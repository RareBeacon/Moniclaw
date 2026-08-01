import type { Metadata } from "next";
import Link from "next/link";

import { formatRelative } from "@/lib/format";
import { salesPageContext, salesRepos } from "@/lib/sales/page-data";
import { CompleteActivityButton } from "@/components/dashboard/sales/controls";
import { ActivityForm, type CompanyOption } from "@/components/dashboard/sales/forms";

export const metadata: Metadata = { title: "Sales · Meetings", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const ctx = await salesPageContext();
  if (!ctx) return null;
  const repos = salesRepos();
  const [activities, contacts, companies] = await Promise.all([
    repos.activities.list(ctx.workspace.id, { take: 200 }),
    repos.contacts.list(ctx.workspace.id, { take: 500 }),
    repos.companies.list(ctx.workspace.id, { take: 500 }),
  ]);
  const now = new Date();
  const meetings = activities
    .filter((a) => a.type === "MEETING")
    .sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0));
  const upcoming = meetings.filter((a) => !a.completedAt && (!a.dueAt || a.dueAt >= now));
  const past = meetings.filter((a) => a.completedAt || (a.dueAt && a.dueAt < now)).reverse();

  const contactById = new Map(contacts.map((c) => [c.id, c] as const));
  const companyById = new Map(companies.map((c) => [c.id, c] as const));
  const companyOptions: CompanyOption[] = companies.map((c) => ({ id: c.id, name: c.name }));

  const list = (items: typeof meetings) => (
    <ul className="divide-y divide-border/60">
      {items.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">Nothing scheduled.</li>}
      {items.map((a) => {
        const contact = a.contactId ? contactById.get(a.contactId) : undefined;
        const company = a.companyId ? companyById.get(a.companyId) : undefined;
        return (
          <li key={a.id} className="flex items-start gap-3 px-5 py-3.5">
            <div className="min-w-9 text-center">
              <p className="text-lg font-semibold tabular-nums leading-5">
                {a.dueAt ? a.dueAt.getUTCDate() : "—"}
              </p>
              <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">
                {a.dueAt ? a.dueAt.toLocaleString("en", { month: "short", timeZone: "UTC" }) : ""}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{a.subject}</p>
              <p className="text-xs text-muted-foreground">
                {[
                  a.dueAt ? a.dueAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC" : undefined,
                  contact ? contact.name : undefined,
                  company ? company.name : undefined,
                ].filter(Boolean).join(" · ")}
              </p>
              {a.body && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.body}</p>}
            </div>
            {!a.completedAt && ctx.canWrite && <CompleteActivityButton activityId={a.id} />}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Booked conversations. Times are stored in UTC; your calendar invites handle local display.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-border bg-card">
            <header className="border-b border-border/60 px-5 py-3.5">
              <h2 className="text-sm font-semibold">Upcoming ({upcoming.length})</h2>
            </header>
            {list(upcoming)}
          </section>
          <section className="rounded-2xl border border-border bg-card">
            <header className="border-b border-border/60 px-5 py-3.5">
              <h2 className="text-sm font-semibold">Past</h2>
            </header>
            {list(past.slice(0, 20))}
          </section>
        </div>

        {ctx.canWrite && (
          <aside className="h-fit rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-6">
            <h2 className="mb-4 text-sm font-semibold">Log a meeting</h2>
            <ActivityForm companies={companyOptions} defaultType="MEETING" />
          </aside>
        )}
      </div>
    </div>
  );
}
