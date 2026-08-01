import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { formatRelative } from "@/lib/format";
import { salesPageContext, salesRepos } from "@/lib/sales/page-data";
import { DraftEditor } from "@/components/dashboard/sales/controls";
import { SendDraftNowButton } from "@/components/dashboard/sales/email-connections";

export const metadata: Metadata = { title: "Sales · Draft", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DraftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await salesPageContext();
  if (!ctx) return null;
  const { id } = await params;
  const repos = salesRepos();
  const draft = await repos.drafts.get(ctx.workspace.id, id);
  if (!draft) notFound();

  const [contact, company, approval, emailConnections] = await Promise.all([
    draft.contactId ? repos.contacts.get(ctx.workspace.id, draft.contactId) : null,
    draft.companyId ? repos.companies.get(ctx.workspace.id, draft.companyId) : null,
    draft.approvalId ? db.approval.findUnique({ where: { id: draft.approvalId }, include: { decidedBy: { select: { name: true, email: true } } } }) : null,
    db.emailConnection.count({ where: { workspaceId: ctx.workspace.id } }),
  ]);
  const personalization = (draft.personalization ?? {}) as { warnings?: string[]; playbook?: Array<{ title: string }>; campaign?: { name: string } };

  return (
    <div className="mx-auto max-3xl max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{draft.subject || "(no subject)"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {draft.channel} ·{" "}
            {contact && <Link href={`/dashboard/sales/contacts/${contact.id}`} className="text-primary hover:underline">{contact.name}</Link>}
            {contact && company ? " · " : ""}
            {company && <Link href={`/dashboard/sales/companies/${company.id}`} className="text-primary hover:underline">{company.name}</Link>}
            {" · created "}{formatRelative(new Date(draft.createdAt))}
            {personalization.campaign ? ` · via ${personalization.campaign.name}` : ""}
          </p>
        </div>
      </div>

      {(personalization.warnings?.length || personalization.playbook?.length) && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          {personalization.warnings?.map((w, i) => (
            <p key={i} className="text-xs text-amber-600 dark:text-amber-400">⚠ {w}</p>
          ))}
          {personalization.playbook?.map((p, i) => (
            <p key={i} className="text-xs text-muted-foreground">Playbook context applied: {p.title}</p>
          ))}
        </div>
      )}

      {approval && (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="font-medium">Review trail</p>
          <p className="mt-1 text-xs text-muted-foreground">
            approval {approval.status.toLowerCase()}
            {approval.decidedBy ? ` by ${approval.decidedBy.name ?? approval.decidedBy.email}` : ""}
            {approval.decidedAt ? ` · ${formatRelative(approval.decidedAt)}` : ""}
            {approval.note ? ` · “${approval.note}”` : ""}
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-6">
        <DraftEditor
          draft={{
            id: draft.id, status: draft.status, channel: draft.channel,
            subject: draft.subject, body: draft.body,
            scheduledAt: draft.scheduledAt, rejectionNote: draft.rejectionNote,
          }}
          canReview={ctx.canReviewDrafts}
        />
      </div>

      {draft.channel === "EMAIL" && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <p className="text-sm font-semibold">Delivery</p>
          {draft.status === "SENT" ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              ✓ Sent {draft.sentAt ? formatRelative(new Date(draft.sentAt)) : ""}
              {draft.providerMessageId ? ` · provider id ${String(draft.providerMessageId).slice(0, 60)}` : ""}
            </p>
          ) : emailConnections === 0 ? (
            <p className="text-sm text-muted-foreground">
              No email connection yet — approved drafts wait here until you{" "}
              <Link href="/dashboard/sales/settings" className="text-primary hover:underline">
                connect Amazon SES or an SMTP account
              </Link>
              .
            </p>
          ) : (draft.status === "APPROVED" || draft.status === "SCHEDULED" || draft.status === "FAILED") && ctx.canReviewDrafts ? (
            <div className="space-y-2">
              {draft.sendError && (
                <p className="text-xs text-red-600 dark:text-red-400">Last attempt failed: {draft.sendError}</p>
              )}
              <SendDraftNowButton
                draftId={draft.id}
                disabled={draft.status === "APPROVED" && !draft.scheduledAt && false}
              />
              <p className="text-xs text-muted-foreground">
                Sends from your connected identity{draft.scheduledAt ? ` · scheduled ${new Date(draft.scheduledAt).toLocaleString()}` : ""}
                {draft.sendAttempts > 0 ? ` · attempts ${draft.sendAttempts}` : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {draft.status === "SENDING"
                ? "A send is in progress…"
                : draft.status === "PENDING_REVIEW"
                  ? "Pending human review — nothing sends until a manager approves this draft."
                  : `Status ${draft.status.toLowerCase().replace("_", " ")}.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
