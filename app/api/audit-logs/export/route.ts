import { db } from "@/lib/db";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { errorResponse, guard, isGuarded } from "@/lib/agents/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE = 1_000;
/** Hard ceiling per export — beyond this the stream closes with a meta line. */
const MAX_ROWS = 50_000;

/**
 * GET /api/audit-logs/export — stream the workspace's audit ledger as NDJSON
 * (one event per line, chronological). MANAGER+ only (audit.read), session or
 * scoped key; rate-limited with the shared `export` bucket (12/hr/workspace).
 *
 * Streaming with cursor pagination keeps memory flat regardless of ledger
 * size — a Governance-grade export must never OOM a serverless instance.
 */
export async function GET(request: Request) {
  const g = await guard(request, "audit.read", { rate: "export" });
  if (isGuarded(g)) return g.response;

  const workspaceId = g.principal.workspace.id;

  try {
    await audit({
      workspaceId,
      actorId: g.principal.userId,
      action: AUDIT_ACTIONS.auditExport,
      targetType: "workspace",
      targetId: workspaceId,
      metadata: { via: g.principal.via },
    });

    const encoder = new TextEncoder();
    let cursor: string | null = null;
    let sent = 0;

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (sent >= MAX_ROWS) {
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "__meta", truncated: true, exportedRows: sent }) + "\n")
            );
            controller.close();
            return;
          }
          const rows = await db.auditLog.findMany({
            where: { workspaceId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: PAGE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          });
          if (rows.length === 0) {
            if (sent === 0) {
              controller.enqueue(
                encoder.encode(JSON.stringify({ type: "__meta", truncated: false, exportedRows: 0 }) + "\n")
              );
            }
            controller.close();
            return;
          }
          for (const row of rows) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  id: row.id,
                  at: row.createdAt.toISOString(),
                  action: row.action,
                  actorId: row.actorId,
                  targetType: row.targetType,
                  targetId: row.targetId,
                  ip: row.ip,
                  userAgent: row.userAgent,
                  metadata: row.metadata,
                }) + "\n"
              )
            );
          }
          sent += rows.length;
          cursor = rows[rows.length - 1]!.id;
          if (rows.length < PAGE) controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="moniclaw-audit-${stamp}.ndjson"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
