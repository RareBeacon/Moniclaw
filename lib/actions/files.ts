"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { checkPermission, resolveWorkspaceContext } from "@/lib/workspace";
import { EXPORT_MAX_BYTES } from "@/lib/validations/workspace";

export type FilesActionState = { error?: string; ok?: boolean };

function csvEscape(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Generate a usage export (runs ledger, last 90 days) as a downloadable CSV,
 * stored as an EXPORT asset. Generation is permission-gated + rate-limited,
 * and recorded in the audit trail.
 */
export async function generateUsageExport(): Promise<FilesActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const denied = checkPermission(ctx, "files.export");
  if (denied) return { error: denied };

  const gate = rateLimit(
    `export:${ctx.workspace.id}`,
    RATE_LIMITS.export.limit,
    RATE_LIMITS.export.windowMs
  );
  if (!gate.success) {
    return { error: `Export rate limit reached. Try again in ${gate.retryAfterSeconds}s.` };
  }

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const runs = await db.agentRun.findMany({
    where: { workspaceId: ctx.workspace.id, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: { agent: { select: { name: true, slug: true } } },
  });

  const header =
    "run_id,agent,agent_slug,status,mode,trigger,credits,started_at,finished_at,error\n";
  const rows = runs
    .map((run) =>
      [
        run.id,
        csvEscape(run.agent.name),
        run.agent.slug,
        run.status,
        run.mode,
        run.triggerSource,
        run.creditsUsed,
        run.startedAt?.toISOString() ?? "",
        run.finishedAt?.toISOString() ?? "",
        csvEscape(run.error ?? ""),
      ].join(",")
    )
    .join("\n");

  const csv = header + rows + "\n";
  const bytes = Buffer.from(csv, "utf-8");
  if (bytes.byteLength > EXPORT_MAX_BYTES) {
    return { error: "Export exceeds 512 KB — narrow the window. (Larger exports land with the data-warehouse connector.)" };
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const asset = await db.asset.create({
    data: {
      workspaceId: ctx.workspace.id,
      kind: "EXPORT",
      name: `usage-export-${stamp}.csv`,
      mimeType: "text/csv",
      sizeBytes: bytes.byteLength,
      content: bytes,
      createdById: ctx.user.id,
    },
  });

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.fileExport,
    targetType: "asset",
    targetId: asset.id,
    metadata: { rows: runs.length, bytes: bytes.byteLength },
  });

  revalidatePath("/dashboard/files");
  return { ok: true };
}

export async function deleteAsset(assetId: string): Promise<FilesActionState> {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error };
  const { ctx } = resolved;

  const asset = await db.asset.findFirst({
    where: { id: assetId, workspaceId: ctx.workspace.id },
  });
  if (!asset) return { error: "File not found." };

  if (asset.createdById !== ctx.user.id) {
    const denied = checkPermission(ctx, "files.delete");
    if (denied) return { error: denied };
  }

  await db.asset.delete({ where: { id: asset.id } });
  revalidatePath("/dashboard/files");
  return { ok: true };
}
