import { db } from "@/lib/db";
import { ok, errorResponse } from "@/lib/ai/api";
import { requirePrincipal, resolveApiPrincipal } from "@/lib/api-auth";
import { PROVIDER_CATALOG } from "@runtime/providers/registry";
import { maskSecret, decryptSecret } from "@/lib/crypto";

/** GET /api/ai/providers — catalog + this workspace's configs (secrets masked). */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "ai.chat");
    if (guard) return guard;
    const configs = await db.aiProviderConfig.findMany({
      where: { workspaceId: principal!.workspace.id },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    const settings = await db.aiWorkspaceSettings.findUnique({
      where: { workspaceId: principal!.workspace.id },
    });
    return ok({
      catalog: PROVIDER_CATALOG.map((p) => ({
        id: p.id,
        label: p.label,
        requiresKey: p.requiresKey,
        freeTier: p.freeTier,
        status: p.status,
        defaultModel: p.defaultModel,
        defaultBaseUrl: p.defaultBaseUrl ?? null,
      })),
      defaults: {
        provider: settings?.defaultProvider ?? null,
        model: settings?.defaultModel ?? null,
      },
      configs: configs.map((c) => ({
        id: c.id,
        provider: c.provider.toLowerCase(),
        label: c.label,
        baseUrl: c.baseUrl,
        keyMask: c.apiKeyEnc ? maskSecret(decryptSecret(c.apiKeyEnc)) : null,
        enabled: c.enabled,
        priority: c.priority,
        defaultModel: c.defaultModel,
        healthStatus: c.healthStatus,
        healthCheckedAt: c.healthCheckedAt,
        healthError: c.healthError,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
