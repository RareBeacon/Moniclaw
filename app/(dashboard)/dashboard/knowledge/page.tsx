import type { Metadata } from "next";

import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { KnowledgeBoard } from "@/components/dashboard/knowledge-controls";

export const metadata: Metadata = {
  title: "Knowledge",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary) return null;

  const entries = await db.knowledgeEntry.findMany({
    where: { workspaceId: primary.workspace.id, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: { createdBy: { select: { name: true, email: true } } },
  });

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
    </div>
  );
}
