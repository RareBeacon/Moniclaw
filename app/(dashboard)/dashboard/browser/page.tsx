import type { Metadata } from "next";

import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format";
import { CloseSessionButton, CreateProfileForm, CreateSessionForm, DeleteProfileButton } from "@/components/dashboard/browser/forms";

export const metadata: Metadata = { title: "Browser Sessions", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "default" | "secondary" | "accent" | "outline"> = {
  ACTIVE: "default", IDLE: "secondary", STARTING: "secondary", RECOVERING: "outline",
  CLOSED: "outline", TIMEOUT: "outline", ERROR: "accent",
};

export default async function BrowserSessionsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "browser.read")) return <AccessDenied required="Viewer" />;

  const runtime = getBrowserRuntime();
  const [sessions, profiles, settings] = await Promise.all([
    runtime.sessions.list(workspace.id, { limit: 50 }),
    runtime.profiles.list(workspace.id),
    runtime.repos.settings.getSettings(workspace.id),
  ]);
  const health = { pool: runtime.pool.stats(), queue: runtime.queue.stats(), remote: Boolean(process.env.BROWSER_WS_ENDPOINT) };
  const canExecute = can(role, "browser.execute");
  const canProfiles = can(role, "browser.profiles.manage");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Browser Sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Isolated, policy-enforced browser contexts. Engine: {health.remote ? "remote worker" : "local pool"} · {health.pool.processes}/{settings.maxConcurrentSessions} processes · queue {health.queue.running} running / {health.queue.queued} queued.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Launch a session</CardTitle>
          <CardDescription>Ephemeral for one-off work, persistent for logged-in reuse, incognito for zero retention.</CardDescription>
        </CardHeader>
        <CardContent>
          {canExecute ? <CreateSessionForm profiles={profiles.map((p) => ({ id: p.id, name: p.name }))} /> : <p className="text-sm text-muted-foreground">Member role required to launch sessions.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions ({sessions.length})</CardTitle>
          <CardDescription>Idle sessions are reaped automatically after {settings.sessionIdleTimeoutSec}s.</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Session</th>
                    <th className="py-2 pr-4 font-medium">Browser</th>
                    <th className="py-2 pr-4 font-medium">Kind</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Current page</th>
                    <th className="py-2 pr-4 font-medium">Tabs</th>
                    <th className="py-2 pr-4 font-medium">Created</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-mono text-xs">{s.id.slice(0, 8)}{runtime.sessions.isLive(s.id) ? <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" title="Live process" /> : null}</td>
                      <td className="py-2.5 pr-4">{s.browser} · {s.mode === "HEADLESS" ? "headless" : "headed"}</td>
                      <td className="py-2.5 pr-4"><Badge variant="secondary">{s.kind}</Badge></td>
                      <td className="py-2.5 pr-4"><Badge variant={STATUS_TONE[s.status] ?? "outline"}>{s.status}</Badge></td>
                      <td className="max-w-[220px] truncate py-2.5 pr-4 text-muted-foreground" title={s.currentTitle ?? s.currentUrl ?? ""}>{s.currentTitle ?? s.currentUrl ?? "—"}</td>
                      <td className="py-2.5 pr-4">{s.tabCount}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{formatRelative(s.createdAt)}</td>
                      <td className="py-2.5 text-right">{canExecute && !["CLOSED", "TIMEOUT"].includes(s.status) ? <CloseSessionButton sessionId={s.id} /> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profiles ({profiles.length})</CardTitle>
          <CardDescription>Reusable identities — cookies + web storage encrypted at rest (AES-256-GCM).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {profiles.length > 0 ? (
            <div className="grid gap-2">
              {profiles.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 text-muted-foreground">{p.browser}{p.description ? ` · ${p.description}` : ""}</span>
                  </div>
                  {canProfiles ? <DeleteProfileButton profileId={p.id} /> : null}
                </div>
              ))}
            </div>
          ) : null}
          {canProfiles ? <CreateProfileForm /> : <p className="text-sm text-muted-foreground">Member role required to manage profiles.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
