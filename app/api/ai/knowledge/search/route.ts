import { z } from "zod";
import { getRuntime } from "@/lib/ai/runtime";
import { ok, errorResponse, readJson } from "@/lib/ai/api";
import { requirePrincipal, resolveApiPrincipal } from "@/lib/api-auth";

/** POST /api/ai/knowledge/search — semantic retrieval across READY docs. */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  query: z.string().min(1).max(1_000),
  limit: z.number().int().min(1).max(20).default(6),
});

export async function POST(request: Request) {
  try {
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "knowledge.read");
    if (guard) return guard;
    const parsed = bodySchema.parse(await readJson(request));
    const runtime = getRuntime();
    const results = await runtime.knowledge.search({
      workspaceId: principal!.workspace.id,
      query: parsed.query,
      limit: parsed.limit,
    });
    return ok({
      query: parsed.query,
      results: results.map((r) => ({
        citation: `${r.documentTitle} · chunk ${r.index + 1}`,
        documentId: r.documentId,
        chunkId: r.chunkId,
        similarity: Number(r.similarity.toFixed(4)),
        content: r.content,
      })),
      empty: results.length === 0,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
