import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, KeyRound, Plug } from "lucide-react";

import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { formatDateTime } from "@/lib/format";
import { DeleteWorkspaceForm, WorkspaceSettingsForm } from "@/components/dashboard/settings-forms";

export const metadata: Metadata = {
  title: "Workspace settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary) return null;
  const { workspace, role } = primary;

  const vaultEntries = await db.vaultEntry.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "asc" },
  });

  const canEdit = can(role, "settings.edit");
  const isOwner = role === "OWNER";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Identity, branding, and secrets for {workspace.name}.
        </p>
      </div>

      <section className="rounded-2xl border bg-card p-6 sm:p-7" aria-label="General settings">
        <h2 className="mb-5 text-sm font-semibold">General</h2>
        <WorkspaceSettingsForm
          name={workspace.name}
          slug={workspace.slug}
          brandColor={workspace.brandColor}
          canEdit={canEdit}
        />
        <p className="mt-5 border-t pt-4 font-mono text-[0.7rem] text-muted-foreground">
          id {workspace.id} · created {formatDateTime(workspace.createdAt)}
        </p>
      </section>

      <Link
        href="/dashboard/settings/api-keys"
        className="group flex items-center justify-between gap-4 rounded-2xl border bg-card p-6 transition-colors hover:border-primary/40 sm:p-7"
        aria-label="AI provider keys"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Plug className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold">AI provider keys</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Add API keys from any AI platform — Gemini, OpenAI, Anthropic,
              Groq, OpenRouter, DeepSeek, Mistral, xAI, Together, Ollama, or a
              custom OpenAI-compatible endpoint. Verified before saving,
              encrypted at rest, shared with no one outside this workspace.
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>

      <section className="rounded-2xl border bg-card p-6 sm:p-7" aria-label="Credential vault">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-primary" aria-hidden />
          Credential vault
        </h2>
        {vaultEntries.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            No credentials stored yet. Vault entries are sealed per-workspace
            and injected into agent sessions per action — the write path opens
            with the execution-plane milestone, and the ledger is already
            schema-ready with rotation timestamps.
          </p>
        ) : (
          <ul className="mt-4 divide-y">
            {vaultEntries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                <span className="flex-1 font-medium">{entry.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{entry.domain}</span>
                <span className="text-xs text-muted-foreground">
                  {entry.scopes.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner && <DeleteWorkspaceForm slug={workspace.slug} />}
    </div>
  );
}
