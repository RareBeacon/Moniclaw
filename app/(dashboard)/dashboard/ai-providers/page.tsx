import type { Metadata } from "next";

import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { decryptSecret, maskSecret } from "@/lib/crypto";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { getAiSettings } from "@/lib/ai/settings";
import { getRuntime } from "@/lib/ai/runtime";
import { PROVIDER_CATALOG } from "@runtime/providers/registry";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Plug } from "lucide-react";
import {
  AddProviderForm,
  AiSettingsForm,
  ProviderConfigRow,
} from "@/components/dashboard/ai/provider-forms";

export const metadata: Metadata = {
  title: "AI Providers",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AiProvidersPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "ai.providers.manage")) {
    return <AccessDenied required="Admin" />;
  }

  const [configs, settings] = await Promise.all([
    db.aiProviderConfig.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    }),
    getAiSettings(workspace.id),
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
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">AI Providers</h1>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Bring your own keys. The runtime routes through enabled connections in
        priority order (lowest number first) and fails over automatically.
        Free-first: Gemini → OpenRouter free models → Ollama — no paid API
        required.
      </p>

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
              description="Add a free Gemini or OpenRouter key — or a local Ollama endpoint — and every AI feature in this workspace lights up. Keys are encrypted (AES-256-GCM) and verified before saving."
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
              freeTier: p.freeTier,
              status: p.status,
              defaultModel: p.defaultModel,
              defaultBaseUrl: p.defaultBaseUrl ?? null,
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
    </div>
  );
}
