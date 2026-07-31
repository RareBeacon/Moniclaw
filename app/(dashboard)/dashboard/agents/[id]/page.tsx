import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/format";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { AgentControls } from "@/components/dashboard/agent-controls";
import {
  DispatchForm,
  WorkerConfigForm,
  type WorkerConfigDefaults,
} from "@/components/dashboard/agents/worker-forms";
import { resolveBudget, resolveToolPolicy, workerTypeSchema } from "@agents/index";

export const metadata: Metadata = {
  title: "Agent detail",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary) return null;

  const agent = await db.agent.findFirst({
    where: { id, workspaceId: primary.workspace.id, deletedAt: null },
    include: {
      runs: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          mode: true,
          triggerSource: true,
          createdAt: true,
          startedAt: true,
          finishedAt: true,
          errorClass: true,
        },
      },
      _count: { select: { runs: true } },
    },
  });
  if (!agent) notFound();

  const budget = resolveBudget(agent.budget);
  const toolPolicy = resolveToolPolicy(agent.toolPolicy);
  const workerType = workerTypeSchema.catch("general").parse(agent.workerType);

  const configDefaults: WorkerConfigDefaults = {
    workerType,
    goal: agent.goal ?? "",
    instructions: agent.instructions ?? "",
    allow: toolPolicy.allow.join(", "),
    deny: toolPolicy.deny.join(", "),
    allowDelegation: toolPolicy.allowDelegation,
    maxSteps: budget.maxSteps,
    maxTokens: budget.maxTokens,
    maxCostUsd: budget.maxCostMicros / 1_000_000,
    maxDurationMinutes: Math.round(budget.maxDurationMs / 60_000),
    maxConcurrentRuns: budget.maxConcurrentRuns,
    maxDepth: budget.maxDepth,
    trigger: agent.trigger,
    schedule: agent.schedule ?? "",
  };

  const dispatchDisabled = agent.status === "DRAFT" || agent.status === "PAUSED";
  const naturalMode = agent.status === "SHADOW" ? "SHADOW" : "LIVE";

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/dashboard/agents"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All agents
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{agent.name}</h1>
            <StatusBadge status={agent.status} kind="agent" />
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
              {workerType} worker
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {agent.description}
          </p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[0.7rem] text-muted-foreground">
            <span>trigger: {agent.trigger.toLowerCase()}</span>
            {agent.trigger === "SCHEDULE" && agent.schedule && (
              <span>cron: {agent.schedule}</span>
            )}
            <span>runs: {agent._count.runs}</span>
            <span>
              last scheduled: {agent.lastScheduledAt ? formatRelative(agent.lastScheduledAt) : "never"}
            </span>
            <span>created {formatDateTime(agent.createdAt)}</span>
          </p>
        </div>
        <AgentControls agentId={agent.id} status={agent.status} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section
          aria-label="Run this worker"
          className="rounded-xl border bg-card p-5"
        >
          <h2 className="text-sm font-semibold">Run this worker</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {dispatchDisabled
              ? agent.status === "DRAFT"
                ? "Promote out of draft (shadow first) to queue runs."
                : "Unpause the agent to queue runs."
              : naturalMode === "SHADOW"
                ? "This agent is in shadow mode — runs dry-run against live data without mutating."
                : "Queue a run now, or refine the objective just this once."}
          </p>
          <div className="mt-4">
            <DispatchForm
              agentId={agent.id}
              defaultMode={naturalMode}
              disabled={dispatchDisabled}
            />
          </div>
        </section>

        <section
          aria-label="Recent runs"
          className="rounded-xl border bg-card p-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent runs</h2>
            <Link
              href="/dashboard/runs"
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              All runs
            </Link>
          </div>
          {agent.runs.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
              No runs yet. Queue one — shadow or live.
            </p>
          ) : (
            <ul className="mt-4 divide-y">
              {agent.runs.map((run) => (
                <li key={run.id}>
                  <Link
                    href={`/dashboard/runs/${run.id}`}
                    className="group flex items-center gap-3 py-2.5 text-sm transition-colors hover:text-primary"
                  >
                    <StatusBadge status={run.status} kind="run" />
                    <span className="text-xs text-muted-foreground">
                      {run.mode === "SHADOW" ? "shadow" : "live"} · {run.triggerSource}
                    </span>
                    <span className="ml-auto font-mono text-[0.7rem] text-muted-foreground">
                      {formatRelative(run.createdAt)}
                    </span>
                    <span className="font-mono text-[0.7rem] text-muted-foreground">
                      {formatDuration(run.startedAt, run.finishedAt)}
                    </span>
                    <ChevronRight
                      className="h-3.5 w-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section
        aria-label="Worker configuration"
        className="mt-6 rounded-xl border bg-card p-5"
      >
        <h2 className="text-sm font-semibold">Worker configuration</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Budgets are enforced mid-run (steps, duration) and at the spend
          boundary (tokens, cost). The tool policy layers onto workspace tool
          permissions — a worker can never exceed what the workspace allows.
        </p>
        <div className="mt-5">
          <WorkerConfigForm agentId={agent.id} defaults={configDefaults} />
        </div>
      </section>
    </div>
  );
}
