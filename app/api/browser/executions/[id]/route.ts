import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/browser/executions/[id] — execution detail + recent events. */
export async function GET(request: Request, { params }: Params) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const execution = await runtime.executions.get(id, g.principal.workspace.id);
    const events = await runtime.executions.events(id, { limit: 200 });
    return ok({ execution, events });
  } catch (err) {
    return errorResponse(err);
  }
}
