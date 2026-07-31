import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, fail, guard, isGuarded, ok } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/browser/sessions/[id]/tabs — live tab list for a session. */
export async function GET(request: Request, { params }: Params) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const row = await runtime.sessions.get(id, g.principal.workspace.id);
    if (!row) return fail(404, "session_not_found", "Session not found in this workspace.");
    const handle = runtime.sessions.liveHandle(id);
    if (!handle) return ok({ tabs: null, live: false, message: "Session process not live in this instance." });
    return ok({ tabs: await handle.tabs(), live: true });
  } catch (err) {
    return errorResponse(err);
  }
}
