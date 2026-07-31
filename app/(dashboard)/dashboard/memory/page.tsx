import type { Metadata } from "next";

import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { getRuntime } from "@/lib/ai/runtime";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { formatRelative } from "@/lib/format";
import { Brain } from "lucide-react";
import {
  MemorySearchForm,
  WriteMemoryForm,
  ForgetMemoryButton,
} from "@/components/dashboard/ai/memory-forms";

export const metadata: Metadata = {
  title: "Memory",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const SCOPES = ["CONVERSATION", "WORKSPACE", "AGENT", "LONG_TERM"] as const;

export default async function MemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "ai.memory.read")) return <AccessDenied required="Member" />;

  const { scope } = await searchParams;
  const activeScope = SCOPES.includes(scope as never) ? scope : null;

  const runtime = getRuntime();
  const [stats, records] = await Promise.all([
    runtime.memory.stats(workspace.id),
    db.memoryRecord.findMany({
      where: {
        workspaceId: workspace.id,
        ...(activeScope ? { scope: activeScope as (typeof SCOPES)[number] } : {}),
      },
      orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
      take: 60,
    }),
  ]);

  const canWrite = can(role, "ai.memory.write");
  const canDelete = can(role, "ai.memory.delete");

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Memory Explorer</h1>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Everything the runtime remembers for this workspace — scoped,
        searchable by meaning, with expiration policies.
      </p>

      <section className="mt-6 grid gap-3 sm:grid-cols-4" aria-label="Memory stats">
        <Stat label="Total records" value={stats.total.toLocaleString()} />
        <Stat label="Vectorized" value={`${stats.withEmbeddings.toLocaleString()}`} />
        <Stat label="Long-term" value={(stats.byScope.LONG_TERM ?? 0).toLocaleString()} />
        <Stat label="Workspace" value={(stats.byScope.WORKSPACE ?? 0).toLocaleString()} />
      </section>

      <section className="mt-8 rounded-2xl border bg-card p-6" aria-label="Semantic search">
        <h2 className="text-sm font-semibold">Semantic recall</h2>
        <MemorySearchForm />
      </section>

      {canWrite && (
        <section className="mt-8 rounded-2xl border bg-card p-6" aria-label="Write memory">
          <h2 className="text-sm font-semibold">Store a memory</h2>
          <WriteMemoryForm />
        </section>
      )}

      <section className="mt-8" aria-label="Records">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip href="/dashboard/memory" active={!activeScope} label="All" />
          {SCOPES.map((s) => (
            <FilterChip key={s} href={`/dashboard/memory?scope=${s}`} active={activeScope === s} label={s.replace("_", " ").toLowerCase()} />
          ))}
        </div>

        {records.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed bg-card/50 p-12 text-center">
            <Brain className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No memories yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Store facts directly, or let conversations and workflows build
              memory over time.
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {records.map((record) => (
              <li key={record.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm leading-6">{record.content}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <ScopeBadge scope={record.scope} />
                      <span>importance {record.importance}</span>
                      <span>{formatRelative(record.createdAt)}</span>
                      {record.embeddingModel && <span className="text-emerald-600">vectorized</span>}
                      {record.expiresAt && (
                        <span>expires {formatRelative(record.expiresAt)}</span>
                      )}
                      {record.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                          {tag}
                        </span>
                      ))}
                    </p>
                  </div>
                  {canDelete && <ForgetMemoryButton id={record.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
  const tones: Record<string, string> = {
    CONVERSATION: "bg-sky-500/10 text-sky-600",
    WORKSPACE: "bg-violet-500/10 text-violet-600",
    AGENT: "bg-amber-500/10 text-amber-600",
    LONG_TERM: "bg-emerald-500/10 text-emerald-600",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[scope] ?? "bg-muted"}`}>
      {scope.replace("_", "-").toLowerCase()}
    </span>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
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
