import { executionStartSchema } from "@cue/index";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/browser/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/browser/executions — list (filters: status, sessionId). */
export async function GET(request: Request) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const sessionId = url.searchParams.get("sessionId");
    const runtime = getBrowserRuntime();
    const executions = await runtime.executions.list(g.principal.workspace.id, {
      ...(status ? { status: status.split(",") as never } : {}),
      ...(sessionId ? { sessionId } : {}),
      limit: 50,
    });
    return ok({ executions });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/browser/executions — queue a validated step plan. */
export async function POST(request: Request) {
  const g = await guard(request, "browser.execute", { rate: "browserExecute" });
  if (isGuarded(g)) return g.response;
  try {
    const body = executionStartSchema.parse(await readJson(request));
    const runtime = getBrowserRuntime();
    const row = await runtime.executions.start({
      workspaceId: g.principal.workspace.id,
      userId: g.principal.userId,
      sessionId: body.sessionId,
      ...(body.goal ? { goal: body.goal } : {}),
      steps: body.steps,
    });
    return ok({ execution: row }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}
