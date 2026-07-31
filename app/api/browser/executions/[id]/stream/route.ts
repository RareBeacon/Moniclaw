import { getBrowserRuntime } from "@/lib/browser/runtime";
import { guard, isGuarded } from "@/lib/browser/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

/**
 * GET /api/browser/executions/[id]/stream — Server-Sent Events.
 *
 * Streams {type:"status"|"step"|"recovery"|"gate"} frames as they persist.
 * DB action-event rows are the canonical source (works across instances);
 * polling every 700ms with an idempotent seen-set, 55s hard cap per Vercel.
 */
export async function GET(request: Request, { params }: Params) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;

  const { id } = await params;
  const runtime = getBrowserRuntime();
  const execution = await runtime.executions.get(id, g.principal.workspace.id).catch(() => null);
  if (!execution) {
    return Response.json({ ok: false, error: "execution_not_found", message: "Execution not found in this workspace." }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const workspaceId = g.principal.workspace.id;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      const seen = new Set<string>();
      let lastStatus: string | null = null;
      let closed = false;

      const poll = async (): Promise<void> => {
        try {
          const row = await runtime.repos.executions.get(id, workspaceId);
          if (!row) { send({ type: "error", message: "execution disappeared" }); return; }
          if (row.status !== lastStatus) {
            lastStatus = row.status;
            send({ type: "status", status: row.status, error: row.error ?? undefined, failedStep: row.failedStep ?? undefined });
          }
          const events = await runtime.repos.events.listForExecution(id, { limit: 500 });
          for (const event of events) {
            if (seen.has(event.id)) continue;
            seen.add(event.id);
            send({
              type: "step",
              seq: event.seq,
              attempt: event.attempt,
              action: event.action,
              status: event.status,
              durationMs: event.durationMs ?? undefined,
              error: event.error ?? undefined,
              healed: Boolean(event.healedFrom),
              screenshotId: event.screenshotId ?? undefined,
            });
          }
          if (TERMINAL.has(row.status)) {
            send({ type: "done", status: row.status, result: row.result ?? undefined });
            closed = true;
          }
        } catch (err) {
          send({ type: "error", message: (err as Error).message.slice(0, 200) });
        }
      };

      send({ type: "status", status: execution.status });
      lastStatus = execution.status;

      const deadline = Date.now() + 55_000;
      while (!closed && Date.now() < deadline && !request.signal.aborted) {
        await poll();
        if (closed) break;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      if (!closed) send({ type: "timeout", message: "Stream window closed (55s). Reconnect to continue watching." });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
