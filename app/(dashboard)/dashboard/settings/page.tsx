import type { Metadata } from "next";
import { KeyRound } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { formatDateTime } from "@/lib/format";
import { WorkspaceSettingsForm } from "@/components/dashboard/workspace-settings-form";

export const metadata: Metadata = {
  title: "Workspace settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary) return null;

  const [members, vaultEntries] = await Promise.all([
    db.membership.findMany({
      where: { workspaceId: primary.workspace.id },
      include: { user: { select: { name: true, email: true, image: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.vaultEntry.findMany({
      where: { workspaceId: primary.workspace.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const canEdit = primary.role !== "VIEWER";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Workspace identity, people, and secrets.
        </p>
      </div>

      {/* General */}
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-sm font-semibold">General</h2>
        <div className="mt-5">
          <WorkspaceSettingsForm
            currentName={primary.workspace.name}
            canEdit={canEdit}
          />
        </div>
        <p className="mt-4 font-mono text-[0.7rem] text-muted-foreground">
          slug: {primary.workspace.slug} · created {formatDateTime(primary.workspace.createdAt)}
        </p>
      </section>

      {/* Members */}
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-sm font-semibold">People</h2>
        <ul className="mt-4 divide-y">
          {members.map((member) => {
            const name = member.user.name ?? member.user.email ?? "Member";
            return (
              <li key={member.id} className="flex items-center gap-3 py-3">
                <span
                  aria-hidden
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-indigo-600/80 text-[0.65rem] font-semibold text-white"
                >
                  {name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.user.email}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  {member.role.toLowerCase()}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Invitations and role management ship with team workspaces (Starter
          accounts are single-seat). Growth plans include 10 seats.
        </p>
      </section>

      {/* Vault */}
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-primary" aria-hidden />
          Credential vault
        </h2>
        {vaultEntries.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            No credentials stored yet. Vault entries are sealed per-workspace
            and injected into agent sessions per action — the write path opens
            with the execution-plane milestone, and your ledger is already
            schema-ready.
          </p>
        ) : (
          <ul className="mt-4 divide-y">
            {vaultEntries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-3 text-sm">
                <span className="flex-1 font-medium">{entry.label}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {entry.domain}
                </span>
                <span className="text-xs text-muted-foreground">
                  {entry.scopes.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
