import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { formatRelative } from "@/lib/format";
import { badgesForDraftStatus, salesPageContext, salesRepos } from "@/lib/sales/page-data";
import { CampaignStatusControls, EnrollmentControls, EnrollForm } from "@/components/dashboard/sales/controls";
import { CampaignStepsEditor, type StepDraft } from "@/components/dashboard/sales/forms";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sales · Campaign", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const enrollTone: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  PAUSED: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  COMPLETED: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  UNSUBSCRIBED: "bg-red-500/10 text-red-500",
  BOUNCED: "bg-red-500/10 text-red-500",
};

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await salesPageContext();
  if (!ctx) return null;
  const { id } = await params;
  const repos = salesRepos();
  const campaign = await repos.campaigns.get(ctx.workspace.id, id);
  if (!campaign) notFound();

  const [steps, enrollments, contacts, companies] = await Promise.all([
    repos.campaigns.listSteps(id),
    repos.campaigns.listEnrollments(id, {}),
    repos.contacts.list(ctx.workspace.id, { take: 500 }),
    repos.companies.list(ctx.workspace.id, { take: 500 }),
  ]);
  const enrolledIds = new Set(enrollments.map((e) => e.contactId));
  const enrollable = contacts.filter((c) => !enrolledIds.has(c.id));
  const contactById = new Map(contacts.map((c) => [c.id, c] as const));
  const companyById = new Map(companies.map((c) => [c.id, c.name] as const));

  const drafts = await db.salesDraft.findMany({
    where: { workspaceId: ctx.workspace.id, campaignEnrollmentId: { in: enrollments.map((e) => e.id) }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const stepDrafts: StepDraft[] = steps.map((s) => ({
    kind: s.kind as StepDraft["kind"],
    subject: s.subject ?? "",
    bodyTemplate: s.bodyTemplate ?? "",
    delayValue: s.delayValue,
    delayUnit: s.delayUnit as "HOURS" | "DAYS",
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {campaign.goal ?? "Sequence"} · status {campaign.status.toLowerCase()} · cap {campaign.dailyCap} drafts/day
            {campaign.knowledgeContext ? ` · playbook “${campaign.knowledgeContext}”` : ""}
          </p>
        </div>
        {ctx.canManageCampaigns && <CampaignStatusControls campaignId={campaign.id} status={campaign.status} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card">
          <header className="border-b border-border/60 px-5 py-3.5">
            <h2 className="text-sm font-semibold">Sequence ({steps.length} steps)</h2>
          </header>
          <ol className="divide-y divide-border/60">
            {steps.map((s) => (
              <li key={s.id} className="px-5 py-3">
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">{s.kind}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{s.subject || (s.kind === "WAIT" ? "Wait" : "(no subject)")}</span>
                  <span className="text-xs text-muted-foreground">+{s.delayValue} {s.delayUnit.toLowerCase()}</span>
                </div>
                {s.bodyTemplate && (
                  <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{s.bodyTemplate}</p>
                )}
              </li>
            ))}
          </ol>
          {ctx.canManageCampaigns && campaign.status !== "ACTIVE" && (
            <div className="border-t border-border/60 p-5">
              <h3 className="mb-3 text-sm font-semibold">Edit sequence</h3>
              <CampaignStepsEditor campaignId={campaign.id} initial={stepDrafts} />
            </div>
          )}
          {campaign.status === "ACTIVE" && (
            <p className="border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">Pause the campaign to edit its steps.</p>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card">
            <header className="border-b border-border/60 px-5 py-3.5">
              <h2 className="text-sm font-semibold">Enrollments ({enrollments.length})</h2>
            </header>
            <ul className="divide-y divide-border/60">
              {enrollments.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">Nobody enrolled yet.</li>}
              {enrollments.map((e) => {
                const contact = contactById.get(e.contactId);
                return (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {contact ? (
                          <Link href={`/dashboard/sales/contacts/${contact.id}`} className="hover:text-primary">{contact.name}</Link>
                        ) : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {e.companyId ? (companyById.get(e.companyId) ?? "") : ""}
                        {e.nextRunAt && e.status === "ACTIVE" ? ` · next step ${formatRelative(e.nextRunAt)}` : ""}
                        {e.currentStep >= 0 ? ` · step ${e.currentStep + 1}` : ""}
                      </p>
                    </div>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", enrollTone[e.status] ?? enrollTone.ACTIVE)}>{e.status.toLowerCase()}</span>
                    {ctx.canManageCampaigns && (
                      <EnrollmentControls campaignId={campaign.id} enrollmentId={e.id} status={e.status} />
                    )}
                  </li>
                );
              })}
            </ul>
            {ctx.canManageCampaigns && (
              <div className="border-t border-border/60 p-5">
                <h3 className="mb-3 text-sm font-semibold">Enroll contacts</h3>
                <EnrollForm campaignId={campaign.id} contacts={enrollable.map((c) => ({ id: c.id, name: c.name, status: c.status, companyId: c.companyId }))} />
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card">
            <header className="border-b border-border/60 px-5 py-3.5">
              <h2 className="text-sm font-semibold">Drafts produced ({drafts.length})</h2>
            </header>
            {drafts.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">The daily tick renders personalized drafts here once enrollments are due.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {drafts.map((d) => {
                  const badge = badgesForDraftStatus(d.status);
                  return (
                    <li key={d.id}>
                      <Link href={`/dashboard/sales/drafts/${d.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{d.subject || "(no subject)"}</p>
                          <p className="text-xs text-muted-foreground">{formatRelative(d.createdAt)}</p>
                        </div>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] text-muted-foreground">{badge.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
