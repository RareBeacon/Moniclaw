import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Replay", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const FRAME_TONE: Record<string, string> = {
  SUCCEEDED: "text-emerald-600 dark:text-emerald-400",
  RECOVERED: "text-amber-600 dark:text-amber-400",
  FAILED: "text-red-600 dark:text-red-400",
  SKIPPED: "text-muted-foreground",
  RUNNING: "text-sky-600 dark:text-sky-400",
};

type Params = { params: Promise<{ executionId: string }> };

export default async function ReplayPage({ params }: Params) {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "browser.read")) return <AccessDenied required="Viewer" />;

  const { executionId } = await params;
  const runtime = getBrowserRuntime();
  const execution = await runtime.executions.get(executionId, workspace.id).catch(() => null);
  if (!execution) notFound();
  const [recording, events] = await Promise.all([
    runtime.recordings.getByExecution(executionId, workspace.id),
    runtime.executions.events(executionId, { limit: 400 }),
  ]);
  const frames = recording?.timeline ?? [];
  const shotFrames = frames.filter((f) => f.screenshotId);

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm text-muted-foreground"><Link href="/dashboard/browser/recordings" className="underline decoration-dotted">Recordings</Link> / {executionId.slice(0, 8)}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Replay</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {execution.goal ?? "Execution"} · <Badge variant={execution.status === "SUCCEEDED" ? "secondary" : execution.status === "FAILED" ? "accent" : "outline"}>{execution.status}</Badge>
          {execution.failedStep ? ` · failed at step ${execution.failedStep}` : ""}
          {recording ? ` · ${recording.steps} events · ${(recording.durationMs / 1000).toFixed(1)}s` : ""}
        </p>
        {execution.error ? <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{execution.error}</p> : null}
      </div>

      {shotFrames.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Screenshot trail</CardTitle><CardDescription>Step captures (newest last).</CardDescription></CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shotFrames.map((f, i) => (
                <figure key={`${f.seq}-${f.attempt}-${i}`} className="rounded-lg border p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- session-authenticated artifact stream */}
                  <img src={`/api/browser/screenshots/${f.screenshotId}/image`} alt={`Step ${f.seq} ${f.action}`} className="aspect-video w-full rounded object-cover" loading="lazy" />
                  <figcaption className="mt-1.5 text-xs text-muted-foreground">#{f.seq} {f.action} · attempt {f.attempt}</figcaption>
                </figure>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Timeline</CardTitle><CardDescription>One row per action attempt (retries and healing visible).</CardDescription></CardHeader>
        <CardContent>
          {frames.length === 0 ? (
            <p className="text-sm text-muted-foreground">Recording not finalized yet (execution still running?).</p>
          ) : (
            <div className="grid gap-0.5 font-mono text-xs">
              {frames.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-x-3 rounded px-2 py-1 hover:bg-muted/60">
                  <span className="w-14 text-muted-foreground">#{f.seq}·a{f.attempt}</span>
                  <span className={`w-20 font-medium ${FRAME_TONE[f.status] ?? ""}`}>{f.status}</span>
                  <span className="w-36">{f.action}</span>
                  <span className="w-20 text-muted-foreground">{f.durationMs != null ? `${f.durationMs}ms` : "—"}</span>
                  <span className="grow truncate text-muted-foreground">{f.error ?? f.url ?? ""}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {events.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Event log ({events.length})</CardTitle><CardDescription>Raw action-event rows (selectors, healed-from, outputs truncated).</CardDescription></CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto rounded-md bg-zinc-950 p-3 font-mono text-xs text-zinc-200">
              {events.map((e) => (
                <div key={e.id} className="border-b border-zinc-800 py-1.5 last:border-0">
                  <span className="text-zinc-500">#{e.seq}·a{e.attempt}</span>{" "}
                  <span className="text-sky-400">{e.action}</span>{" "}
                  <span className={e.status === "FAILED" ? "text-red-400" : e.status === "RECOVERED" ? "text-amber-400" : "text-emerald-400"}>{e.status}</span>
                  {e.healedFrom ? <span className="text-amber-500"> [healed]</span> : null}
                  {e.error ? <div className="mt-0.5 pl-4 text-zinc-500">{e.error.slice(0, 200)}</div> : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
