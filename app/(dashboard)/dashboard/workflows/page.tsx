import type { Metadata } from "next";

import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Workflow } from "lucide-react";
import { formatDuration, formatRelative } from "@/lib/format";
import {
  DeleteWorkflowButton,
  RunWorkflowPanel,
  WorkflowEditor,
} from "@/components/dashboard/ai/workflow-forms";

export const metadata: Metadata = {
  title: "Workflows",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "ai.workflows.manage")) return <AccessDenied required="Member" />;

  const [defs, recentRuns] = await Promise.all([
    db.workflowDef.findMany({
      where: { workspaceId: workspace.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        runs: {
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { status: true, startedAt: true, finishedAt: true },
        },
        _count: { select: { runs: true } },
      },
    }),
    db.workflowRun.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { startedAt: "desc" },
      take: 8,
      include: { workflow: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Workflow Builder</h1>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Compose prompt, AI, tool, HTTP, condition, loop, and memory nodes into a
        runnable graph. Every execution is traced node-by-node and audit-logged.
      </p>

      <section className="mt-6 rounded-2xl border bg-card p-6" aria-label="New workflow">
        <h2 className="text-sm font-semibold">New workflow</h2>
        <div className="mt-4">
          <WorkflowEditor />
        </div>
      </section>

      <section className="mt-10" aria-label="Saved workflows">
        {defs.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title="No workflows yet"
            description="Create your first graph above — the starter template wires memory recall into an AI briefing step with a single output."
          />
        ) : (
          <ul className="space-y-4">
            {defs.map((def) => {
              const last = def.runs[0];
              return (
                <li key={def.id} className="rounded-2xl border bg-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{def.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        v{def.version} · {def._count.runs} run{def._count.runs === 1 ? "" : "s"}
                        {last
                          ? ` · last ${last.status.toLowerCase()} ${formatRelative(last.startedAt)} (${formatDuration(last.startedAt, last.finishedAt)})`
                          : " · never run"}
                      </p>
                      {def.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{def.description}</p>
                      )}
                    </div>
                    <DeleteWorkflowButton id={def.id} />
                  </div>

                  <details className="mt-4 rounded-xl border bg-muted/30 p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      Run &amp; edit
                    </summary>
                    <div className="mt-4 grid gap-6 lg:grid-cols-2">
                      <RunWorkflowPanel id={def.id} />
                      <WorkflowEditor
                        workflow={{
                          id: def.id,
                          name: def.name,
                          description: def.description,
                          definition: JSON.stringify(def.definition, null, 2),
                        }}
                      />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {recentRuns.length > 0 && (
        <section className="mt-10" aria-label="Recent runs">
          <h2 className="text-sm font-semibold">Recent runs</h2>
          <ul className="mt-3 space-y-2">
            {recentRuns.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3">
                  <RunStatusPill status={run.status} />
                  <span className="font-medium">{run.workflow.name}</span>
                  <span className="text-xs text-muted-foreground">
                    via {run.triggerSource}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {run.error && (
                    <span className="max-w-xs truncate text-red-600">{run.error}</span>
                  )}
                  <span>{formatDuration(run.startedAt, run.finishedAt)}</span>
                  <span>{formatRelative(run.startedAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RunStatusPill({ status }: { status: string }) {
  const tones: Record<string, string> = {
    SUCCEEDED: "bg-emerald-500/10 text-emerald-600",
    FAILED: "bg-red-500/10 text-red-600",
    RUNNING: "bg-amber-500/10 text-amber-600",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status.toLowerCase()}
    </span>
  );
}
