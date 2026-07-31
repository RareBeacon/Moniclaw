import { db } from "@/lib/db";
import { CueError } from "@cue/index";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/browser/api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/browser/executions/[id]/resume — resume a parked execution once
 * its approval gate is APPROVED (via the Approvals page). REJECTED approvals
 * cancel the execution.
 */
export async function POST(request: Request, { params }: Params) {
  const g = await guard(request, "browser.execute");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const execution = await runtime.executions.get(id, g.principal.workspace.id);
    if (!execution.approvalId) throw new CueError("invalid_state", "Execution is not parked on an approval.");
    const approval = await db.approval.findFirst({
      where: { id: execution.approvalId, workspaceId: g.principal.workspace.id },
    });
    if (!approval) throw new CueError("invalid_state", "Linked approval not found.");
    if (approval.status === "REJECTED") {
      await runtime.executions.cancel(id, g.principal.workspace.id).catch(() => {});
      throw new CueError("policy_denied", "Approval was rejected — execution cancelled.");
    }
    if (approval.status !== "APPROVED") {
      throw new CueError("invalid_state", `Approval is still ${approval.status.toLowerCase()} — decide it on the Approvals page first.`);
    }
    const row = await runtime.executions.resume(id, g.principal.workspace.id);
    return ok({ execution: row });
  } catch (err) {
    return errorResponse(err);
  }
}
