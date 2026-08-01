import { audit } from "@/lib/audit";
import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { salesSettingsApiSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

/** GET /api/sales/settings — ICP, default send window, sender identity. */
export async function GET(request: Request) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const settings = await getSalesRuntime().repos.settings.get(g.principal.workspace.id);
    return ok({
      settings: settings ?? {
        icpProfile: { industries: [], sizes: [], geographies: [], keywords: [], roles: [] },
        defaultSendWindow: { daysOfWeek: [1, 2, 3, 4, 5], startHour: 9, endHour: 17, timezone: "UTC" },
        senderName: null,
        senderTitle: null,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PATCH /api/sales/settings — upsert; companies rescore lazily on read paths
 *  (rescore happens on company writes + research completion). */
export async function PATCH(request: Request) {
  const g = await guard(request, "sales.settings.manage");
  if (isGuarded(g)) return g.response;
  try {
    const patch = salesSettingsApiSchema.parse(await readJson(request));
    const settings = await getSalesRuntime().repos.settings.upsert(g.principal.workspace.id, {
      ...(patch.icpProfile !== undefined ? { icpProfile: patch.icpProfile } : {}),
      ...(patch.defaultSendWindow !== undefined ? { defaultSendWindow: patch.defaultSendWindow } : {}),
      ...(patch.senderName !== undefined ? { senderName: patch.senderName ?? null } : {}),
      ...(patch.senderTitle !== undefined ? { senderTitle: patch.senderTitle ?? null } : {}),
    });
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId,
      action: "sales.settings.update", targetType: "sales_settings",
      metadata: { fields: Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined) },
    });
    return ok({ settings });
  } catch (err) {
    return errorResponse(err);
  }
}
