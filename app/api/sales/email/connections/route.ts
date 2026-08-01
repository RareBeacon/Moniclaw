import { createConnection, listConnections } from "@/lib/email/connections";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { emailConnectionCreateApiSchema, SES_REGIONS, sesSmtpHost } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

/**
 * GET /api/sales/email/connections — list workspace email identities.
 * NEVER exposes credentials (passwordEnc is never selected).
 * Response includes the SES region catalog + host presets so API/SDK
 * clients can render the same first-class SES connect flow as the UI.
 */
export async function GET(request: Request) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const connections = await listConnections(g.principal.workspace.id);
    return ok({
      connections,
      sesRegions: SES_REGIONS.map((region) => ({ region, smtpHost: sesSmtpHost(region) })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/sales/email/connections — connect SES or any SMTP identity. */
export async function POST(request: Request) {
  const g = await guard(request, "sales.settings.manage", { rate: "salesEmailConnection" });
  if (isGuarded(g)) return g.response;
  try {
    const input = emailConnectionCreateApiSchema.parse(await readJson(request));
    const connection = await createConnection(g.principal.workspace.id, g.principal.userId, input);
    return ok({ connection }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
