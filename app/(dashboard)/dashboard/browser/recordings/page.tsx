import type { Metadata } from "next";
import Link from "next/link";

import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Recordings", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function RecordingsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "browser.read")) return <AccessDenied required="Viewer" />;

  const runtime = getBrowserRuntime();
  const recordings = await runtime.recordings.list(workspace.id, { limit: 60 });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recordings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Replayable execution timelines — steps, screenshots, errors, retries.</p>
      </div>

      {recordings.length === 0 ? (
        <Card>
          <CardHeader><CardTitle>No recordings yet</CardTitle><CardDescription>Recordings finalize automatically when an execution finishes (success or failure).</CardDescription></CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {recordings.map((r) => (
            <Link key={r.id} href={`/dashboard/browser/recordings/${r.executionId}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-mono text-sm">{r.executionId.slice(0, 8)}</CardTitle>
                  <CardDescription>{formatRelative(r.createdAt)} · {(r.durationMs / 1000).toFixed(1)}s</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{r.steps} steps</Badge>
                  <Badge variant="secondary">{r.screenshots} shots</Badge>
                  {r.errors > 0 ? <Badge variant="accent">{r.errors} errors</Badge> : null}
                  {r.retries > 0 ? <Badge variant="outline">{r.retries} retries</Badge> : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
