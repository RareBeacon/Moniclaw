import { verifyConnection } from "@/lib/email/connections";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { emailConnectionVerifyApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/sales/email/connections/[id]/verify — SMTP handshake; when
 * `testTo` is provided a real test email is delivered too. The outcome is
 * stamped on the connection (VERIFIED/FAILED + lastError) — failures are
 * honest, never hidden.
 */
export async function POST(request: Request, ctx: Ctx) {
  const g = await guard(request, "sales.settings.manage", { rate: "salesEmailVerify" });
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await ctx.params;
    const input = emailConnectionVerifyApiSchema.parse(await readJson(request));
    const result = await verifyConnection(g.principal.workspace.id, g.principal.userId, id, {
      ...(input.testTo ? { testTo: input.testTo } : {}),
    });
    return ok({ result }, { status: result.status === "VERIFIED" ? 200 : 502 });
  } catch (err) {
    return errorResponse(err);
  }
}
