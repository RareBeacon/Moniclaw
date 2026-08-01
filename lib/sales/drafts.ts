/**
 * Draft lifecycle orchestration (app glue) — the human-approval spine of the
 * Sales Employee. NO auto-send exists anywhere: drafts move
 * DRAFT → (submit) → PENDING_REVIEW → (manager decides) → APPROVED/REJECTED
 * → (reschedule) → SCHEDULED → … provider send (Phase 6 later seam / Phase 7).
 *
 * Decisions made here update the shared Phase-2 Approval row AND the draft in
 * one transaction; decisions made in the generic approvals inbox propagate
 * the same way (see decideApproval in lib/actions/workspace.ts).
 */
import {
  SalesError,
  type DraftInput,
  type SalesDraftRow,
} from "@sales/index";

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { salesApprovalBridge } from "./approvals";
import { getSalesRuntime } from "./runtime";

export async function createManualDraft(
  workspaceId: string,
  actorId: string | null,
  input: DraftInput
): Promise<SalesDraftRow> {
  const { repos } = getSalesRuntime();
  if (input.contactId) {
    const contact = await repos.contacts.get(workspaceId, input.contactId);
    if (!contact) throw new SalesError("not_found", "Contact not found.", { contactId: input.contactId });
    // Keep the company link consistent with the resolved contact.
    if (contact.companyId && !input.companyId) input = { ...input, companyId: contact.companyId };
  }
  if (input.companyId) {
    const company = await repos.companies.get(workspaceId, input.companyId);
    if (!company) throw new SalesError("not_found", "Company not found.", { companyId: input.companyId });
  }

  const draft = await repos.drafts.create(workspaceId, {
    contactId: input.contactId ?? null,
    companyId: input.companyId ?? null,
    channel: input.channel,
    subject: input.subject ?? null,
    body: input.body,
    status: "DRAFT",
    deliveryStatus: "NONE",
    createdById: actorId ?? null,
  });
  await audit({
    workspaceId, actorId, action: "sales.draft.create",
    targetType: "sales_draft", targetId: draft.id,
    metadata: { channel: draft.channel, contactId: draft.contactId },
  });
  return draft;
}

/** DRAFT/REJECTED → PENDING_REVIEW + a fresh approval row. */
export async function submitDraftForReview(
  workspaceId: string,
  actorId: string | null,
  draftId: string
): Promise<{ draft: SalesDraftRow; approvalId: string }> {
  const { repos } = getSalesRuntime();
  const draft = await requireDraft(workspaceId, draftId);
  if (!["DRAFT", "REJECTED"].includes(draft.status)) {
    throw new SalesError("conflict", `A ${draft.status} draft cannot be submitted for review.`);
  }
  const bridge = salesApprovalBridge();
  const { approvalId } = await bridge.createForDraft({
    workspaceId,
    draftId: draft.id,
    channel: draft.channel,
    contactLabel: await contactLabel(workspaceId, draft),
    subject: draft.subject,
    body: draft.body,
    requestedTo: "workspace.manager",
  });
  await repos.drafts.setStatus(draft.id, "PENDING_REVIEW", { approvalId, rejectionNote: null });
  await audit({
    workspaceId, actorId, action: "sales.draft.submit",
    targetType: "sales_draft", targetId: draft.id, metadata: { approvalId },
  });
  return { draft: (await repos.drafts.get(workspaceId, draft.id))!, approvalId };
}

