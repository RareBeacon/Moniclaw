import { getBrowserRuntime } from "@/lib/browser/runtime";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { errorResponse, fail, guard, isGuarded, ok } from "@/lib/browser/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/browser/uploads — list staged files. */
export async function GET(request: Request) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const runtime = getBrowserRuntime();
    const uploads = await runtime.uploads.list(g.principal.workspace.id, { limit: 100 });
    return ok({ uploads });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/browser/uploads — multipart file stage (for upload_file action). */
export async function POST(request: Request) {
  const g = await guard(request, "browser.execute", { rate: "browserUpload" });
  if (isGuarded(g)) return g.response;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail(400, "validation", "multipart field 'file' is required.");
    const runtime = getBrowserRuntime();
    const settings = await runtime.repos.settings.getSettings(g.principal.workspace.id);
    const data = Buffer.from(await file.arrayBuffer());
    const { row, deduplicated } = await runtime.uploads.store({
      workspaceId: g.principal.workspace.id,
      uploaderId: g.principal.userId,
      filename: file.name || "upload.bin",
      mime: file.type || "application/octet-stream",
      data,
      maxBytes: settings.maxArtifactMB * 1024 * 1024,
    });
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId ?? undefined,
      action: AUDIT_ACTIONS.browserUploadStore, targetType: "upload", targetId: row.id,
      metadata: { filename: row.filename, bytes: row.sizeBytes, deduplicated },
    });
    return ok({ upload: row, deduplicated }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
