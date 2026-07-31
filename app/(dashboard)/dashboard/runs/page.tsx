import type { Metadata } from "next";
import { History } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { formatCredits, formatDateTime, formatDuration } from "@/lib/format";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata: Metadata = {
  title: "Runs",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary) return null;

  const runs = await db.agentRun.findMany({
    where: { workspaceId: primary.workspace.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { agent: { select: { name: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every execution, recorded. Replay and evidence export arrive with the
        runtime plane; the ledger is already permanent.
      </p>

      {runs.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={History}
            title="No runs yet"
            description="Queue a run from the Agents page — shadow or live. Each run gets a full evidence trail from its first action."
            cta="Go to agents"
            href="/dashboard/agents"
          />
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th scope="col" className="px-5 py-3.5 font-medium">Agent</th>
                <th scope="col" className="px-4 py-3.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-3.5 font-medium">Mode</th>
                <th scope="col" className="px-4 py-3.5 font-medium">Trigger</th>
                <th scope="col" className="px-4 py-3.5 font-medium">Credits</th>
                <th scope="col" className="px-4 py-3.5 font-medium">Started</th>
                <th scope="col" className="px-4 py-3.5 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {runs.map((run) => (
                <tr key={run.id}>
                  <th scope="row" className="px-5 py-3.5 font-medium">
                    {run.agent.name}
                    <span className="mt-0.5 block font-mono text-[0.65rem] font-normal text-muted-foreground">
                      {run.id.slice(0, 10)}…
                    </span>
                  </th>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={run.status} kind="run" />
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">
                    {run.mode === "SHADOW" ? "Shadow" : "Live"}
                  </td>
                  <td className="px-4 py-3.5 text-xs capitalize text-muted-foreground">
                    {run.triggerSource}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">
                    {formatCredits(run.creditsUsed)}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">
                    {formatDateTime(run.startedAt ?? run.createdAt)}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">
                    {formatDuration(run.startedAt, run.finishedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
