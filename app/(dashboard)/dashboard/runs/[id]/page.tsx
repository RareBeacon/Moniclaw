import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleDot } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { formatCredits, formatDateTime, formatDuration } from "@/lib/format";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { RunControlButtons } from "@/components/dashboard/agents/worker-forms";
import { runOutputSchema } from "@agents/index";

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

  const parsedOutput = runOutputSchema.safeParse(run.output ?? {});
  const output = parsedOutput.success ? parsedOutput.data : null;

  const facts = [
    { label: "Status", value: <StatusBadge status={run.status} kind="run" /> },
    { label: "Mode", value: run.mode === "SHADOW" ? "Shadow (dry run)" : "Live" },
    { label: "Trigger", value: run.triggerSource },
    { label: "Credits", value: formatCredits(run.creditsUsed) },
    { label: "Tokens", value: formatCredits(run.tokensUsed) },
    { label: "Steps", value: formatCredits(run.stepsExecuted) },
    { label: "Depth", value: run.depth === 0 ? "root" : `delegated · d${run.depth}` },
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

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            <Link
              href={`/dashboard/agents/${run.agentId}`}
              className="transition-colors hover:text-primary"
            >
              {run.agent.name}
            </Link>
          </h1>
          <StatusBadge status={run.status} kind="run" />
        </div>
        <RunControlButtons runId={run.id} status={run.status} />
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">run {run.id}</p>

      {run.error && (
        <p className="mt-5 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {run.errorClass && (
            <span className="mr-2 font-mono text-xs font-semibold uppercase">
              [{run.errorClass}]
            </span>
          )}
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

      {output && (output.report || output.reflection || output.steps?.length || output.delegatedRuns?.length) && (
        <section className="mt-8" aria-label="Worker output">
          <h2 className="text-sm font-semibold">Worker output</h2>

          {output.report && (
            <article className="mt-4 rounded-xl border bg-card p-5">
              <h3 className="text-base font-semibold tracking-tight">
                {output.report.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {output.report.summary}
              </p>
              <pre className="mt-4 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg bg-secondary/40 p-4 font-sans text-sm leading-6">
                {output.report.markdown}
              </pre>
              {output.report.citations.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Sources
                  </h4>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
                    {output.report.citations.map((citation, index) => (
                      <li key={`${citation.url}-${index}`}>
                        <a
                          href={citation.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {citation.title || citation.url}
                        </a>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </article>
          )}

          {output.reflection && (
            <div className="mt-4 rounded-xl border bg-card p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Planner reflection
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                {output.reflection}
              </p>
            </div>
          )}

          {output.steps && output.steps.length > 0 && (
            <div className="mt-4 rounded-xl border bg-card p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Steps ({output.steps.length})
              </h3>
              <ol className="mt-3 space-y-2">
                {output.steps.map((step, index) => (
                  <li
                    key={index}
                    className="flex items-baseline gap-3 text-sm leading-6"
                  >
                    <span
                      className={
                        step.status === "succeeded"
                          ? "font-mono text-[0.65rem] font-semibold uppercase text-emerald-600 dark:text-emerald-400"
                          : step.status === "failed"
                            ? "font-mono text-[0.65rem] font-semibold uppercase text-red-600 dark:text-red-400"
                            : "font-mono text-[0.65rem] font-semibold uppercase text-zinc-500"
                      }
                    >
                      {step.status === "awaiting_approval" ? "parked" : step.status}
                    </span>
                    <span className="min-w-0">
                      {step.description}
                      {step.tool && (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          [{step.tool}]
                        </span>
                      )}
                      {step.error && (
                        <span className="ml-2 text-xs text-red-600 dark:text-red-400">
                          {step.error}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {output.delegatedRuns && output.delegatedRuns.length > 0 && (
            <div className="mt-4 rounded-xl border bg-card p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Delegated runs ({output.delegatedRuns.length})
              </h3>
              <ul className="mt-3 space-y-2 text-sm">
                {output.delegatedRuns.map((child) => (
                  <li key={child.runId} className="flex flex-wrap items-baseline gap-3">
                    <Link
                      href={`/dashboard/runs/${child.runId}`}
                      className="font-mono text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {child.runId.slice(0, 10)}…
                    </Link>
                    <StatusBadge status={child.status} kind="run" />
                    {child.summary && (
                      <span className="text-xs text-muted-foreground">{child.summary}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
