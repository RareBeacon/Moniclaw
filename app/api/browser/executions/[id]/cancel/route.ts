import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/browser/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

/** POST /api/browser/executions/[id]/cancel — cooperative cancellation. */
export async function POST(request: Request, { params }: Params) {
  const g = await guard(request, "browser.execute");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const row = await runtime.executions.cancel(id, g.principal.workspace.id);
    return ok({ execution: row });
  } catch (err) {
    return errorResponse(err);
  }
}
