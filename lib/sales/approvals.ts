/**
 * The single sales→approvals bridge: workspace-linked Approval rows with
 * actionType "sales.draft.review". Shared by the campaign engine (auto-drafts)
 * and manual draft submission — same shape, same inbox, same decide path.
 */
import type { SalesApprovalBridge } from "@sales/index";

import { db } from "@/lib/db";

export function salesApprovalBridge(): SalesApprovalBridge {
  return {
    async createForDraft(input) {
      const approval = await db.approval.create({
        data: {
          workspaceId: input.workspaceId,
          actionType: "sales.draft.review",
          requestedTo: input.requestedTo,
          detail: {
            draftId: input.draftId,
            channel: input.channel,
            contactLabel: input.contactLabel,
            subject: input.subject,
            body: input.body.slice(0, 2000),
          } as object,
          status: "PENDING",
        },
      });
      return { approvalId: approval.id };
    },
    async statusOf(approvalId) {
      const approval = await db.approval.findUnique({ where: { id: approvalId } });
      return (approval?.status as "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | undefined) ?? null;
    },
  };
}
