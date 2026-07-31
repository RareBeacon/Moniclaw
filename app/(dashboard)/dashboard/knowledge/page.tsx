import type { Metadata } from "next";

import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { KnowledgeBoard } from "@/components/dashboard/knowledge-controls";
import {
  DeleteDocumentButton,
  KnowledgeUploadForm,
  KnowledgeUrlForm,
} from "@/components/dashboard/ai/knowledge-forms";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = {
  title: "Knowledge",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary) return null;

  const [entries, documents] = await Promise.all([
    db.knowledgeEntry.findMany({
      where: { workspaceId: primary.workspace.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: { createdBy: { select: { name: true, email: true } } },
    }),
    db.knowledgeDocument.findMany({
      where: { workspaceId: primary.workspace.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The canonical operational notes agents cite and humans align on —
        policies, thresholds, vendor quirks. Write it once, use it in every run.
      </p>
      <KnowledgeBoard
        canWrite={can(primary.role, "knowledge.write")}
        entries={entries.map((entry) => ({
          id: entry.id,
          title: entry.title,
          body: entry.body,
          tags: entry.tags,
          updatedAt: entry.updatedAt,
          author: entry.createdBy?.name ?? entry.createdBy?.email ?? null,
        }))}
      />

      <section className="mt-12" aria-label="Knowledge base documents">
        <h2 className="text-sm font-semibold">Knowledge base (AI retrieval)</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Documents indexed for semantic search — the runtime retrieves these
          chunks when agents, workflows, and the <code className="font-mono text-xs">knowledge_search</code>{" "}
          tool need grounding.
        </p>

        <div className="mt-4 space-y-4 rounded-2xl border bg-card p-6">
          {can(primary.role, "knowledge.write") ? (
            <>
              <KnowledgeUploadForm />
              <div className="border-t pt-4">
                <KnowledgeUrlForm />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Indexing requires the Member role.
            </p>
          )}
        </div>

        {documents.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed bg-card/50 px-5 py-8 text-center text-sm text-muted-foreground">
            Nothing indexed yet. Upload a handbook or point at your docs site —
            duplicates are detected by content checksum.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{doc.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {doc.source === "URL" ? (doc.sourceUrl ?? "web page") : doc.filename} ·{" "}
                    {(doc.sizeBytes / 1024).toFixed(1)} KB · {doc.chunkCount} chunks ·{" "}
                    {formatRelative(doc.createdAt)}
                  </p>
                  {doc.error && (
                    <p className="mt-0.5 text-xs text-red-600">{doc.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <DocStatusPill status={doc.status} />
                  <DeleteDocumentButton
                    id={doc.id}
                    disabled={!can(primary.role, "knowledge.delete")}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DocStatusPill({ status }: { status: string }) {
  const tones: Record<string, string> = {
    READY: "bg-emerald-500/10 text-emerald-600",
    PROCESSING: "bg-amber-500/10 text-amber-600",
    UPLOADED: "bg-muted text-muted-foreground",
    FAILED: "bg-red-500/10 text-red-600",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status.toLowerCase()}
    </span>
  );
}
