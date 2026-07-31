import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

/** GET /api/browser/logs?action=&status=&limit= — engine action log (timeline feed). */
export async function GET(request: Request) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const url = new URL(request.url);
    const runtime = getBrowserRuntime();
    const events = await runtime.repos.events.list(g.principal.workspace.id, {
      ...(url.searchParams.get("action") ? { action: url.searchParams.get("action")! } : {}),
      ...(url.searchParams.get("status") ? { status: url.searchParams.get("status")! } : {}),
      limit: Math.min(Number(url.searchParams.get("limit") ?? 100), 500),
    });
    return ok({ events });
  } catch (err) {
    return errorResponse(err);
  }
}