/** Manager decision — approval + draft update in one transaction. */
export async function decideDraft(
  workspaceId: string,
  actorId: string | null,
  draftId: string,
  decision: "APPROVED" | "REJECTED",
  note?: string
): Promise<SalesDraftRow> {
  const { repos } = getSalesRuntime();
  const draft = await requireDraft(workspaceId, draftId);
  if (draft.status !== "PENDING_REVIEW" || !draft.approvalId) {
    throw new SalesError("conflict", `A ${draft.status} draft is not awaiting review.`);
  }
  const approval = await db.approval.findFirst({ where: { id: draft.approvalId, workspaceId } });
  if (!approval) throw new SalesError("not_found", "Approval record not found.");
  if (approval.status !== "PENDING") {
    throw new SalesError("conflict", `Approval already ${approval.status.toLowerCase()} — refresh and retry.`);
  }

  await db.$transaction([
    db.approval.update({
      where: { id: approval.id },
      data: { status: decision, decidedById: actorId, decidedAt: new Date(), note: note || null },
    }),
    db.salesDraft.update({
      where: { id: draft.id },
      data: {
        status: decision,
        ...(decision === "REJECTED" ? { rejectionNote: note || null } : { rejectionNote: null }),
      },
    }),
  ]);
  await audit({
    workspaceId, actorId,
    action: decision === "APPROVED" ? "sales.draft.approved" : "sales.draft.rejected",
    targetType: "sales_draft", targetId: draft.id,
    metadata: { approvalId: approval.id, channel: draft.channel },
  });
  return (await repos.drafts.get(workspaceId, draft.id))!;
}

/** APPROVED/SCHEDULED draft gets a (new) send time. */
export async function rescheduleDraft(
  workspaceId: string,
  actorId: string | null,
  draftId: string,
  scheduledAt: Date
): Promise<SalesDraftRow> {
  const { repos } = getSalesRuntime();
  const draft = await requireDraft(workspaceId, draftId);
  if (!["APPROVED", "SCHEDULED"].includes(draft.status)) {
    throw new SalesError("conflict", `Only approved drafts can be scheduled (this one is ${draft.status}).`);
  }
  await repos.drafts.setStatus(draft.id, "SCHEDULED", { scheduledAt });
  await audit({
    workspaceId, actorId, action: "sales.draft.reschedule",
    targetType: "sales_draft", targetId: draft.id,
    metadata: { scheduledAt: scheduledAt.toISOString() },
  });
  return (await repos.drafts.get(workspaceId, draft.id))!;
}

/** Soft-delete guard: reviewed artifacts are kept for the audit trail. */
export async function deleteDraft(
  workspaceId: string,
  actorId: string | null,
  draftId: string
): Promise<void> {
  const { repos } = getSalesRuntime();
  const draft = await requireDraft(workspaceId, draftId);
  if (!["DRAFT", "REJECTED", "CANCELED"].includes(draft.status)) {
    throw new SalesError("conflict", `A ${draft.status} draft cannot be deleted — it is part of the audit trail.`);
  }
  await repos.drafts.softDelete(workspaceId, draft.id);
  await audit({
    workspaceId, actorId, action: "sales.draft.delete",
    targetType: "sales_draft", targetId: draft.id,
  });
}

/** Only DRAFT status is editable (everything else is under review or final). */
export function assertEditable(draft: SalesDraftRow): void {
  if (draft.status !== "DRAFT") {
    throw new SalesError("conflict", `Only DRAFT drafts can be edited (this one is ${draft.status}).`);
  }
}

async function requireDraft(workspaceId: string, draftId: string): Promise<SalesDraftRow> {
  const { repos } = getSalesRuntime();
  const draft = await repos.drafts.get(workspaceId, draftId);
  if (!draft) throw new SalesError("not_found", "Draft not found.", { draftId });
  return draft;
}

async function contactLabel(workspaceId: string, draft: SalesDraftRow): Promise<string> {
  const { repos } = getSalesRuntime();
  const parts: string[] = [];
  if (draft.contactId) {
    const contact = await repos.contacts.get(workspaceId, draft.contactId);
    if (contact) parts.push(contact.name);
  }
  if (draft.companyId) {
    const company = await repos.companies.get(workspaceId, draft.companyId);
    if (company) parts.push(company.name);
  }
  return parts.join(" · ") || `${draft.channel} draft`;
}

