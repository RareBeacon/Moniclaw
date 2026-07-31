import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Plus } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { formatRelative } from "@/lib/format";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { AgentControls } from "@/components/dashboard/agent-controls";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Agents",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary) return null;

  const agents = await db.agent.findMany({
    where: { workspaceId: primary.workspace.id, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
    include: {
      runs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, status: true },
      },
      _count: { select: { runs: true } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your AI staff. Every agent starts as a draft and earns autonomy
            through shadow runs and supervision.
          </p>
        </div>
        <Link href="/dashboard/agents/new" className={cn(buttonVariants(), "group")}>
          <Plus className="h-4 w-4" aria-hidden />
          New agent
        </Link>
      </div>

      {agents.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Bot}
            title="No agents yet"
            description="Create your first agent with a plain-language job description. It starts as a draft; nothing runs until you say so."
            cta="Create your first agent"
            href="/dashboard/agents/new"
          />
        </div>
      ) : (
        <ul className="mt-8 grid gap-4">
          {agents.map((agent) => {
            const lastRun = agent.runs[0];
            const policy = agent.policy as { budgets?: { dailyUsd?: number } };
            return (
              <li
                key={agent.id}
                className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:gap-6"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-semibold">{agent.name}</h2>
                    <StatusBadge status={agent.status} kind="agent" />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {agent.description}
                  </p>
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[0.7rem] text-muted-foreground">
                    <span>trigger: {agent.trigger.toLowerCase()}</span>
                    <span>runs: {agent._count.runs}</span>
                    <span>budget: ${policy?.budgets?.dailyUsd ?? 25}/day</span>
                    <span>
                      last run: {lastRun ? formatRelative(lastRun.createdAt) : "never"}
                    </span>
                  </p>
                </div>
                <AgentControls agentId={agent.id} status={agent.status} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
