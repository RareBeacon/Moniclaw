import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/agents/api";
import { listNotifications, markNotificationsRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * GET  /api/notifications — latest 15 alerts + unread count (any member).
 * POST /api/notifications — mark read: { ids?: string[] } (no ids = all).
 * Read-side; alerts are produced by platform hooks (e.g. key rotation).
 */
export async function GET(request: Request) {
  const g = await guard(request, "agents.read");
  if (isGuarded(g)) return g.response;
  try {
    const { items, unreadCount } = await listNotifications(g.principal.workspace.id);
    return ok({
      notifications: items.map((n) => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() ?? null,
      })),
      unreadCount,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  const g = await guard(request, "agents.read");
  if (isGuarded(g)) return g.response;
  try {
    const body = (await readJson(request)) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((v): v is string => typeof v === "string").slice(0, 100)
      : undefined;
    const marked = await markNotificationsRead(g.principal.workspace.id, ids);
    return ok({ marked });
  } catch (err) {
    return errorResponse(err);
  }
}
