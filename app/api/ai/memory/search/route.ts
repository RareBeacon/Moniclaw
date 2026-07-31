import { z } from "zod";
import { getRuntime } from "@/lib/ai/runtime";
import { ok, errorResponse, readJson } from "@/lib/ai/api";
import { requirePrincipal, resolveApiPrincipal } from "@/lib/api-auth";

/** POST /api/ai/memory/search — semantic recall (embeds the query when possible). */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  query: z.string().min(1).max(1_000),
  scopes: z.array(z.enum(["CONVERSATION", "WORKSPACE", "AGENT", "LONG_TERM"])).optional(),
  conversationKey: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(20).default(8),
});

export async function POST(request: Request) {
  try {
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "ai.memory.read");
    if (guard) return guard;
    const parsed = bodySchema.parse(await readJson(request));
    const runtime = getRuntime();

    let queryEmbedding: number[] | undefined;
    try {
      const response = await runtime.router.embed(
        { workspaceId: principal!.workspace.id, userId: principal!.userId },
        { texts: [parsed.query], taskType: "RETRIEVAL_QUERY", signal: request.signal }
      );
      queryEmbedding = response.vectors[0];
    } catch {
      queryEmbedding = undefined; // falls back to importance/recency recall
    }

    const items = await runtime.memory.recall({
      workspaceId: principal!.workspace.id,
      queryEmbedding,
      scopes: parsed.scopes,
      conversationKey: parsed.conversationKey,
      limit: parsed.limit,
    });
    return ok({
      mode: queryEmbedding ? "semantic" : "fallback",
      memories: items.map((m) => ({
        id: m.id,
        scope: m.scope,
        content: m.content,
        score: Number(m.score.toFixed(4)),
        similarity: Number(m.similarity.toFixed(4)),
        importance: m.importance,
        tags: m.tags,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
