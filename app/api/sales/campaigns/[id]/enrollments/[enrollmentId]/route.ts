import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { enrollmentStatusApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; enrollmentId: string }> };

/** PATCH …/enrollments/[enrollmentId] — pause / resume / unsubscribe. */
export async function PATCH(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.campaigns.manage");
  if (isGuarded(g)) return g.response;
  try {
    const { id, enrollmentId } = await ctx.params;
    const { status } = enrollmentStatusApiSchema.parse(await readJson(request));
    await getSalesRuntime().campaignsEngine.setEnrollmentStatus(
      g.principal.workspace.id, g.principal.userId, id, enrollmentId, status
    );
    return ok({ enrollmentId, status });
  } catch (err) {
    return errorResponse(err);
  }
}
