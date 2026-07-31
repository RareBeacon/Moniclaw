import type { AuditSinkPort } from "../ports";

/**
 * Engine audit vocabulary — every state-changing engine operation emits one
 * entry through the AuditSinkPort (wired to the workspace audit log).
 */
export const CUE_AUDIT_ACTIONS = {
  sessionCreate: "browser.session.create",
  sessionClose: "browser.session.close",
  sessionRecover: "browser.session.recover",
  executionStart: "browser.execution.start",
  executionCancel: "browser.execution.cancel",
  executionFinish: "browser.execution.finish",
  actionRisky: "browser.action.risky",
  approvalRequest: "browser.approval.request",
  policyUpdate: "browser.policy.update",
  settingsUpdate: "browser.settings.update",
  profileCreate: "browser.profile.create",
  profileDelete: "browser.profile.delete",
  downloadIngest: "browser.download.ingest",
  downloadDelete: "browser.download.delete",
  uploadStore: "browser.upload.store",
  uploadDelete: "browser.upload.delete",
  screenshotDelete: "browser.screenshot.delete",
} as const;

export type CueAuditAction = (typeof CUE_AUDIT_ACTIONS)[keyof typeof CUE_AUDIT_ACTIONS];

/** AuditService — thin, never-throwing emitter over the injected sink. */
export class AuditService {
  constructor(private readonly sink: AuditSinkPort) {}

  async record(input: {
    workspaceId: string;
    actorId: string | null;
    action: CueAuditAction;
    targetType: "session" | "execution" | "profile" | "download" | "upload" | "screenshot" | "policy" | "settings";
    targetId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.sink.record({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        metadata: input.metadata,
      });
    } catch {
      // Audit must never break the engine path — the app sink logs failures.
    }
  }
}
