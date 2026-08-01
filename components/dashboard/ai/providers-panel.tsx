import { db } from "@/lib/db";
import { decryptSecret, maskSecret } from "@/lib/crypto";
import { getAiSettings } from "@/lib/ai/settings";
import { getRuntime } from "@/lib/ai/runtime";
import { PROVIDER_CATALOG } from "@runtime/providers/registry";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Plug } from "lucide-react";
import {
  AddProviderForm,
  AiSettingsForm,
  ProviderConfigRow,
} from "@/components/dashboard/ai/provider-forms";

/**
 * The universal AI-key vault surface — one implementation rendered by both
 * /dashboard/ai-providers and /dashboard/settings/api-keys. Callers run the
 * RBAC guard (`ai.providers.manage`) before rendering this panel.
 */
export async function AiProvidersPanel({ workspaceId }: { workspaceId: string }) {
  const [configs, settings] = await Promise.all([
    db.aiProviderConfig.findMany({
      where: { workspaceId },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    }),
    getAiSettings(workspaceId),
  ]);
  const runtime = getRuntime();
  const tools = runtime.tools
    .list()
    .map((t) => ({
      name: t.name,
      description: t.description,
      mutating: t.metadata.mutating,
    }));

  const toolPermissions = (settings.toolPermissions ?? {}) as Record<string, boolean>;

  return (
    <>
      <section className="mt-8" aria-label="Connections">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Connections</h2>
          <span className="text-xs text-muted-foreground">
            {configs.filter((c) => c.enabled).length} of {configs.length} enabled
          </span>
        </div>

        {configs.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Plug}
              title="No providers configured"
              description="Add any AI platform key below — free options (Gemini, Groq, OpenRouter free models, Ollama) light up every AI feature in this workspace at $0. Keys are encrypted (AES-256-GCM), verified before saving, and shown nowhere afterwards."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {configs.map((config) => (
              <ProviderConfigRow
                key={config.id}
                config={{
                  id: config.id,
                  provider: config.provider,
                  label: config.label,
                  enabled: config.enabled,
                  priority: config.priority,
                  defaultModel: config.defaultModel,
                  baseUrl: config.baseUrl,
                  keyMask: config.apiKeyEnc ? maskSecret(decryptSecret(config.apiKeyEnc)) : null,
                  healthStatus: config.healthStatus,
                  healthCheckedAt: config.healthCheckedAt?.toISOString() ?? null,
                  healthError: config.healthError,
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-label="Add a provider">
        <h2 className="text-sm font-semibold">Add a connection</h2>
        <div className="mt-3 rounded-2xl border bg-card p-6">
          <AddProviderForm
            catalog={PROVIDER_CATALOG.map((p) => ({
              id: p.id.toUpperCase(),
              label: p.label,
              requiresKey: p.requiresKey,
              requiresBaseUrl: p.requiresBaseUrl ?? false,
              requiresModel: p.requiresModel ?? false,
              freeTier: p.freeTier,
              status: p.status,
              embeddings: p.embeddings,
              defaultModel: p.defaultModel,
              defaultBaseUrl: p.defaultBaseUrl ?? null,
              keyUrl: p.keyUrl ?? null,
            }))}
          />
        </div>
      </section>

      <section className="mt-10" aria-label="Defaults and limits">
        <h2 className="text-sm font-semibold">Defaults, limits & tool permissions</h2>
        <div className="mt-3 rounded-2xl border bg-card p-6">
          <AiSettingsForm
            settings={{
              defaultProvider: settings.defaultProvider,
              defaultModel: settings.defaultModel,
              memoryMaxRecords: settings.memoryMaxRecords,
              memoryRetentionDays: settings.memoryRetentionDays,
              memorySummarizeAfter: settings.memorySummarizeAfter,
              knowledgeMaxDocuments: settings.knowledgeMaxDocuments,
              knowledgeMaxFileMB: settings.knowledgeMaxFileMB,
              knowledgeMaxChunksPerDoc: settings.knowledgeMaxChunksPerDoc,
            }}
            tools={tools}
            toolPermissions={toolPermissions}
          />
        </div>
      </section>
    </>
  );
}
