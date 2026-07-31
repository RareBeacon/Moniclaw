import { CueError } from "../errors";
import type { PolicyRepository, PolicyRow } from "../ports";
import type { ActionPermission } from "../types";
import { evaluateDomain, type DomainVerdict } from "./domains";

const READ_PERMISSIONS: ReadonlySet<ActionPermission> = new Set(["read"]);
const NAV_PERMISSIONS: ReadonlySet<ActionPermission> = new Set(["read", "navigate"]);

const GATE: Partial<Record<ActionPermission, keyof Pick<PolicyRow, "allowJavascript" | "allowDownloads" | "allowUploads" | "allowClipboard">>> = {
  javascript: "allowJavascript",
  "files:download": "allowDownloads",
  "files:upload": "allowUploads",
  clipboard: "allowClipboard",
};

/**
 * PermissionService — the single place that decides whether an action
 * permission or a navigation target is allowed under the workspace policy.
 * Actions/planner consult it; nothing else reads policy rows directly.
 */
export class PermissionService {
  constructor(private readonly policies: PolicyRepository) {}

  async policyFor(workspaceId: string): Promise<PolicyRow> {
    return this.policies.getPolicy(workspaceId);
  }

  /** Synchronous check against an already-fetched policy row. */
  canWith(policy: PolicyRow, permission: ActionPermission): { allowed: boolean; reason?: string } {
    if (policy.readOnly && !READ_PERMISSIONS.has(permission)) {
      return { allowed: false, reason: "Workspace policy is read-only (extraction/capture only)." };
    }
    if (policy.navigationOnly && !NAV_PERMISSIONS.has(permission)) {
      return { allowed: false, reason: "Workspace policy allows navigation only." };
    }
    const gate = GATE[permission];
    if (gate && !policy[gate]) {
      const labels: Record<string, string> = {
        allowJavascript: "JavaScript execution",
        allowDownloads: "Downloads",
        allowUploads: "Uploads",
        allowClipboard: "Clipboard",
      };
      return { allowed: false, reason: `${labels[gate]} is disabled by the workspace browser policy.` };
    }
    return { allowed: true };
  }

  /** Assert or throw policy_denied. */
  assertWith(policy: PolicyRow, permission: ActionPermission): void {
    const verdict = this.canWith(policy, permission);
    if (!verdict.allowed) {
      throw new CueError("policy_denied", verdict.reason ?? `Permission "${permission}" denied by workspace policy.`);
    }
  }

  async can(workspaceId: string, permission: ActionPermission): Promise<{ allowed: boolean; reason?: string }> {
    return this.canWith(await this.policyFor(workspaceId), permission);
  }

  async assert(workspaceId: string, permission: ActionPermission): Promise<void> {
    this.assertWith(await this.policyFor(workspaceId), permission);
  }

  /** Domain check for navigation targets (blocked > confirm > allowed > default). */
  checkDomain(policy: PolicyRow, url: string): DomainVerdict {
    return evaluateDomain(url, policy);
  }

  async checkUrl(workspaceId: string, url: string): Promise<DomainVerdict> {
    return this.checkDomain(await this.policyFor(workspaceId), url);
  }

  /** Risky-navigation gate: throws policy_denied or returns "confirm-required". */
  assertNavigation(policy: PolicyRow, url: string): { needsConfirmation: boolean; matched: string | null } {
    const verdict = evaluateDomain(url, policy);
    if (verdict.decision === "blocked") {
      throw new CueError("policy_denied", `Navigation to ${url} is blocked by workspace policy (rule: ${verdict.matched}).`);
    }
    return { needsConfirmation: verdict.decision === "confirm", matched: verdict.decision === "confirm" ? verdict.matched : null };
  }

  async save(policy: PolicyRow, updatedById: string): Promise<void> {
    return this.policies.savePolicy(policy, updatedById);
  }
}
