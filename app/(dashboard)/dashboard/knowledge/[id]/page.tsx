import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { formatDateTime } from "@/lib/format";
import {
  DeleteEntryButton,
  EditEntryForm,
} from "@/components/dashboard/knowledge-controls";

export const metadata: Metadata = {
  title: "Knowledge entry",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function KnowledgeEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;

  const entry = await db.knowledgeEntry.findFirst({
    where: { id, workspaceId: primary.workspace.id, deletedAt: null },
    include: { createdBy: { select: { name: true, email: true } } },
  });
  if (!entry) notFound();

  const canWrite = can(primary.role, "knowledge.write");
  const canDelete =
    entry.createdById === user.id || can(primary.role, "knowledge.delete");

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/knowledge"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All knowledge
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{entry.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            by {entry.createdBy?.name ?? entry.createdBy?.email ?? "Unknown"} ·
            created {formatDateTime(entry.createdAt)} · updated{" "}
            {formatDateTime(entry.updatedAt)}
          </p>
        </div>
        <DeleteEntryButton entryId={entry.id} canDelete={canDelete} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {entry.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
            #{tag}
          </span>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border bg-card p-6 sm:p-8">
        {canWrite ? (
          <EditEntryForm entry={{ id: entry.id, title: entry.title, body: entry.body, tags: entry.tags }} />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">
            {entry.body}
          </p>
        )}
      </div>
    </div>
  );
}
