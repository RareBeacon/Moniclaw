import type { Metadata } from "next";

import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { AiProvidersPanel } from "@/components/dashboard/ai/providers-panel";

export const metadata: Metadata = {
  title: "API Keys · Settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Settings → API Keys — the universal provider vault (Phase 11 v1). Renders
 * the exact same panel as Dashboard → AI Providers; there is one connection
 * store, one runtime router, zero duplicated logic.
 */
export default async function ApiKeysSettingsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "ai.providers.manage")) {
    return <AccessDenied required="Admin" />;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Connect this workspace to any AI platform. Paste a key (or point at a
        compatible endpoint), we verify it live before saving, encrypt it
        (AES-256-GCM), and never display it again. Chat features fail over
        across your connections in priority order; semantic
        memory/knowledge embeddings run on Gemini or Ollama (768-dim).
      </p>
      <AiProvidersPanel workspaceId={workspace.id} />
    </div>
  );
}
