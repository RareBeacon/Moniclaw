import type { Metadata } from "next";
import Link from "next/link";

import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format";
import { CancelExecutionButton, ResumeExecutionButton } from "@/components/dashboard/browser/forms";

export const metadata: Metadata = { title: "Execution History", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const TONE: Record<string, "default" | "secondary" | "accent" | "outline"> = {
  SUCCEEDED: "secondary", FAILED: "accent", CANCELLED: "outline",
  RUNNING: "default", RETRYING: "default", AWAITING_APPROVAL: "outline", QUEUED: "outline",
};

export default async function ExecutionHistoryPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "browser.read")) return <AccessDenied required="Viewer" />;

  const runtime = getBrowserRuntime();
  const executions = await runtime.executions.list(workspace.id, { limit: 100 });
  const canExecute = can(role, "browser.execute");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Execution History</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every queued/inline run with its outcome, failure step and replay link.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Executions ({executions.length})</CardTitle>
          <CardDescription>Latest 100. Parked executions resume after their approval is granted.</CardDescription>
        </CardHeader>
        <CardContent>
          {executions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No executions yet — run a plan from Live Execution.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Execution</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Steps</th>
                    <th className="py-2 pr-4 font-medium">Error</th>
                    <th className="py-2 pr-4 font-medium">Runtime</th>
                    <th className="py-2 pr-4 font-medium">Created</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {executions.map((x) => (
                    <tr key={x.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-mono text-xs">
                        <Link href={`/dashboard/browser/recordings/${x.id}`} className="underline decoration-dotted hover:text-primary" title="Open replay">
                          {x.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4"><Badge variant={TONE[x.status] ?? "outline"}>{x.status}</Badge></td>
                      <td className="py-2.5 pr-4">{x.stepCount}{x.failedStep ? ` (failed #${x.failedStep})` : ""}</td>
                      <td className="max-w-[240px] truncate py-2.5 pr-4 text-muted-foreground" title={x.error ?? ""}>{x.error ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">
                        {x.startedAt && x.finishedAt ? `${((x.finishedAt.getTime() - x.startedAt.getTime()) / 1000).toFixed(1)}s` : "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{formatRelative(x.createdAt)}</td>
                      <td className="py-2.5 text-right">
                        {canExecute && ["RUNNING", "RETRYING", "QUEUED"].includes(x.status) ? <CancelExecutionButton executionId={x.id} /> : null}
                        {canExecute && x.status === "AWAITING_APPROVAL" ? <ResumeExecutionButton executionId={x.id} /> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
