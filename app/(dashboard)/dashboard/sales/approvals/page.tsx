import type { Metadata } from "next";
import Link from "next/link";

import { db } from "@/lib/db";
import { formatRelative } from "@/lib/format";
import { salesPageContext } from "@/lib/sales/page-data";
import { ApprovalActions } from "@/components/dashboard/approval-actions";

export const metadata: Metadata = { title: "Sales · Approvals", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SalesApprovalsPage() {
  const ctx = await salesPageContext();
  if (!ctx) return null;

  const approvals = await db.approval.findMany({
    where: { workspaceId: ctx.workspace.id, actionType: { startsWith: "sales." } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: { decidedBy: { select: { name: true, email: true } } },
  });
  const pending = approvals.filter((a) => a.status === "PENDING");
  const decided = approvals.filter((a) => a.status !== "PENDING");

  const rows = (list: typeof approvals, showActions: boolean) => (
    <ul className="divide-y divide-border/60">
      {list.length === 0 && <li className="px-5 py-8 text-sm text-muted-foreground">Nothing here.</li>}
      {list.map((a) => {
        const detail = (a.detail ?? {}) as { draftId?: string; contactLabel?: string; subject?: string | null; channel?: string; body?: string };
        return (
          <li key={a.id} className="flex items-start gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{detail.subject || "(no subject)"}</p>
                {detail.channel && <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] text-muted-foreground">{detail.channel}</span>}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {detail.contactLabel ?? "—"} · requested {formatRelative(a.createdAt)}
                {a.decidedBy ? ` · decided by ${a.decidedBy.name ?? a.decidedBy.email}` : ""}
                {a.note ? ` · “${a.note}”` : ""}
              </p>
              {detail.body && <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{detail.body}</p>}
              {detail.draftId && (
                <Link href={`/dashboard/sales/drafts/${detail.draftId}`} className="mt-1 inline-block text-xs text-primary hover:underline">
                  Open the draft →
                </Link>
              )}
            </div>
            {showActions && ctx.canReviewDrafts && <ApprovalActions approvalId={a.id} />}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Draft reviews waiting on a manager. Approving here updates the draft atomically —
          the same decision is mirrored in the platform-wide{" "}
          <Link href="/dashboard/approvals" className="text-primary hover:underline">approvals inbox</Link>.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card">
        <header className="border-b border-border/60 px-5 py-3.5">
          <h2 className="text-sm font-semibold">Pending ({pending.length})</h2>
        </header>
        {rows(pending, true)}
      </section>

      <section className="rounded-2xl border border-border bg-card">
        <header className="border-b border-border/60 px-5 py-3.5">
          <h2 className="text-sm font-semibold">Recently decided</h2>
        </header>
        {rows(decided, false)}
      </section>
    </div>
  );
}
