import type { Metadata } from "next";

import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BrowserPolicyForm } from "@/components/dashboard/browser/forms";

export const metadata: Metadata = { title: "Browser Permissions", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BrowserPermissionsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "browser.read")) return <AccessDenied required="Viewer" />;

  const runtime = getBrowserRuntime();
  const policy = await runtime.permissions.policyFor(workspace.id);
  const canEdit = can(role, "browser.policy.manage");

  const tiers = [
    { name: "Read-only", on: policy.readOnly, note: "extraction/capture only" },
    { name: "Navigation only", on: policy.navigationOnly, note: "+ navigate family" },
    { name: "JavaScript", on: policy.allowJavascript, note: "execute_javascript gate" },
    { name: "Downloads", on: policy.allowDownloads, note: "download_file" },
    { name: "Uploads", on: policy.allowUploads, note: "upload_file" },
    { name: "Clipboard", on: policy.allowClipboard, note: "clipboard actions" },
  ];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Browser Permissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Workspace policy for the Computer Use Engine — permission tiers + domain safety lists with approval gates.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Effective policy</CardTitle>
          <CardDescription>Evaluated as: blocked &gt; confirmation &gt; allowed &gt; default-allow.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {tiers.map((t) => (
              <Badge key={t.name} variant={t.on ? "default" : "outline"} title={t.note}>{t.name}: {t.on ? "on" : "off"}</Badge>
            ))}
            <Badge variant={policy.defaultAllowed ? "default" : "accent"}>Unlisted domains: {policy.defaultAllowed ? "allowed" : "denied"}</Badge>
          </div>
          <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
            <p>Allowlist: {policy.allowedDomains.length ? policy.allowedDomains.join(", ") : "—"}</p>
            <p>Blocklist: {policy.blockedDomains.length ? policy.blockedDomains.join(", ") : "—"}</p>
            <p>Confirmations: {policy.confirmationDomains.length ? policy.confirmationDomains.join(", ") : "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit policy</CardTitle>
          <CardDescription>{canEdit ? "Takes effect for all new and running sessions." : "Admin role required to edit the policy."}</CardDescription>
        </CardHeader>
        <CardContent>
          {canEdit ? <BrowserPolicyForm policy={policy} /> : <p className="text-sm text-muted-foreground">Ask an Admin to change the browser policy.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
