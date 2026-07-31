import { db } from "@/lib/db";
import { ok, fail, errorResponse } from "@/lib/ai/api";
import { requirePrincipal, resolveApiPrincipal } from "@/lib/api-auth";

/** GET    /api/ai/conversations/[id] — fetch a thread with messages
 *  DELETE /api/ai/conversations/[id] — remove a thread */

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "ai.chat");
    if (guard) return guard;
    const conversation = await db.aiConversation.findFirst({
      where: { id, workspaceId: principal!.workspace.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 100,
          select: {
            id: true, role: true, content: true, model: true, provider: true,
            toolCalls: true, createdAt: true,
          },
        },
      },
    });
    if (!conversation) return fail(404, "not_found", "Conversation not found.");
    return ok({ conversation });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "ai.chat");
    if (guard) return guard;
    const existing = await db.aiConversation.findFirst({
      where: { id, workspaceId: principal!.workspace.id },
    });
    if (!existing) return fail(404, "not_found", "Conversation not found.");
    await db.aiConversation.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
