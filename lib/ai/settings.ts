import { cache } from "react";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import type {
  ProviderConfigSource,
  ResolvedProviderConfig,
} from "@runtime/model-router/router";
import {
  FREE_FIRST_ORDER,
  envFallbackProviders,
  type ProviderId,
} from "@runtime/providers/registry";

/**
 * AI settings access — Prisma-backed implementations of the router's ports.
 * This file is the ONLY place the runtime touches provider credentials.
 */

export const getAiSettings = cache(async (workspaceId: string) => {
  const existing = await db.aiWorkspaceSettings.findUnique({
    where: { workspaceId },
  });
  if (existing) return existing;
  // Lazy materialization — settings rows appear on first use.
  return db.aiWorkspaceSettings.create({ data: { workspaceId } });
});

class PrismaProviderConfigSource implements ProviderConfigSource {
  async resolve(workspaceId: string): Promise<ResolvedProviderConfig[]> {
    const rows = await db.aiProviderConfig.findMany({
      where: { workspaceId, enabled: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });

    const resolved: ResolvedProviderConfig[] = rows.map((row) => ({
      configId: row.id,
      provider: row.provider.toLowerCase() as ProviderId,
      apiKey: row.apiKeyEnc ? decryptSecret(row.apiKeyEnc) : undefined,
      baseUrl: row.baseUrl ?? undefined,
      defaultModel: row.defaultModel ?? undefined,
      priority: row.priority,
      source: "workspace" as const,
    }));

    // Platform-level env fallbacks sit BEHIND workspace BYOK configs.
    const workspaceProviders = new Set(resolved.map((r) => r.provider));
    for (const env of envFallbackProviders()) {
      if (!workspaceProviders.has(env.id)) {
        resolved.push({
          configId: null,
          provider: env.id,
          apiKey: env.creds.apiKey,
          baseUrl: env.creds.baseUrl,
          defaultModel: undefined,
          priority: 900 + FREE_FIRST_ORDER.indexOf(env.id),
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
        },
      });
    } catch (err) {
      console.warn("[ai] failed to persist provider health:", (err as Error).message);
    }
  }
}

let source: PrismaProviderConfigSource | null = null;
export function providerConfigSource(): PrismaProviderConfigSource {
  if (!source) source = new PrismaProviderConfigSource();
  return source;
}
