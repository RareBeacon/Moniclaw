import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/browser/executions/[id]/replay — the recording timeline with
 * screenshot references for the replay viewer.
 */
export async function GET(request: Request, { params }: Params) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const execution = await runtime.executions.get(id, g.principal.workspace.id);
    const recording = await runtime.recordings.getByExecution(id, g.principal.workspace.id);
    return ok({
      execution: {
        id: execution.id, status: execution.status, goal: execution.goal,
        steps: execution.stepCount, failedStep: execution.failedStep,
        startedAt: execution.startedAt, finishedAt: execution.finishedAt,
      },
      recording,
      frames: recording?.timeline ?? [],
    });
  } catch (err) {
    return errorResponse(err);
  }
}
