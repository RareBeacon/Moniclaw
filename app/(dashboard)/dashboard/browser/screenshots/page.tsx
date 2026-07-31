import type { Metadata } from "next";

import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Screenshots", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const KIND_TONE: Record<string, "default" | "secondary" | "accent" | "outline"> = {
  MANUAL: "default", STEP: "secondary", FAILURE: "accent", AUTO: "outline",
};

export default async function ScreenshotsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "browser.read")) return <AccessDenied required="Viewer" />;

  const runtime = getBrowserRuntime();
  const screenshots = await runtime.screenshots.list(workspace.id, { limit: 60 });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Screenshots</h1>
        <p className="mt-1 text-sm text-muted-foreground">Step captures, failure frames and manual shots across sessions.</p>
      </div>

      {screenshots.length === 0 ? (
        <Card>
          <CardHeader><CardTitle>No screenshots yet</CardTitle><CardDescription>Step screenshots appear when recordScreenshots is on (Engine Settings); manual shots via the take_screenshot action.</CardDescription></CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {screenshots.map((s) => (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge variant={KIND_TONE[s.kind] ?? "outline"}>{s.kind}</Badge>
                  <span className="text-xs text-muted-foreground">{formatRelative(s.createdAt)}</span>
                </div>
                <CardDescription className="font-mono text-xs">
                  {s.executionId ? `exec ${s.executionId.slice(0, 8)}` : s.sessionId ? `sess ${s.sessionId.slice(0, 8)}` : "manual"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* eslint-disable-next-line @next/next/no-img-element -- session-authenticated artifact stream */}
                <img src={`/api/browser/screenshots/${s.id}/image`} alt={`${s.kind} screenshot`} loading="lazy" className="aspect-video w-full rounded-md border object-cover" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
