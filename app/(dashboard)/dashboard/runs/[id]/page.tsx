import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleDot } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { formatCredits, formatDateTime, formatDuration } from "@/lib/format";
import { StatusBadge } from "@/components/dashboard/status-badge";

export const metadata: Metadata = {
  title: "Run detail",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary) return null;

  const run = await db.agentRun.findFirst({
    where: { id, workspaceId: primary.workspace.id },
    include: {
      agent: { select: { name: true, slug: true } },
      events: { orderBy: { ts: "asc" } },
      approvals: {
        orderBy: { createdAt: "asc" },
        include: { decidedBy: { select: { name: true, email: true } } },
      },
    },
  });
  if (!run) notFound();

  const facts = [
    { label: "Status", value: <StatusBadge status={run.status} kind="run" /> },
    { label: "Mode", value: run.mode === "SHADOW" ? "Shadow (dry run)" : "Live" },
    { label: "Trigger", value: run.triggerSource },
    { label: "Credits", value: formatCredits(run.creditsUsed) },
    { label: "Started", value: formatDateTime(run.startedAt ?? run.createdAt) },
    { label: "Duration", value: formatDuration(run.startedAt, run.finishedAt) },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/runs"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All runs
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {run.agent.name}
        </h1>
        <StatusBadge status={run.status} kind="run" />
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">run {run.id}</p>

      {run.error && (
        <p className="mt-5 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {run.error}
        </p>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-xl border bg-card p-4">
            <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
              {fact.label}
            </dt>
            <dd className="mt-1.5 text-sm font-medium">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {run.approvals.length > 0 && (
        <section className="mt-8" aria-label="Approvals in this run">
          <h2 className="text-sm font-semibold">Approvals</h2>
          <ul className="mt-3 space-y-2.5">
            {run.approvals.map((approval) => (
              <li
                key={approval.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-card px-5 py-3.5 text-sm"
              >
                <span className="font-mono text-xs">{approval.actionType}</span>
                {approval.amountUsd != null && (
                  <span className="font-medium">${Number(approval.amountUsd).toFixed(2)}</span>
                )}
                <span
                  className={
                    approval.status === "APPROVED"
                      ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                      : approval.status === "REJECTED"
                        ? "text-xs font-medium text-red-600 dark:text-red-400"
                        : "text-xs font-medium text-amber-600 dark:text-amber-400"
                  }
                >
                  {approval.status.toLowerCase()}
                </span>
                {approval.decidedBy && (
                  <span className="text-xs text-muted-foreground">
                    by {approval.decidedBy.name ?? approval.decidedBy.email}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDateTime(approval.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8" aria-label="Evidence timeline">
        <h2 className="text-sm font-semibold">Evidence timeline</h2>
        {run.events.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed bg-card/50 px-5 py-8 text-center text-sm text-muted-foreground">
            No events recorded yet.
          </p>
        ) : (
          <ol className="relative mt-5 space-y-0 border-l pl-6">
            {run.events.map((event) => (
              <li key={event.id} className="relative pb-6 last:pb-0">
                <CircleDot
                  className="absolute -left-[31px] top-0.5 h-4 w-4 bg-background text-primary"
                  aria-hidden
                />
                <p className="text-sm">{event.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-mono">{event.type}</span> ·{" "}
                  {formatDateTime(event.ts)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
