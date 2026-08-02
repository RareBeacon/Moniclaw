import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import type {
  ProviderConfigSource,
  ResolvedProviderConfig,
} from "@runtime/model-router/router";
import {
  envFallbackProviders,
  type ProviderId,
} from "@runtime/providers/registry";
import { rateLimitRestUntil, withoutRestedKeys } from "@/lib/ai/key-rotation";
import { notifyRateLimitedKey } from "@/lib/notifications";

/**
 * Prisma-backed ProviderConfigSource — the ONLY place the model router can
 * reach provider credentials (Dependency Inversion: runtime ↔ ports).
 *
 * React-free by design so prod-side E2E harnesses (scripts/*) can drive the
 * SAME resolution/rotation code the deployed app uses.
 */
class PrismaProviderConfigSource implements ProviderConfigSource {
  async resolve(workspaceId: string): Promise<ResolvedProviderConfig[]> {
    const rows = await db.aiProviderConfig.findMany({
      where: { workspaceId, enabled: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });

    // Multi-key rotation: a key that recently answered 429 rests until its
    // window passes; the workspace's other keys take the traffic. Decrypt
    // only what will actually serve — and a row whose ciphertext can't be
    // decrypted (corrupt/rotated) must degrade, not kill the whole chain.
    const active = withoutRestedKeys(rows);
    const resolved: ResolvedProviderConfig[] = [];
    for (const row of active) {
      try {
        resolved.push({
          configId: row.id,
          provider: row.provider.toLowerCase() as ProviderId,
          apiKey: row.apiKeyEnc ? decryptSecret(row.apiKeyEnc) : undefined,
          baseUrl: row.baseUrl ?? undefined,
          defaultModel: row.defaultModel ?? undefined,
          priority: row.priority,
          source: "workspace" as const,
        });
      } catch (err) {
        console.warn(`[ai] provider config ${row.id} undecryptable — skipped:`, (err as Error).message);
        void this.markHealth(row.id, false, "undecryptable ciphertext").catch(() => {});
      }
    }

    // Platform-level env fallbacks sit BEHIND workspace BYOK configs. When
    // every workspace key for a provider is resting (or broken), the env
    // fallback steps back in so the workspace keeps serving.
    const workspaceProviders = new Set(resolved.map((r) => r.provider));
    let envPriority = 900;
    for (const env of envFallbackProviders()) {
      if (!workspaceProviders.has(env.id)) {
        resolved.push({
          configId: null,
          provider: env.id,
          apiKey: env.creds.apiKey,
          baseUrl: env.creds.baseUrl,
          defaultModel: undefined,
          priority: envPriority++, // free-first order, no drift from the registry
          source: "env",
        });
      }
    }
    return resolved;
  }

  async markHealth(configId: string | null, ok: boolean, error?: string): Promise<void> {
    if (!configId) return; // env/synthetic configs have nowhere to persist
    try {
      await db.aiProviderConfig.update({
        where: { id: configId },
        data: {
          healthStatus: ok ? "ok" : "error",
          healthCheckedAt: new Date(),
          healthError: ok ? null : (error ?? "unknown").slice(0, 300),
          // A key that just served is definitionally not rate-limited anymore.
          ...(ok ? { rateLimitedUntil: null } : {}),
        },
      });
    } catch (err) {
      console.warn("[ai] failed to persist provider health:", (err as Error).message);
    }
  }

  /**
   * Router hook (multi-key rotation): the provider answered 429 for this
   * key. Rest it so resolve() rotates traffic to the workspace's other
   * keys, and alert the workspace — once per episode (deduped while unread).
   */
  async markRateLimited(
    configId: string | null,
    retryAfterSeconds: number | null,
    error: string
  ): Promise<void> {
    if (!configId) return; // env fallbacks are platform-owned — nothing to rest
    const until = rateLimitRestUntil(new Date(), retryAfterSeconds);
    let config: { workspaceId: string; label: string; provider: string } | null = null;
    try {
      config = await db.aiProviderConfig.update({
        where: { id: configId },
        data: { rateLimitedUntil: until },
        select: { workspaceId: true, label: true, provider: true },
      });
    } catch (err) {
      console.warn("[ai] failed to rest rate-limited key:", (err as Error).message);
      return;
    }
    await notifyRateLimitedKey({
      workspaceId: config.workspaceId,
      configId,
      label: config.label,
      provider: config.provider,
      until,
      error,
    });
  }
}

let source: PrismaProviderConfigSource | null = null;
export function providerConfigSource(): PrismaProviderConfigSource {
  if (!source) source = new PrismaProviderConfigSource();
  return source;
}
