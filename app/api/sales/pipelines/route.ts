import { SalesError } from "@sales/index";
import { audit } from "@/lib/audit";
import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { pipelineCreateApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

/** GET /api/sales/pipelines — all pipelines with stages (default ensured). */
export async function GET(request: Request) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const repos = getSalesRuntime().repos;
    await repos.pipelines.ensureDefault(g.principal.workspace.id);
    const pipelines = await repos.pipelines.list(g.principal.workspace.id);
    return ok({ pipelines });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/sales/pipelines — custom pipeline with ordered stages. */
export async function POST(request: Request) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const { name, stages } = pipelineCreateApiSchema.parse(await readJson(request));
    if (stages.some((s, i) => stages.findIndex((o) => o.name === s.name) !== i)) {
      throw new SalesError("validation", "Stage names must be unique within the pipeline.");
    }
    const pipeline = await getSalesRuntime().repos.pipelines.create(g.principal.workspace.id, name, stages);
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId,
      action: "sales.pipeline.create", targetType: "sales_pipeline", targetId: pipeline.id,
      metadata: { name, stages: stages.length },
    });
    return ok({ pipeline }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
