import { z } from "zod";
import { getRuntime } from "@/lib/ai/runtime";
import { ok, fail, errorResponse, readJson } from "@/lib/ai/api";
import { requirePrincipal, resolveApiPrincipal } from "@/lib/api-auth";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/** POST /api/ai/embeddings — batch embedding generation (768-dim contract). */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  texts: z.array(z.string().min(1).max(20_000)).min(1).max(100),
  model: z.string().max(120).optional(),
  taskType: z.enum(["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY", "SEMANTIC_SIMILARITY"]).optional(),
});

export async function POST(request: Request) {
  try {
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "ai.chat");
    if (guard) return guard;

    const gate = await rateLimit(
      `aiEmbed:${principal!.workspace.id}`,
      RATE_LIMITS.aiEmbed.limit,
      RATE_LIMITS.aiEmbed.windowMs
    );
    if (!gate.success) {
      return fail(429, "rate_limited", `Embedding quota hit. Retry in ${gate.retryAfterSeconds}s.`);
    }

    const parsed = bodySchema.parse(await readJson(request));
    const runtime = getRuntime();
    const response = await runtime.router.embed(
      { workspaceId: principal!.workspace.id, userId: principal!.userId },
      { texts: parsed.texts, model: parsed.model, taskType: parsed.taskType, signal: request.signal }
    );
    return ok({
      vectors: response.vectors,
      dim: response.dim,
      model: response.model,
      provider: response.provider,
      usage: response.usage,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
