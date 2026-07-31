import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, errorResponse, readJson } from "@/lib/ai/api";
import { requirePrincipal, resolveApiPrincipal } from "@/lib/api-auth";

/** GET  /api/ai/conversations — list workspace conversations
 *  POST /api/ai/conversations — create a thread (playground/SDK) */

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().max(140).optional(),
  agentId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  try {
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "ai.chat");
    if (guard) return guard;
    const conversations = await db.aiConversation.findMany({
      where: { workspaceId: principal!.workspace.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true, title: true, messageCount: true, updatedAt: true, createdAt: true,
      },
    });
    return ok({ conversations });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "ai.chat");
    if (guard) return guard;
    const parsed = createSchema.parse(await readJson(request));
    if (parsed.agentId) {
      const agent = await db.agent.findFirst({
        where: { id: parsed.agentId, workspaceId: principal!.workspace.id, deletedAt: null },
      });
      if (!agent) return fail(404, "not_found", "Agent not found.");
    }
    const conversation = await db.aiConversation.create({
      data: {
        workspaceId: principal!.workspace.id,
        userId: principal!.userId,
        agentId: parsed.agentId ?? null,
        title: parsed.title ?? "New conversation",
      },
    });
    return ok({ conversation }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
