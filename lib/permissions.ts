import type { MembershipRole } from "@prisma/client";

/**
 * RBAC permission engine.
 *
 * Model: roles are ordered ranks; each action declares the minimum rank
 * required. Owner-only operations are declared separately because they must
 * never be reachable by "rank >= X" logic alone. Adding a capability is a
 * one-line change here — the UI and every server action consult this module.
 */

const RANK: Record<MembershipRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  MANAGER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export type Action =
  | "agents.read"
  | "agents.create"
  | "agents.run"
  | "agents.promote"
  | "agents.archive"
  | "approvals.read"
  | "approvals.decide"
  | "knowledge.read"
  | "knowledge.write"
  | "knowledge.delete"
  | "files.read"
  | "files.export"
  | "files.delete"
  | "usage.read"
  | "analytics.read"
  | "audit.read"
  | "members.read"
  | "members.invite"
  | "members.role"
  | "members.remove"
  | "settings.edit"
  | "billing.manage"
  | "apikeys.manage"
  | "ai.chat"
  | "ai.providers.manage"
  | "ai.settings.manage"
  | "ai.prompts.manage"
  | "ai.memory.read"
  | "ai.memory.write"
  | "ai.memory.delete"
  | "ai.workflows.manage"
  | "ai.workflows.run"
  | "browser.read"
  | "browser.execute"
  | "browser.profiles.manage"
  | "browser.downloads.manage"
  | "browser.settings.manage"
  | "browser.policy.manage"
  | "workspace.delete";

const MIN_RANK: Record<Exclude<Action, "workspace.delete">, MembershipRole> = {
  "agents.read": "VIEWER",
  "agents.create": "MEMBER",
  "agents.run": "MEMBER",
  "agents.promote": "MANAGER",
  "agents.archive": "MANAGER",
  "approvals.read": "VIEWER",
  "approvals.decide": "MANAGER",
  "knowledge.read": "VIEWER",
  "knowledge.write": "MEMBER",
  "knowledge.delete": "MANAGER",
  "files.read": "VIEWER",
  "files.export": "MEMBER",
  "files.delete": "MANAGER",
  "usage.read": "VIEWER",
  "analytics.read": "VIEWER",
  "audit.read": "MANAGER",
  "members.read": "VIEWER",
  "members.invite": "ADMIN",
  "members.role": "ADMIN",
  "members.remove": "ADMIN",
  "settings.edit": "ADMIN",
  "billing.manage": "OWNER",
  "apikeys.manage": "ADMIN",
  "ai.chat": "MEMBER",
  "ai.providers.manage": "ADMIN",
  "ai.settings.manage": "ADMIN",
  "ai.prompts.manage": "MEMBER",
  "ai.memory.read": "MEMBER",
  "ai.memory.write": "MEMBER",
  "ai.memory.delete": "MANAGER",
  "ai.workflows.manage": "MEMBER",
  "ai.workflows.run": "MEMBER",
  "browser.read": "VIEWER",
  "browser.execute": "MEMBER",
  "browser.profiles.manage": "MEMBER",
  "browser.downloads.manage": "MANAGER",
  "browser.settings.manage": "ADMIN",
  "browser.policy.manage": "ADMIN",
};

/** Actions that no rank escalation may grant — owner identity only. */
const OWNER_ONLY: ReadonlySet<Action> = new Set<Action>(["workspace.delete"]);

export function can(role: MembershipRole, action: Action): boolean {
  if (OWNER_ONLY.has(action)) return role === "OWNER";
  return RANK[role] >= RANK[MIN_RANK[action as keyof typeof MIN_RANK]];
}

/** True when `actor` may manage `target` for role/removal decisions. */
export function canManageMember(
  actorRole: MembershipRole,
  targetRole: MembershipRole
): boolean {
  if (targetRole === "OWNER") return false; // ownership is transferred, never edited
  return RANK[actorRole] >= RANK.ADMIN && RANK[actorRole] > RANK[targetRole] || actorRole === "OWNER";
}

export function listActions(role: MembershipRole): Action[] {
  const actions = Object.keys(MIN_RANK) as Action[];
  return actions.filter((action) => can(role, action));
}

export const ROLE_LABELS: Record<MembershipRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

/** Human-readable capability summary, used on the Members page. */
export const ROLE_DESCRIPTIONS: Record<MembershipRole, string> = {
  OWNER: "Full control, including billing and workspace deletion.",
  ADMIN: "Manage members, settings, agents, and approvals.",
  MANAGER: "Run and promote agents, decide approvals, manage content.",
  MEMBER: "Create and run agents, contribute knowledge.",
  VIEWER: "Read-only access to agents, runs, and reports.",
};
