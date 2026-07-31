import type { Metadata } from "next";

import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrowserSettingsForm } from "@/components/dashboard/browser/forms";

export const metadata: Metadata = { title: "Browser Engine Settings", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BrowserSettingsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "browser.read")) return <AccessDenied required="Viewer" />;

  const runtime = getBrowserRuntime();
  const settings = await runtime.repos.settings.getSettings(workspace.id);
  const canEdit = can(role, "browser.settings.manage");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Browser Engine Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Workspace defaults for the Computer Use Engine — timeouts, caps, screenshot and dialog behavior.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Engine defaults</CardTitle>
          <CardDescription>{canEdit ? "Changes apply to new sessions immediately." : "Read-only — Admin role required to edit."}</CardDescription>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <BrowserSettingsForm settings={settings} />
          ) : (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {Object.entries(settings).filter(([k]) => k !== "workspaceId").map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 rounded-md border px-3 py-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-mono">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
