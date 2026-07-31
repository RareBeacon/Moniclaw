import { z } from "zod";
import { db } from "@/lib/db";
import { getRuntime } from "@/lib/ai/runtime";
import { ok, fail, errorResponse, readJson } from "@/lib/ai/api";
import { requirePrincipal, resolveApiPrincipal } from "@/lib/api-auth";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import type { WorkflowDefinition } from "@runtime/workflows/executor";
import type { WorkflowRunStatus } from "@prisma/client";

/** POST /api/ai/workflows/[id]/execute — run a workflow, persist run + trace. */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "ai.workflows.run");
    if (guard) return guard;

    const gate = rateLimit(
      `aiWorkflowRun:${principal!.workspace.id}`,
      RATE_LIMITS.aiWorkflowRun.limit,
      RATE_LIMITS.aiWorkflowRun.windowMs
    );
    if (!gate.success) {
      return fail(429, "rate_limited", `Workflow run quota hit. Retry in ${gate.retryAfterSeconds}s.`);
    }

    const definition = await db.workflowDef.findFirst({
      where: { id, workspaceId: principal!.workspace.id, deletedAt: null },
    });
    if (!definition) return fail(404, "not_found", "Workflow not found.");
    if (definition.status === "ARCHIVED") {
      return fail(409, "archived", "Archived workflows cannot be executed.");
    }

    const parsed = bodySchema.parse(await readJson(request, 512_000));
    const runtime = getRuntime();
    const started = Date.now();

    const run = await db.workflowRun.create({
      data: {
        workflowId: definition.id,
        workspaceId: principal!.workspace.id,
        status: "RUNNING",
        input: parsed.input as object,
        createdById: principal!.userId,
        triggerSource: principal!.via,
      },
    });

    try {
      const result = await runtime.workflows.run(
        { workspaceId: principal!.workspace.id, userId: principal!.userId, requestId: run.id, toolPermissions: (await runtimeSettings(principal!.workspace.id)) },
        definition.definition as WorkflowDefinition,
        parsed.input
      );

      const status: WorkflowRunStatus = result.status === "succeeded" ? "SUCCEEDED" : "FAILED";
      const finished = await db.workflowRun.update({
        where: { id: run.id },
        data: {
          status,
          output: result.output === null ? undefined : { text: result.output },
          trace: result.trace as unknown as object,
          error: result.status === "failed" ? (result.trace.find((t) => t.status === "failed")?.error ?? "failed") : null,
          finishedAt: new Date(),
        },
      });

      await audit({
        workspaceId: principal!.workspace.id,
        actorId: principal!.userId,
        action: "ai.workflow.run",
        targetType: "workflow_run",
        targetId: run.id,
        metadata: { workflow: definition.name, status, latencyMs: Date.now() - started },
      });

      return ok({
        runId: finished.id,
        status,
        output: result.output,
        trace: result.trace,
        latencyMs: Date.now() - started,
      });
    } catch (err) {
      await db.workflowRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          error: (err as Error).message.slice(0, 500),
          finishedAt: new Date(),
        },
      });
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}

async function runtimeSettings(workspaceId: string): Promise<Record<string, boolean>> {
  const settings = await db.aiWorkspaceSettings.findUnique({ where: { workspaceId } });
  return (settings?.toolPermissions ?? {}) as Record<string, boolean>;
}
