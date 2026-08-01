/**
 * Server-side helpers for the /dashboard/sales pages (server components).
 * Read paths only — all writes go through server actions or REST routes.
 */
import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { getSalesRuntime } from "@/lib/sales/runtime";
import type { MembershipRole, Workspace } from "@prisma/client";

export interface SalesPageContext {
  workspace: Workspace;
  role: MembershipRole;
  userId: string;
  canWrite: boolean;
  canManageCampaigns: boolean;
  canReviewDrafts: boolean;
  canManageSettings: boolean;
}

export type { CompanyInput } from "@sales/index";

export async function salesPageContext(): Promise<SalesPageContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const primary = await getPrimaryWorkspace(user.id);
  if (!primary) return null;
  const role = primary.role;
  return {
    workspace: primary.workspace,
    role,
    userId: user.id,
    canWrite: can(role, "sales.write"),
    canManageCampaigns: can(role, "sales.campaigns.manage"),
    canReviewDrafts: can(role, "sales.drafts.review"),
    canManageSettings: can(role, "sales.settings.manage"),
  };
}

export function salesRepos() {
  return getSalesRuntime().repos;
}

export function salesAnalytics() {
  return getSalesRuntime().analytics;
}

/** scoreReasons JSON → short readable bullets for the UI. */
export function scoreReasonsOf(value: unknown): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const reasons = (value as { reasons?: unknown }).reasons;
    if (Array.isArray(reasons)) return reasons.map(String).slice(0, 6);
  }
  return [];
}

export function sourcesOf(value: unknown): Array<{ url: string; title: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? item as { url?: unknown; title?: unknown } : null))
    .filter((item): item is { url: unknown; title: unknown } => !!item && typeof item.url === "string")
    .map((item) => ({ url: String(item.url), title: typeof item.title === "string" ? item.title : "" }))
    .slice(0, 20);
}

export function badgesForDraftStatus(status: string): { label: string; tone: "default" | "emerald" | "amber" | "red" | "blue" } {
  switch (status) {
    case "PENDING_REVIEW": return { label: "Pending review", tone: "amber" };
    case "APPROVED": return { label: "Approved", tone: "emerald" };
    case "SCHEDULED": return { label: "Scheduled", tone: "blue" };
    case "REJECTED": return { label: "Rejected", tone: "red" };
    case "SENT": return { label: "Sent", tone: "emerald" };
    case "FAILED": return { label: "Failed", tone: "red" };
    case "CANCELED": return { label: "Canceled", tone: "red" };
    default: return { label: "Draft", tone: "default" };
  }
}
