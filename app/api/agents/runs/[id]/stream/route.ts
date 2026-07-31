import { getAgentRuntime } from "@/lib/agents/runtime";
import { guard, isGuarded } from "@/lib/agents/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);
const POLL_MS = 700;
const MAX_WINDOW_MS = 55_000;

/**
 * GET /api/agents/runs/[id]/stream — SSE feed of the evidence trail.
 * DB-poll based (serverless-safe): new events streamed as they land; closes
 * with a final `end` message when the run is terminal and drained.
 */
export async function GET(request: Request, ctx: Ctx) {
  const g = await guard(request, "agents.read");
  if (isGuarded(g)) return g.response;

  const { id } = await ctx.params;
  const runtime = getAgentRuntime();
  const run = await runtime.repos.runs.get(g.principal.workspace.id, id);
  if (!run) {
    return Response.json({ ok: false, error: "not_found", message: "Run not found." }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let lastTs: Date | null = null;
  const seen = new Set<string>();
  let lastStatus = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("status", { status: run.status, runId: run.id });

      const tick = async (): Promise<void> => {
        try {
          const fresh = await runtime.repos.runs.get(g.principal.workspace.id, id);
          if (!fresh) { send("error", { error: "not_found" }); controller.close(); return; }
          if (fresh.status !== lastStatus) {
            lastStatus = fresh.status;
            send("status", { status: fresh.status, runId: fresh.id, stepsExecuted: fresh.stepsExecuted, tokensUsed: fresh.tokensUsed });
          }
          const events = await runtime.repos.events.list(id, {
            ...(lastTs ? { afterTs: lastTs } : {}),
            limit: 500,
          });
          for (const event of events) {
            if (seen.has(event.id)) continue;
            seen.add(event.id);
            send("event", event);
            lastTs = event.ts;
          }
          const terminalDrained = TERMINAL.has(fresh.status) && seen.size > 0;
          const emptyTerminal = TERMINAL.has(fresh.status);
          if (terminalDrained || emptyTerminal) {
            send("end", { status: fresh.status, runId: fresh.id });
            controller.close();
            return;
          }
          if (Date.now() - startedAt > MAX_WINDOW_MS) {
            send("end", { status: fresh.status, runId: fresh.id, windowClosed: true });
            controller.close();
            return;
          }
          setTimeout(() => void tick(), POLL_MS);
        } catch (err) {
          console.error("[api/agents/stream]", err);
          try { controller.close(); } catch { /* already closed */ }
        }
      };
      void tick();
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
