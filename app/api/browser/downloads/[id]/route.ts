import { getBrowserRuntime } from "@/lib/browser/runtime";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { errorResponse, fail, guard, isGuarded, ok } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/browser/downloads/[id] — metadata (+ scan verdict). */
export async function GET(request: Request, { params }: Params) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const row = await runtime.repos.downloads.get(id, g.principal.workspace.id);
    if (!row) return fail(404, "not_found", "Download not found in this workspace.");
    return ok({ download: { ...row, fileUrl: `/api/browser/downloads/${row.id}/file` } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/browser/downloads/[id] — remove (browser.downloads.manage). */
export async function DELETE(request: Request, { params }: Params) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  if (!can(g.principal.role, "browser.downloads.manage")) {
    return fail(403, "forbidden", "Missing capability: browser.downloads.manage");
  }
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const deleted = await runtime.downloads.delete(id, g.principal.workspace.id);
    if (!deleted) return fail(404, "not_found", "Download not found in this workspace.");
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId ?? undefined,
      action: AUDIT_ACTIONS.browserDownloadDelete, targetType: "download", targetId: id,
    });
    return ok({ deleted: true, id });
  } catch (err) {
    return errorResponse(err);
  }
}
