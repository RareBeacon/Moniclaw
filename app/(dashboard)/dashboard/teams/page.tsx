import type { Metadata } from "next";
import Link from "next/link";
import { Plus, UsersRound } from "lucide-react";

import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { listTeams } from "@/lib/agents/teams";
import { EmptyState } from "@/components/dashboard/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Agent teams",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  const canManage = can(role, "agents.create");

  const teams = await listTeams(workspace.id);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agent teams</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Named multi-agent crews: one leader plans and delegates, members
            execute, budgets split automatically, and every hop lands in the
            same evidence trail as solo runs.
          </p>
        </div>
        {canManage && (
          <Link href="/dashboard/teams/new" className={cn(buttonVariants(), "shrink-0")}>
            <Plus className="mr-2 h-4 w-4" /> New team
          </Link>
        )}
      </div>

      {teams.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={UsersRound}
            title="No teams yet"
            description="Create a team: pick a leader agent, add members with playbook hints, and run coordinated missions through the same guardrails as your solo workers."
          />
        </div>
      ) : (
        <ul className="mt-8 grid gap-3">
          {teams.map((t) => (
            <li key={t.id}>
              <Link
                href={`/dashboard/teams/${t.id}`}
                className="block rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {t.name}
                      <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{t.slug}</span>
                    </p>
                    {t.description && (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t.description}</p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      leader {t.leader ? t.leader.name : "—"} · {t.members.length} member{t.members.length === 1 ? "" : "s"}
                      {" · "}{t.runCount} run{t.runCount === 1 ? "" : "s"} · created {formatDateTime(t.createdAt)}
                    </p>
                  </div>
                  <span className={cnStatus(t.leader?.status ?? null)}>
                    {t.leader?.status?.toLowerCase() ?? "no leader"}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function cnStatus(status: string | null) {
  const base = "rounded-full px-2 py-0.5 text-[11px] font-medium";
  switch (status) {
    case "AUTONOMOUS":
    case "SUPERVISED":
      return `${base} bg-emerald-500/10 text-emerald-600`;
    case "SHADOW":
      return `${base} bg-blue-500/10 text-blue-600`;
    case "DRAFT":
      return `${base} bg-muted text-muted-foreground`;
    default:
      return `${base} bg-muted text-muted-foreground`;
  }
}
