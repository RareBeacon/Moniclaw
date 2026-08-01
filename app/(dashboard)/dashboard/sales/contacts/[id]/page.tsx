import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatRelative } from "@/lib/format";
import { badgesForDraftStatus, salesPageContext, salesRepos } from "@/lib/sales/page-data";
import { CompleteActivityButton, DeleteEntityButton, QualifyContactButton } from "@/components/dashboard/sales/controls";
import { ActivityForm, ContactForm, DraftComposeForm } from "@/components/dashboard/sales/forms";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sales · Contact", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await salesPageContext();
  if (!ctx) return null;
  const { id } = await params;
  const repos = salesRepos();
  const contact = await repos.contacts.get(ctx.workspace.id, id);
  if (!contact) notFound();

  const [company, activities, drafts, companies] = await Promise.all([
    contact.companyId ? repos.companies.get(ctx.workspace.id, contact.companyId) : null,
    repos.activities.list(ctx.workspace.id, { contactId: id, take: 30 }),
    repos.drafts.list(ctx.workspace.id, { contactId: id, take: 10 }),
    repos.companies.list(ctx.workspace.id, { take: 500 }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{contact.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[contact.title, company?.name].filter(Boolean).join(" at ") || "Independent contact"}
            {contact.email ? ` · ${contact.email}` : ""}
          </p>
          {contact.linkedinUrl && (
            <a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">LinkedIn profile</a>
          )}
        </div>
        <div className="flex items-center gap-2">
          {ctx.canWrite && <QualifyContactButton contactId={contact.id} status={contact.status} />}
          {ctx.canWrite && <DeleteEntityButton kind="contact" id={contact.id} redirectTo="/dashboard/sales/contacts" />}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ["Status", contact.status],
            ["Source", contact.source],
            ["Last touch", contact.lastTouchedAt ? formatRelative(contact.lastTouchedAt) : "never"],
            ["Company", company?.name ?? "—"],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>
      {contact.notes && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Notes</h2>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{contact.notes}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card">
          <header className="border-b border-border/60 px-5 py-3.5">
            <h2 className="text-sm font-semibold">Timeline</h2>
          </header>
          <ul className="divide-y divide-border/60">
            {activities.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">Nothing logged yet.</li>}
            {activities.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 rounded-md bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">{a.type}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.completedAt ? `completed ${formatRelative(a.completedAt)}` : a.dueAt ? `due ${formatRelative(a.dueAt)}` : formatRelative(new Date(a.createdAt))}
                  </p>
                </div>
                {!a.completedAt && a.type !== "NOTE" && ctx.canWrite && <CompleteActivityButton activityId={a.id} />}
              </li>
            ))}
          </ul>
          <div className="border-t border-border/60 p-5">
            {ctx.canWrite && <ActivityForm companyId={contact.companyId} contactId={contact.id} />}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card">
            <header className="border-b border-border/60 px-5 py-3.5">
              <h2 className="text-sm font-semibold">Drafts ({drafts.length})</h2>
            </header>
            {drafts.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No drafts yet — compose one or enroll in a campaign.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {drafts.map((d) => {
                  const badge = badgesForDraftStatus(d.status);
                  return (
                    <li key={d.id}>
                      <Link href={`/dashboard/sales/drafts/${d.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{d.subject || "(no subject)"}</p>
                          <p className="text-xs text-muted-foreground">{d.channel} · {formatRelative(new Date(d.createdAt))}</p>
                        </div>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] text-muted-foreground">{badge.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {ctx.canWrite && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold mb-4">New outreach draft</h2>
              <DraftComposeForm companyId={contact.companyId} contactId={contact.id} />
            </section>
          )}
          {ctx.canWrite && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold mb-4">Edit contact</h2>
              <ContactForm
                companies={companies.map((c) => ({ id: c.id, name: c.name }))}
                contact={{
                  id: contact.id, name: contact.name, companyId: contact.companyId,
                  title: contact.title, email: contact.email, linkedinUrl: contact.linkedinUrl,
                  phone: contact.phone, notes: contact.notes,
                }}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
