import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, guard, isGuarded, ok, fail } from "@/lib/browser/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/** GET /api/browser/sessions/[id] — session detail (+ live flag, tabs). */
export async function GET(request: Request, { params }: Params) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const row = await runtime.sessions.get(id, g.principal.workspace.id);
    if (!row) return fail(404, "session_not_found", "Session not found in this workspace.");
    const handle = runtime.sessions.liveHandle(id);
    const tabs = handle ? await handle.tabs().catch(() => null) : null;
    return ok({ session: { ...row, live: runtime.sessions.isLive(id) }, tabs });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/browser/sessions/[id] — close + release (profile write-back). */
export async function DELETE(request: Request, { params }: Params) {
  const g = await guard(request, "browser.execute");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const row = await runtime.sessions.get(id, g.principal.workspace.id);
    if (!row) return fail(404, "session_not_found", "Session not found in this workspace.");
    await runtime.sessions.close(id, g.principal.workspace.id, { reason: "closed via API" });
    return ok({ closed: true, id });
  } catch (err) {
    return errorResponse(err);
  }
}
