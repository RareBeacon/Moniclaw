import type { Metadata } from "next";

import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FileText } from "lucide-react";
import { formatRelative } from "@/lib/format";
import { PromptEditor, PublishVersionButton, DeleteVersionButton } from "@/components/dashboard/ai/prompt-forms";

export const metadata: Metadata = {
  title: "Prompts",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const KINDS = ["SYSTEM", "WORKSPACE", "AGENT", "TASK"] as const;

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "ai.prompts.manage")) return <AccessDenied required="Member" />;

  const { kind } = await searchParams;
  const activeKind = KINDS.includes(kind as never) ? kind : null;

  const versions = await db.promptTemplate.findMany({
    where: {
      workspaceId: workspace.id,
      ...(activeKind ? { kind: activeKind as (typeof KINDS)[number] } : {}),
    },
    orderBy: [{ templateKey: "asc" }, { version: "desc" }],
  });

  // Group versions under their template key.
  const families = new Map<string, typeof versions>();
  for (const v of versions) {
    const list = families.get(v.templateKey) ?? [];
    list.push(v);
    families.set(v.templateKey, list);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Prompt Manager</h1>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Versioned, testable prompt templates with typed variables. Publishing
        a version archives the previous live one — roll back by publishing an
        older version.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Chip href="/dashboard/prompts" active={!activeKind} label="All kinds" />
        {KINDS.map((k) => (
          <Chip key={k} href={`/dashboard/prompts?kind=${k}`} active={activeKind === k} label={k.toLowerCase()} />
        ))}
      </div>

      <section className="mt-6 rounded-2xl border bg-card p-6" aria-label="New template">
        <h2 className="text-sm font-semibold">New template &amp; test bench</h2>
        <PromptEditor />
      </section>

      <section className="mt-10" aria-label="Templates">
        {families.size === 0 ? (
          <EmptyState
            icon={FileText}
            title="No prompt templates yet"
            description="Create your first template above. Layer it later as a system, workspace, agent, or task prompt — variables render with strict validation."
          />
        ) : (
          <ul className="space-y-6">
            {[...families.entries()].map(([key, list]) => {
              const published = list.find((v) => v.status === "PUBLISHED");
              return (
                <li key={key} className="rounded-2xl border bg-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{list[0].name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {list[0].kind.toLowerCase()} · {list.length} version{list.length === 1 ? "" : "s"}
                        {published ? ` · live: v${published.version}` : " · no live version"}
                      </p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-2">
                    {list.slice(0, 6).map((v) => (
                      <li
                        key={v.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs">v{v.version}</span>
                          <StatusPill status={v.status} />
                          <span className="max-w-md truncate text-muted-foreground">
                            {v.content.slice(0, 90)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{formatRelative(v.createdAt)}</span>
                          {v.status !== "PUBLISHED" && (
                            <PublishVersionButton id={v.id} />
                          )}
                          {v.status === "DRAFT" && <DeleteVersionButton id={v.id} />}
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tones: Record<string, string> = {
    PUBLISHED: "bg-emerald-500/10 text-emerald-600",
    DRAFT: "bg-amber-500/10 text-amber-600",
    ARCHIVED: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[status] ?? "bg-muted"}`}>
      {status.toLowerCase()}
    </span>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <a
      href={href}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-accent"
      }`}
    >
      {label}
    </a>
  );
}
