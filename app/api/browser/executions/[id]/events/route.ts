import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/browser/executions/[id]/events?afterSeq=&limit= — the action trail. */
export async function GET(request: Request, { params }: Params) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    await runtime.executions.get(id, g.principal.workspace.id); // 404 guard
    const url = new URL(request.url);
    const afterSeq = Number(url.searchParams.get("afterSeq") ?? 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);
    const events = await runtime.executions.events(id, { ...(afterSeq ? { afterSeq } : {}), limit });
    return ok({ events });
  } catch (err) {
    return errorResponse(err);
  }
}
