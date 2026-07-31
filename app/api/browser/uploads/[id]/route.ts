import { getBrowserRuntime } from "@/lib/browser/runtime";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { errorResponse, fail, guard, isGuarded, ok } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/browser/uploads/[id] — metadata. */
export async function GET(request: Request, { params }: Params) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const row = await runtime.uploads.get(id, g.principal.workspace.id);
    if (!row || row.deletedAt) return fail(404, "not_found", "Upload not found in this workspace.");
    return ok({ upload: row });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/browser/uploads/[id] — soft delete (browser.downloads.manage). */
export async function DELETE(request: Request, { params }: Params) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  if (!can(g.principal.role, "browser.downloads.manage")) {
    return fail(403, "forbidden", "Missing capability: browser.downloads.manage");
  }
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const deleted = await runtime.uploads.delete(id, g.principal.workspace.id);
    if (!deleted) return fail(404, "not_found", "Upload not found in this workspace.");
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId ?? undefined,
      action: AUDIT_ACTIONS.browserUploadDelete, targetType: "upload", targetId: id,
    });
    return ok({ deleted: true, id });
  } catch (err) {
    return errorResponse(err);
  }
}
