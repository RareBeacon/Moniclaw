import { getBrowserRuntime } from "@/lib/browser/runtime";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { errorResponse, fail, guard, isGuarded, ok } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/browser/screenshots/[id] — metadata. */
export async function GET(request: Request, { params }: Params) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const row = await runtime.repos.screenshots.get(id, g.principal.workspace.id);
    if (!row) return fail(404, "not_found", "Screenshot not found in this workspace.");
    return ok({ screenshot: { ...row, imageUrl: `/api/browser/screenshots/${row.id}/image` } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/browser/screenshots/[id] — remove (browser.downloads.manage). */
export async function DELETE(request: Request, { params }: Params) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  if (!can(g.principal.role, "browser.downloads.manage")) {
    return fail(403, "forbidden", "Missing capability: browser.downloads.manage");
  }
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const deleted = await runtime.screenshots.delete(id, g.principal.workspace.id);
    if (!deleted) return fail(404, "not_found", "Screenshot not found in this workspace.");
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId ?? undefined,
      action: AUDIT_ACTIONS.browserScreenshotDelete, targetType: "screenshot", targetId: id,
    });
    return ok({ deleted: true, id });
  } catch (err) {
    return errorResponse(err);
  }
}
