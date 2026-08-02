import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { clientIp, clientUserAgent } from "@/lib/http";

/**
 * Append-only audit trail. Every mutating server action records a row.
 * Auditing must never break the business operation: failures are logged
 * to the server console, and the action continues.
 */

export const AUDIT_ACTIONS = {
  agentCreate: "agent.create",
  agentPromote: "agent.promote",
  agentRun: "agent.run",
  agentArchive: "agent.archive",
  approvalDecide: "approval.decide",
  memberInvite: "member.invite",
  memberInviteRevoke: "member.invite.revoke",
  memberRoleChange: "member.role.change",
  memberRemove: "member.remove",
  memberJoin: "member.join",
  ownershipTransfer: "workspace.ownership.transfer",
  settingsUpdate: "settings.update",
  workspaceDelete: "workspace.delete",
  knowledgeCreate: "knowledge.create",
  knowledgeUpdate: "knowledge.update",
  knowledgeDelete: "knowledge.delete",
  fileExport: "file.export",
  avatarUpdate: "user.avatar.update",
  passwordChange: "user.password.change",
  emailChange: "user.email.change",
  accountDelete: "user.account.delete",
  accountUnlink: "user.account.unlink",
  sessionsRevoke: "user.sessions.revoke",

  // AI Runtime (Phase 3)
  aiProviderCreate: "ai.provider.create",
  aiProviderUpdate: "ai.provider.update",
  aiProviderDelete: "ai.provider.delete",
  aiProviderTest: "ai.provider.test",
  aiSettingsUpdate: "ai.settings.update",
  aiToolExecute: "ai.tool.execute",
  aiToolError: "ai.tool.error",
  aiPromptCreate: "ai.prompt.create",
  aiPromptUpdate: "ai.prompt.update",
  aiPromptPublish: "ai.prompt.publish",
  aiPromptDelete: "ai.prompt.delete",
  aiMemoryForget: "ai.memory.forget",
  aiKnowledgeIngest: "ai.knowledge.ingest",
  aiKnowledgeDelete: "ai.knowledge.delete",
  aiWorkflowCreate: "ai.workflow.create",
  aiWorkflowUpdate: "ai.workflow.update",
  aiWorkflowRun: "ai.workflow.run",
  aiWorkflowDelete: "ai.workflow.delete",
  aiApiKeyCreate: "ai.apikey.create",
  aiApiKeyRevoke: "ai.apikey.revoke",

  // Computer Use Engine (Phase 4)
  browserSessionCreate: "browser.session.create",
  browserSessionClose: "browser.session.close",
  browserSessionRecover: "browser.session.recover",
  browserExecutionStart: "browser.execution.start",
  browserExecutionCancel: "browser.execution.cancel",
  browserExecutionFinish: "browser.execution.finish",
  browserActionRisky: "browser.action.risky",
  browserApprovalRequest: "browser.approval.request",
  browserPolicyUpdate: "browser.policy.update",
  browserSettingsUpdate: "browser.settings.update",
  browserProfileCreate: "browser.profile.create",
  browserProfileDelete: "browser.profile.delete",
  browserDownloadIngest: "browser.download.ingest",
  browserDownloadDelete: "browser.download.delete",
  browserUploadStore: "browser.upload.store",
  browserUploadDelete: "browser.upload.delete",
  browserScreenshotDelete: "browser.screenshot.delete",

  // AI Workers (Phase 5)
  agentRunDispatch: "agent.run.dispatch",
  agentRunResume: "agent.run.resume",
  agentRunCancel: "agent.run.cancel",
  agentRunCanceled: "agent.run.canceled",
  agentRunFailed: "agent.run.failed",
  agentWorkerUpdate: "agent.worker.update",
  agentTriggerTick: "agent.trigger.tick",

  // AI Sales Employee (Phase 6)
  salesCompanyCreate: "sales.company.create",
  salesCompanyUpdate: "sales.company.update",
  salesCompanyDelete: "sales.company.delete",
  salesContactCreate: "sales.contact.create",
  salesContactUpdate: "sales.contact.update",
  salesContactQualify: "sales.contact.qualify",
  salesContactDelete: "sales.contact.delete",
  salesDealCreate: "sales.deal.create",
  salesDealMove: "sales.deal.move",
  salesDealUpdate: "sales.deal.update",
  salesDealClose: "sales.deal.close",
  salesDealDelete: "sales.deal.delete",
  salesActivityCreate: "sales.activity.create",
  salesActivityComplete: "sales.activity.complete",
  salesPipelineCreate: "sales.pipeline.create",
  salesResearchRequest: "sales.research.request",
  salesResearchCompleted: "sales.research.completed",
  salesResearchFailed: "sales.research.failed",
  salesCampaignCreate: "sales.campaign.create",
  salesCampaignUpdate: "sales.campaign.update",
  salesCampaignStatus: "sales.campaign.status",
  salesCampaignEnroll: "sales.campaign.enroll",
  salesCampaignEnrollmentActive: "sales.campaign.enrollment.active",
  salesCampaignEnrollmentPaused: "sales.campaign.enrollment.paused",
  salesCampaignEnrollmentUnsubscribed: "sales.campaign.enrollment.unsubscribed",
  salesCampaignTick: "sales.campaign.tick",
  salesDraftCreate: "sales.draft.create",
  salesDraftUpdate: "sales.draft.update",
  salesDraftSubmit: "sales.draft.submit",
  salesDraftApproved: "sales.draft.approved",
  salesDraftRejected: "sales.draft.rejected",
  salesDraftReschedule: "sales.draft.reschedule",
  salesDraftDelete: "sales.draft.delete",
  salesSettingsUpdate: "sales.settings.update",
  salesSearchSave: "sales.search.save",
  salesSearchDelete: "sales.search.delete",
  salesEmailConnectionCreate: "sales.email.connection.create",
  salesEmailConnectionUpdate: "sales.email.connection.update",
  salesEmailConnectionDelete: "sales.email.connection.delete",
  salesEmailConnectionVerified: "sales.email.connection.verified",
  salesEmailConnectionFailed: "sales.email.connection.failed",
  salesDraftSendRequested: "sales.draft.send.requested",
  salesDraftSent: "sales.draft.sent",
  salesDraftSendFailed: "sales.draft.send_failed",
  salesEmailTick: "sales.email.tick",
  agentTeamCreate: "agents.team.create",
  agentTeamUpdate: "agents.team.update",
  agentTeamDelete: "agents.team.delete",
  agentTeamRun: "agents.team.run",

  // Owner access management (M8)
  accessApprove: "access.approve",
  accessExtend: "access.extend",
  accessSuspend: "access.suspend",
  accessReactivate: "access.reactivate",
  accessDelete: "access.delete",

  // Governance (Phase 9)
  auditExport: "audit.export",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export async function audit(entry: {
  workspaceId?: string | null;
  actorId?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        workspaceId: entry.workspaceId ?? null,
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        ip: clientIp(),
        userAgent: clientUserAgent(),
      },
    });
  } catch (error) {
    console.error("[audit] failed to record", entry.action, error);
  }
}
