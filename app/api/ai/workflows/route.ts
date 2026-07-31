import { z } from "zod";
import { db } from "@/lib/db";
import { ok, errorResponse, readJson } from "@/lib/ai/api";
import { requirePrincipal, resolveApiPrincipal } from "@/lib/api-auth";
import { workflowDefinitionSchema } from "@runtime/workflows/executor";

/** GET  /api/ai/workflows — list workflow definitions
 *  POST /api/ai/workflows — create (validated graph) */

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  definition: z.unknown(),
});

export async function GET(request: Request) {
  try {
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "ai.workflows.manage");
    if (guard) return guard;
    const workflows = await db.workflowDef.findMany({
      where: { workspaceId: principal!.workspace.id, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, name: true, description: true, status: true, version: true,
        updatedAt: true, createdAt: true,
        definition: true,
      },
    });
    return ok({
      workflows: workflows.map((w) => ({
        ...w,
        nodeCount: Array.isArray((w.definition as { nodes?: unknown[] })?.nodes)
          ? (w.definition as { nodes: unknown[] }).nodes.length
          : 0,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "ai.workflows.manage");
    if (guard) return guard;
    const parsed = createSchema.parse(await readJson(request, 512_000));
    const definition = workflowDefinitionSchema.parse(parsed.definition);
    const workflow = await db.workflowDef.create({
      data: {
        workspaceId: principal!.workspace.id,
        name: parsed.name,
        description: parsed.description ?? null,
        definition: definition as object,
        createdById: principal!.userId,
      },
    });
    return ok({ workflow: { id: workflow.id, name: workflow.name, status: workflow.status } }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
