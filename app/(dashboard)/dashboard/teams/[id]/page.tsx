import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { resolveToolPolicy } from "@agents/index";

import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { getTeam } from "@/lib/agents/teams";
import { formatDateTime } from "@/lib/format";
import {
  DeleteTeamButton,
  TeamRosterForm,
  TeamRunForm,
} from "@/components/dashboard/agents/team-forms";

export const metadata: Metadata = {
  title: "Team",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;

  const team = await getTeam(workspace.id, id).catch(() => null);
  if (!team) notFound();

  const [agents, recentRuns] = await Promise.all([
    db.agent.findMany({
      where: { workspaceId: workspace.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, slug: true, status: true, workerType: true, description: true },
    }),
    db.agentRun.findMany({
      where: { workspaceId: workspace.id, teamId: team.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, status: true, mode: true, createdAt: true, finishedAt: true, errorClass: true },
    }),
  ]);

  const budget = (team.budget ?? {}) as { maxSteps?: number; maxTokens?: number; maxDepth?: number };
  const delegationReady = team.leader
    ? resolveToolPolicy(team.leader.toolPolicy).allowDelegation === true
    : false;
  const canManage = can(role, "agents.create");
  const canRun = can(role, "agents.run");

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/dashboard/teams"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All teams
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
          {team.description && (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{team.description}</p>
          )}
          <p className="mt-2 font-mono text-[0.7rem] text-muted-foreground">
            {team.slug} · leader {team.leader?.name ?? "—"} · {team.members.length} member{team.members.length === 1 ? "" : "s"}
          </p>
        </div>
        {canManage && <DeleteTeamButton teamId={team.id} name={team.name} />}
      </div>

      {canRun && (
        <section className="mt-8 rounded-2xl border bg-card p-6" aria-label="Run this team">
          <h2 className="text-sm font-semibold">Run this team</h2>
          <div className="mt-4">
            <TeamRunForm teamId={team.id} delegationReady={delegationReady} />
          </div>
        </section>
      )}

      <section className="mt-8 rounded-2xl border bg-card p-6" aria-label="Roster and settings">
        <h2 className="text-sm font-semibold">Roster & settings</h2>
        <div className="mt-4">
          {canManage ? (
            <TeamRosterForm
              agents={agents}
              teamId={team.id}
              initial={{
                name: team.name,
                description: team.description,
                leaderAgentId: team.leaderAgentId,
                members: team.members.map((m) => ({ agentId: m.agentId, promptHint: m.promptHint })),
                budget: {
                  ...(budget.maxSteps ? { maxSteps: budget.maxSteps } : {}),
                  ...(budget.maxTokens ? { maxTokens: budget.maxTokens } : {}),
                  ...(budget.maxDepth ? { maxDepth: budget.maxDepth } : {}),
                },
              }}
            />
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              <li><span className="font-medium">Leader:</span> {team.leader?.name ?? "—"}</li>
              {team.members.map((m) => (
                <li key={m.agentId}>
                  <span className="font-medium">{m.agent.name}</span>
                  {m.promptHint ? <span className="text-muted-foreground"> — {m.promptHint}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border bg-card p-6" aria-label="Recent team runs">
        <h2 className="text-sm font-semibold">Recent team runs</h2>
        {recentRuns.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No runs yet — give the team an objective above.</p>
        ) : (
          <ul className="mt-3 divide-y">
            {recentRuns.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <Link href={`/dashboard/runs/${r.id}`} className="font-medium underline-offset-2 hover:underline">
                  {r.id.slice(0, 8)}…
                </Link>
                <span className="text-xs text-muted-foreground">{r.mode.toLowerCase()}</span>
                <RunStatusChip status={r.status} errorClass={r.errorClass} />
                <span className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RunStatusChip({ status, errorClass }: { status: string; errorClass: string | null }) {
  const map: Record<string, string> = {
    SUCCEEDED: "bg-emerald-500/10 text-emerald-600",
    FAILED: "bg-destructive/10 text-destructive",
    RUNNING: "bg-blue-500/10 text-blue-600",
    QUEUED: "bg-blue-500/10 text-blue-600",
    NEEDS_APPROVAL: "bg-amber-500/10 text-amber-600",
    CANCELED: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}
      title={errorClass ?? undefined}
    >
      {status.toLowerCase().replace("_", " ")}
    </span>
  );
}
