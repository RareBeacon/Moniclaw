import type { Metadata } from "next";

import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { DeleteUploadButton, StageUploadForm } from "@/components/dashboard/browser/forms";

export const metadata: Metadata = { title: "Uploads", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

export default async function UploadsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "browser.read")) return <AccessDenied required="Viewer" />;

  const runtime = getBrowserRuntime();
  const uploads = await runtime.uploads.list(workspace.id, { limit: 100 });
  const canExecute = can(role, "browser.execute");
  const canManage = can(role, "browser.downloads.manage");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Uploads</h1>
        <p className="mt-1 text-sm text-muted-foreground">Files staged for <code className="rounded bg-muted px-1">upload_file</code> actions — attach by uploadId in step args.</p>
      </div>

      {canExecute ? (
        <Card>
          <CardHeader><CardTitle>Stage a file</CardTitle><CardDescription>Stored in the workspace binary vault; deduped by content hash.</CardDescription></CardHeader>
          <CardContent><StageUploadForm /></CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Staged files ({uploads.length})</CardTitle>
          <CardDescription>usedCount tracks how many actions attached each file.</CardDescription>
        </CardHeader>
        <CardContent>
          {uploads.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing staged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">File</th>
                    <th className="py-2 pr-4 font-medium">Upload ID</th>
                    <th className="py-2 pr-4 font-medium">Size</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Used</th>
                    <th className="py-2 pr-4 font-medium">Staged</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="max-w-[220px] truncate py-2.5 pr-4 font-medium">{u.filename}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground" title={u.id}>{u.id.slice(0, 8)}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{fmtBytes(u.sizeBytes)}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{u.mime}</td>
                      <td className="py-2.5 pr-4">{u.usedCount}×</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{formatRelative(u.createdAt)}</td>
                      <td className="py-2.5 text-right">{canManage ? <DeleteUploadButton id={u.id} /> : null}</td>
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
