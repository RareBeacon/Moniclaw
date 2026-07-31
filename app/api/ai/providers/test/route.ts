import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail, errorResponse } from "@/lib/ai/api";
import { requirePrincipal, resolveApiPrincipal } from "@/lib/api-auth";
import { decryptSecret } from "@/lib/crypto";
import { createChatProvider, type ProviderId } from "@runtime/providers/registry";

/** POST /api/ai/providers/test — live health probe for one config (ADMIN). */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({ configId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "ai.providers.manage");
    if (guard) return guard;
    const parsed = bodySchema.parse(await request.json());
    const config = await db.aiProviderConfig.findFirst({
      where: { id: parsed.configId, workspaceId: principal!.workspace.id },
    });
    if (!config) return fail(404, "not_found", "Provider config not found.");

    const adapter = createChatProvider(
      config.provider.toLowerCase() as ProviderId,
      {
        apiKey: config.apiKeyEnc ? decryptSecret(config.apiKeyEnc) : undefined,
        baseUrl: config.baseUrl ?? undefined,
      },
      { model: config.defaultModel ?? undefined }
    );
    const health = await adapter.healthCheck();
    await db.aiProviderConfig.update({
      where: { id: config.id },
      data: {
        healthStatus: health.ok ? "ok" : "error",
        healthCheckedAt: new Date(),
        healthError: health.ok ? null : (health.error ?? "unknown").slice(0, 300),
      },
    });
    return ok(health);
  } catch (err) {
    return errorResponse(err);
  }
}
