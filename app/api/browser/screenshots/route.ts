import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

/** GET /api/browser/screenshots?executionId=&sessionId= — list captures. */
export async function GET(request: Request) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const url = new URL(request.url);
    const runtime = getBrowserRuntime();
    const screenshots = await runtime.screenshots.list(g.principal.workspace.id, {
      ...(url.searchParams.get("executionId") ? { executionId: url.searchParams.get("executionId")! } : {}),
      ...(url.searchParams.get("sessionId") ? { sessionId: url.searchParams.get("sessionId")! } : {}),
      limit: 100,
    });
    return ok({
      screenshots: screenshots.map((s) => ({ ...s, imageUrl: `/api/browser/screenshots/${s.id}/image` })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
