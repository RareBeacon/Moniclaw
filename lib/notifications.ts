import { db } from "@/lib/db";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { rateLimitAlertCopy, rateLimitDedupKey, RATE_LIMIT_HREF } from "@/lib/ai/key-rotation";

/**
 * In-app operational notifications. Producers dedup on `dedupKey` against
 * UNREAD rows: if the workspace hasn't acknowledged the previous alert, a
 * flapping condition must not stack duplicates in the bell.
 */

export async function notifyRateLimitedKey(input: {
  workspaceId: string;
  configId: string;
  label: string;
  provider: string;
  until: Date;
  error?: string;
}): Promise<boolean> {
  const dedupKey = rateLimitDedupKey(input.configId);
  try {
    const existing = await db.notification.findFirst({
      where: { workspaceId: input.workspaceId, dedupKey, readAt: null },
      select: { id: true },
    });
    if (existing) return false;

    const copy = rateLimitAlertCopy(
      { label: input.label, provider: input.provider },
      input.until
    );
    await db.notification.create({
      data: {
        workspaceId: input.workspaceId,
        kind: copy.kind,
        title: copy.title,
        body: copy.body,
        dedupKey,
        href: copy.href,
      },
    });
    await audit({
      workspaceId: input.workspaceId,
      action: AUDIT_ACTIONS.aiProviderUpdate,
      targetType: "ai_provider",
      targetId: input.label,
      metadata: {
        auto: "rate_limited",
        provider: input.provider.toLowerCase(),
        rateLimitedUntil: input.until.toISOString(),
        error: (input.error ?? "").slice(0, 200),
      },
    });
    return true;
  } catch (err) {
    // Alerting must never break the request path that triggered it.
    console.warn("[notifications] rate-limit alert failed:", (err as Error).message);
    return false;
  }
}

export async function listNotifications(workspaceId: string, take = 15) {
  const [items, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        href: true,
        readAt: true,
        createdAt: true,
      },
    }),
    db.notification.count({ where: { workspaceId, readAt: null } }),
  ]);
  return { items, unreadCount };
}

/** Mark read — ids scoped to the workspace; no ids = mark everything read. */
export async function markNotificationsRead(workspaceId: string, ids?: string[]): Promise<number> {
  const result = await db.notification.updateMany({
    where: {
      workspaceId,
      readAt: null,
      ...(ids?.length ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });
  return result.count;
}

export { RATE_LIMIT_HREF };
