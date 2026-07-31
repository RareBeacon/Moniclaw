import type { Metadata } from "next";

import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format";
import { DeleteDownloadButton } from "@/components/dashboard/browser/forms";

export const metadata: Metadata = { title: "Downloads", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

export default async function DownloadsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "browser.read")) return <AccessDenied required="Viewer" />;

  const runtime = getBrowserRuntime();
  const downloads = await runtime.downloads.list(workspace.id, { limit: 100 });
  const canManage = can(role, "browser.downloads.manage");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Downloads</h1>
        <p className="mt-1 text-sm text-muted-foreground">Files captured by sessions — content-addressed, hash-pinned, scanned (HELD files cannot be fetched).</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Captured files ({downloads.length})</CardTitle>
          <CardDescription>Scan verdicts come from the workspace scanner port (heuristic by default).</CardDescription>
        </CardHeader>
        <CardContent>
          {downloads.length === 0 ? (
            <p className="text-sm text-muted-foreground">No downloads captured yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">File</th>
                    <th className="py-2 pr-4 font-medium">Size</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Scan</th>
                    <th className="py-2 pr-4 font-medium">Captured</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {downloads.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="max-w-[260px] truncate py-2.5 pr-4 font-medium" title={d.sha256}>{d.filename}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{fmtBytes(d.sizeBytes)}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{d.mime}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={d.scanStatus === "CLEAN" ? "secondary" : d.scanStatus === "HELD" ? "accent" : "outline"} title={d.scanDetail ?? ""}>{d.scanStatus}</Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{formatRelative(d.createdAt)}</td>
                      <td className="py-2.5 text-right">
                        {d.scanStatus !== "HELD" ? (
                          <a href={`/api/browser/downloads/${d.id}/file`} className="mr-2 text-sm underline decoration-dotted hover:text-primary">Download</a>
                        ) : null}
                        {canManage ? <DeleteDownloadButton id={d.id} /> : null}
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
