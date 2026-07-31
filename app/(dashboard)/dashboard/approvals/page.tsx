import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { formatRelative } from "@/lib/format";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ApprovalActions } from "@/components/dashboard/approval-actions";

export const metadata: Metadata = {
  title: "Approvals",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary) return null;

  const approvals = await db.approval.findMany({
    where: { run: { workspaceId: primary.workspace.id } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 50,
    include: {
      run: { include: { agent: { select: { name: true } } } },
      decidedBy: { select: { name: true, email: true } },
    },
  });

  const pending = approvals.filter((a) => a.status === "PENDING");
  const decided = approvals.filter((a) => a.status !== "PENDING");

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        When an agent crosses a policy threshold, it stops here and waits for a
        named human — with the full context attached.
      </p>

      {approvals.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={ShieldCheck}
            title="Nothing awaiting approval"
            description="When agents hit a threshold — spend, vendor changes, sensitive sends — requests land here with evidence and one-click decisions."
          />
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {pending.length > 0 && (
            <section aria-label="Pending approvals">
              <h2 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                Pending · {pending.length}
              </h2>
              <ul className="mt-3 space-y-3">
                {pending.map((approval) => (
                  <li
                    key={approval.id}
                    className="flex flex-col gap-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {approval.run ? approval.run.agent.name : "AI planner"} wants to{" "}
                        <span className="font-mono text-sm">{approval.actionType}</span>
                        {approval.amountUsd != null && (
                          <span className="font-semibold">
                            {" "}
                            · ${Number(approval.amountUsd).toFixed(2)}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        requested {formatRelative(approval.createdAt)} · policy
                        routed to {approval.requestedTo}
                      </p>
                    </div>
                    <ApprovalActions approvalId={approval.id} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {decided.length > 0 && (
            <section aria-label="Decision history">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Decision history
              </h2>
              <ul className="mt-3 divide-y rounded-xl border bg-card">
                {decided.map((approval) => (
                  <li
                    key={approval.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-sm"
                  >
                    <span className="font-mono text-xs">{approval.actionType}</span>
                    <span
                      className={
                        approval.status === "APPROVED"
                          ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                          : "text-xs font-medium text-red-600 dark:text-red-400"
                      }
                    >
                      {approval.status.toLowerCase()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      by {approval.decidedBy?.name ?? approval.decidedBy?.email ?? "—"}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {approval.decidedAt ? formatRelative(approval.decidedAt) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
