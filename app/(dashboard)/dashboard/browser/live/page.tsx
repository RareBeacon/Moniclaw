import type { Metadata } from "next";

import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format";
import { CancelExecutionButton } from "@/components/dashboard/browser/forms";
import { LiveConsole } from "@/components/dashboard/browser/live-console";

export const metadata: Metadata = { title: "Live Execution", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LiveExecutionPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "browser.read")) return <AccessDenied required="Viewer" />;

  const runtime = getBrowserRuntime();
  const [sessions, activeExecutions] = await Promise.all([
    runtime.sessions.list(workspace.id, { status: ["STARTING", "ACTIVE", "IDLE", "RECOVERING"], limit: 20 }),
    runtime.executions.list(workspace.id, { status: ["QUEUED", "PLANNING", "RUNNING", "RETRYING", "AWAITING_APPROVAL", "VALIDATING"], limit: 20 }),
  ]);
  const canExecute = can(role, "browser.execute");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Live Execution</h1>
        <p className="mt-1 text-sm text-muted-foreground">Run actions and plans, watch the stream live (recovery + healing events included).</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Console</CardTitle>
          <CardDescription>Quick actions run inline; plans go through the queue with the full pipeline.</CardDescription>
        </CardHeader>
        <CardContent>
          {canExecute ? (
            <LiveConsole
              sessions={sessions.map((s) => ({ id: s.id, browser: s.browser, kind: s.kind, status: s.status, currentUrl: s.currentUrl }))}
              runningExecutions={activeExecutions.map((x) => ({ id: x.id, sessionId: x.sessionId, status: x.status, stepCount: x.stepCount, goal: x.goal }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Member role required to execute browser actions.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>In flight ({activeExecutions.length})</CardTitle>
          <CardDescription>QUEUED → RUNNING → VALIDATING / AWAITING_APPROVAL states.</CardDescription>
        </CardHeader>
        <CardContent>
          {activeExecutions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing running right now.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Execution</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Steps</th>
                    <th className="py-2 pr-4 font-medium">Goal</th>
                    <th className="py-2 pr-4 font-medium">Started</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {activeExecutions.map((x) => (
                    <tr key={x.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-mono text-xs">{x.id.slice(0, 8)}</td>
                      <td className="py-2.5 pr-4"><Badge variant={x.status === "AWAITING_APPROVAL" ? "outline" : "default"}>{x.status}</Badge></td>
                      <td className="py-2.5 pr-4">{x.stepCount}</td>
                      <td className="max-w-[260px] truncate py-2.5 pr-4 text-muted-foreground">{x.goal ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{x.startedAt ? formatRelative(x.startedAt) : "—"}</td>
                      <td className="py-2.5 text-right">{canExecute ? <CancelExecutionButton executionId={x.id} /> : null}</td>
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
