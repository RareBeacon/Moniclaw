import { db } from "@/lib/db";
import { getRuntime } from "@/lib/ai/runtime";
import { ok, fail, errorResponse } from "@/lib/ai/api";
import { requirePrincipal, resolveApiPrincipal } from "@/lib/api-auth";
import { audit } from "@/lib/audit";

/** GET    /api/ai/knowledge/documents/[id] — document detail + chunks
 *  DELETE /api/ai/knowledge/documents/[id] — soft-delete (MANAGER+) */

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "knowledge.read");
    if (guard) return guard;
    const document = await db.knowledgeDocument.findFirst({
      where: { id, workspaceId: principal!.workspace.id, deletedAt: null },
    });
    if (!document) return fail(404, "not_found", "Document not found.");
    const runtime = getRuntime();
    const chunks = await runtime.knowledge.getChunks(id, principal!.workspace.id);
    return ok({
      document: {
        id: document.id, title: document.title, filename: document.filename,
        mime: document.mime, sizeBytes: document.sizeBytes, status: document.status,
        error: document.error, chunkCount: document.chunkCount, source: document.source,
        sourceUrl: document.sourceUrl, checksum: document.checksum, createdAt: document.createdAt,
      },
      chunks,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "knowledge.delete");
    if (guard) return guard;
    const document = await db.knowledgeDocument.findFirst({
      where: { id, workspaceId: principal!.workspace.id, deletedAt: null },
    });
    if (!document) return fail(404, "not_found", "Document not found.");
    const runtime = getRuntime();
    await runtime.knowledge.deleteDocument(id, principal!.workspace.id);
    await audit({
      workspaceId: principal!.workspace.id,
      actorId: principal!.userId,
      action: "ai.knowledge.delete",
      targetType: "knowledge_document",
      targetId: id,
      metadata: { title: document.title },
    });
    return ok({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
