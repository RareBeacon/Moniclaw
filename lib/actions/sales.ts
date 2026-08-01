"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AUDIT_ACTIONS, audit } from "@/lib/audit";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { checkPermission, resolveWorkspaceContext } from "@/lib/workspace";
import { getSalesRuntime } from "@/lib/sales/runtime";
import {
  createManualDraft,
  decideDraft,
  deleteDraft,
  rescheduleDraft,
  submitDraftForReview,
} from "@/lib/sales/drafts";
import { SalesError } from "@sales/index";
import {
  companyUpdateApiSchema,
  contactUpdateApiSchema,
  emailConnectionCreateApiSchema,
  emailConnectionUpdateApiSchema,
} from "@/lib/validations/sales";
import {
  createConnection,
  deleteConnection,
  sendDraft,
  updateConnection,
  verifyConnection,
} from "@/lib/email/connections";
import {
  activityInputSchema,
  campaignInputSchema,
  campaignStepSchema,
  companyInputSchema,
  contactInputSchema,
  dealInputSchema,
  draftInputSchema,
  icpProfileSchema,
} from "@sales/index";
import type { ActionState } from "@/lib/actions/workspace";

/**
 * Phase-6 sales actions. REST routes (/api/sales/*) and these actions share
 * the SAME services — no business logic lives here beyond auth + validation
 * + revalidation.
 */

function salesError(err: unknown, fallback: string): ActionState {
  if (err instanceof SalesError) return { error: err.message };
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Check your inputs." };
  console.error("[actions/sales]", err);
  return { error: fallback };
}

async function context(action: Parameters<typeof checkPermission>[1]) {
  const resolved = await resolveWorkspaceContext();
  if ("error" in resolved) return { error: resolved.error } as const;
  const denied = checkPermission(resolved.ctx, action);
  if (denied) return { error: denied } as const;
  return { ctx: resolved.ctx } as const;
}

function revalidateSales(): void {
  revalidatePath("/dashboard/sales");
  revalidatePath("/dashboard/sales/companies");
  revalidatePath("/dashboard/sales/contacts");
  revalidatePath("/dashboard/sales/deals");
  revalidatePath("/dashboard/sales/campaigns");
  revalidatePath("/dashboard/sales/drafts");
  revalidatePath("/dashboard/sales/tasks");
  revalidatePath("/dashboard/sales/meetings");
  revalidatePath("/dashboard/sales/analytics");
  revalidatePath("/dashboard/approvals");
}

// ── Companies ─────────────────────────────────────────────────────────────

export async function createCompanyAction(input: unknown): Promise<ActionState & { id?: string }> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    const parsed = companyInputSchema.parse(input);
    const company = await getSalesRuntime().crm.createCompany(g.ctx.workspace.id, g.ctx.user.id, parsed);
    revalidateSales();
    return { ok: true, id: company.id };
  } catch (err) {
    return salesError(err, "Could not create the company.");
  }
}

export async function updateCompanyAction(id: string, patch: unknown): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    // Hand-written update schema: `.partial()` over defaulted fields would
    // re-apply defaults and silently wipe techStack/tags on any rename.
    const partial = companyUpdateApiSchema.parse(patch);
    await getSalesRuntime().crm.updateCompany(g.ctx.workspace.id, g.ctx.user.id, id, partial);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not update the company.");
  }
}

export async function deleteCompanyAction(id: string): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    await getSalesRuntime().crm.deleteCompany(g.ctx.workspace.id, g.ctx.user.id, id);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not delete the company.");
  }
}

export async function requestResearchAction(companyId: string): Promise<ActionState & { runId?: string }> {
  const g = await context("sales.research.run");
  if ("error" in g) return { error: g.error };
  const verdict = rateLimit(`salesResearch:${g.ctx.workspace.id}`, RATE_LIMITS.salesResearch.limit, RATE_LIMITS.salesResearch.windowMs);
  if (!verdict.success) return { error: `Too many research requests — retry in ${verdict.retryAfterSeconds}s.` };
  try {
    const result = await getSalesRuntime().research.requestResearch(g.ctx.workspace.id, companyId, g.ctx.user.id);
    revalidateSales();
    return { ok: true, runId: result.runId };
  } catch (err) {
    return salesError(err, "Could not queue company research.");
  }
}

// ── Contacts ──────────────────────────────────────────────────────────────

export async function createContactAction(input: unknown): Promise<ActionState & { id?: string }> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    const parsed = contactInputSchema.parse(input);
    const contact = await getSalesRuntime().crm.createContact(g.ctx.workspace.id, g.ctx.user.id, parsed);
    revalidateSales();
    return { ok: true, id: contact.id };
  } catch (err) {
    return salesError(err, "Could not create the contact.");
  }
}

export async function updateContactAction(id: string, patch: unknown): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    const partial = contactUpdateApiSchema.parse(patch);
    await getSalesRuntime().crm.updateContact(g.ctx.workspace.id, g.ctx.user.id, id, partial);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not update the contact.");
  }
}

export async function qualifyContactAction(id: string): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    await getSalesRuntime().crm.qualifyContact(g.ctx.workspace.id, g.ctx.user.id, id);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not qualify the contact.");
  }
}

export async function deleteContactAction(id: string): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    await getSalesRuntime().crm.deleteContact(g.ctx.workspace.id, g.ctx.user.id, id);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not delete the contact.");
  }
}

// ── Deals ─────────────────────────────────────────────────────────────────

export async function createDealAction(input: unknown): Promise<ActionState & { id?: string }> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    const parsed = dealInputSchema.parse(input);
    const deal = await getSalesRuntime().crm.createDeal(g.ctx.workspace.id, g.ctx.user.id, parsed);
    revalidateSales();
    return { ok: true, id: deal.id };
  } catch (err) {
    return salesError(err, "Could not create the deal.");
  }
}

export async function moveDealAction(dealId: string, stageId: string): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    z.string().uuid().parse(stageId);
    await getSalesRuntime().crm.moveDealStage(g.ctx.workspace.id, g.ctx.user.id, dealId, stageId);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not move the deal.");
  }
}

export async function closeDealAction(dealId: string, status: "WON" | "LOST", lostReason?: string): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    await getSalesRuntime().crm.closeDeal(g.ctx.workspace.id, g.ctx.user.id, dealId, status, lostReason);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not close the deal.");
  }
}

export async function deleteDealAction(id: string): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    await getSalesRuntime().crm.deleteDeal(g.ctx.workspace.id, g.ctx.user.id, id);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not delete the deal.");
  }
}

// ── Activities ────────────────────────────────────────────────────────────

export async function logActivityAction(input: unknown): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    const parsed = activityInputSchema.parse(input);
    await getSalesRuntime().crm.logActivity(g.ctx.workspace.id, g.ctx.user.id, parsed);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not log the activity.");
  }
}

export async function completeActivityAction(id: string): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    await getSalesRuntime().crm.completeActivity(g.ctx.workspace.id, g.ctx.user.id, id);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not complete the activity.");
  }
}

// ── Campaigns ─────────────────────────────────────────────────────────────

export async function createCampaignAction(input: unknown): Promise<ActionState & { id?: string }> {
  const g = await context("sales.campaigns.manage");
  if ("error" in g) return { error: g.error };
  try {
    const parsed = campaignInputSchema.parse(input);
    const repos = getSalesRuntime().repos;
    const campaign = await repos.campaigns.create(g.ctx.workspace.id, {
      name: parsed.name,
      goal: parsed.goal ?? null,
      dailyCap: parsed.dailyCap,
      sendWindow: parsed.sendWindow,
      knowledgeContext: parsed.knowledgeContext ?? null,
      status: "DRAFT",
      createdById: g.ctx.user.id,
    });
    if (parsed.steps.length) {
      await repos.campaigns.replaceSteps(campaign.id, parsed.steps.map((s) => ({ ...s })));
    }
    await audit({
      workspaceId: g.ctx.workspace.id, actorId: g.ctx.user.id,
      action: AUDIT_ACTIONS.salesCampaignCreate, targetType: "sales_campaign", targetId: campaign.id,
      metadata: { name: campaign.name, steps: parsed.steps.length },
    });
    revalidateSales();
    return { ok: true, id: campaign.id };
  } catch (err) {
    return salesError(err, "Could not create the campaign.");
  }
}

export async function setCampaignStatusAction(id: string, status: unknown): Promise<ActionState> {
  const g = await context("sales.campaigns.manage");
  if ("error" in g) return { error: g.error };
  try {
    const next = z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).parse(status);
    const repos = getSalesRuntime().repos;
    const campaign = await repos.campaigns.get(g.ctx.workspace.id, id);
    if (!campaign) throw new SalesError("not_found", "Campaign not found.");
    if (next === "ACTIVE") {
      if (!["DRAFT", "PAUSED"].includes(campaign.status)) {
        throw new SalesError("conflict", `A ${campaign.status} campaign cannot be activated.`);
      }
      if ((await repos.campaigns.listSteps(id)).length === 0) {
        throw new SalesError("validation", "Add at least one step before activating.");
      }
    }
    if (next === "PAUSED" && campaign.status !== "ACTIVE") {
      throw new SalesError("conflict", "Only ACTIVE campaigns can be paused.");
    }
    await repos.campaigns.update(id, { status: next });
    await audit({
      workspaceId: g.ctx.workspace.id, actorId: g.ctx.user.id,
      action: AUDIT_ACTIONS.salesCampaignStatus, targetType: "sales_campaign", targetId: id,
      metadata: { from: campaign.status, to: next },
    });
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not change the campaign status.");
  }
}

export async function replaceCampaignStepsAction(id: string, steps: unknown): Promise<ActionState> {
  const g = await context("sales.campaigns.manage");
  if ("error" in g) return { error: g.error };
  try {
    const parsed = z.array(campaignStepSchema).min(1).max(20).parse(steps);
    const repos = getSalesRuntime().repos;
    const campaign = await repos.campaigns.get(g.ctx.workspace.id, id);
    if (!campaign) throw new SalesError("not_found", "Campaign not found.");
    if (campaign.status === "ACTIVE") throw new SalesError("conflict", "Pause the campaign before editing steps.");
    await repos.campaigns.replaceSteps(id, parsed.map((s) => ({ ...s })));
    await audit({
      workspaceId: g.ctx.workspace.id, actorId: g.ctx.user.id,
      action: AUDIT_ACTIONS.salesCampaignUpdate, targetType: "sales_campaign", targetId: id,
      metadata: { steps: parsed.length },
    });
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not save the sequence.");
  }
}

export async function enrollContactsAction(campaignId: string, contactIds: string[]): Promise<ActionState & { created?: number }> {
  const g = await context("sales.campaigns.manage");
  if ("error" in g) return { error: g.error };
  try {
    const ids = z.array(z.string().uuid()).min(1).max(100).parse(contactIds);
    const engine = getSalesRuntime().campaignsEngine;
    let created = 0;
    const failures: string[] = [];
    for (const contactId of ids) {
      try {
        const r = await engine.enrollContact(g.ctx.workspace.id, g.ctx.user.id, campaignId, contactId);
        if (r.created) created += 1;
      } catch (err) {
        failures.push(err instanceof Error ? err.message : "failed");
      }
    }
    revalidateSales();
    if (failures.length && created === 0) return { error: failures[0] };
    return { ok: true, created };
  } catch (err) {
    return salesError(err, "Could not enroll the contacts.");
  }
}

export async function setEnrollmentStatusAction(campaignId: string, enrollmentId: string, status: unknown): Promise<ActionState> {
  const g = await context("sales.campaigns.manage");
  if ("error" in g) return { error: g.error };
  try {
    const next = z.enum(["ACTIVE", "PAUSED", "UNSUBSCRIBED"]).parse(status);
    await getSalesRuntime().campaignsEngine.setEnrollmentStatus(g.ctx.workspace.id, g.ctx.user.id, campaignId, enrollmentId, next);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not update the enrollment.");
  }
}

// ── Drafts ────────────────────────────────────────────────────────────────

export async function createDraftAction(input: unknown): Promise<ActionState & { id?: string }> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    const parsed = draftInputSchema.parse(input);
    const draft = await createManualDraft(g.ctx.workspace.id, g.ctx.user.id, parsed);
    revalidateSales();
    return { ok: true, id: draft.id };
  } catch (err) {
    return salesError(err, "Could not create the draft.");
  }
}

export async function updateDraftAction(id: string, patch: unknown): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    const partial = z.object({
      subject: z.string().trim().max(300).nullish(),
      body: z.string().trim().min(10).max(20000).optional(),
    }).parse(patch);
    const runtime = getSalesRuntime();
    const draft = await runtime.repos.drafts.get(g.ctx.workspace.id, id);
    if (!draft) throw new SalesError("not_found", "Draft not found.");
    if (draft.status !== "DRAFT") throw new SalesError("conflict", `Only DRAFT drafts can be edited (this one is ${draft.status}).`);
    await runtime.repos.drafts.setStatus(id, "DRAFT", {
      ...(partial.subject !== undefined ? { subject: partial.subject } : {}),
      ...(partial.body !== undefined ? { body: partial.body } : {}),
    });
    await audit({
      workspaceId: g.ctx.workspace.id, actorId: g.ctx.user.id,
      action: AUDIT_ACTIONS.salesDraftUpdate, targetType: "sales_draft", targetId: id,
    });
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not update the draft.");
  }
}

export async function submitDraftAction(id: string): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    await submitDraftForReview(g.ctx.workspace.id, g.ctx.user.id, id);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not submit the draft for review.");
  }
}

export async function decideDraftAction(id: string, decision: "APPROVED" | "REJECTED", note?: string): Promise<ActionState> {
  const g = await context("sales.drafts.review");
  if ("error" in g) return { error: g.error };
  try {
    await decideDraft(g.ctx.workspace.id, g.ctx.user.id, id, decision, note);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not record the decision.");
  }
}

export async function rescheduleDraftAction(id: string, scheduledAt: string): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    const at = z.string().datetime({ offset: true }).or(z.string().datetime()).parse(scheduledAt);
    await rescheduleDraft(g.ctx.workspace.id, g.ctx.user.id, id, new Date(at));
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not schedule the draft.");
  }
}

export async function deleteDraftAction(id: string): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    await deleteDraft(g.ctx.workspace.id, g.ctx.user.id, id);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not delete the draft.");
  }
}

// ── Pipelines / settings / saved searches ─────────────────────────────────

export async function createPipelineAction(input: unknown): Promise<ActionState & { id?: string }> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    const parsed = z.object({
      name: z.string().trim().min(2).max(80),
      stages: z.array(z.object({
        name: z.string().trim().min(1).max(60),
        winProbability: z.number().int().min(0).max(100).default(25),
      })).min(1).max(20),
    }).parse(input);
    const pipeline = await getSalesRuntime().repos.pipelines.create(g.ctx.workspace.id, parsed.name, parsed.stages);
    await audit({
      workspaceId: g.ctx.workspace.id, actorId: g.ctx.user.id,
      action: AUDIT_ACTIONS.salesPipelineCreate, targetType: "sales_pipeline", targetId: pipeline.id,
      metadata: { name: parsed.name, stages: parsed.stages.length },
    });
    revalidateSales();
    return { ok: true, id: pipeline.id };
  } catch (err) {
    return salesError(err, "Could not create the pipeline.");
  }
}

const sendWindowSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([1, 2, 3, 4, 5]),
  startHour: z.number().int().min(0).max(23).default(9),
  endHour: z.number().int().min(0).max(23).default(17),
  timezone: z.string().trim().max(60).default("UTC"),
});

export async function saveSalesSettingsAction(input: unknown): Promise<ActionState> {
  const g = await context("sales.settings.manage");
  if ("error" in g) return { error: g.error };
  try {
    const parsed = z.object({
      icpProfile: icpProfileSchema.optional(),
      defaultSendWindow: sendWindowSchema.optional(),
      senderName: z.string().trim().max(120).nullish(),
      senderTitle: z.string().trim().max(120).nullish(),
    }).parse(input);
    const repos = getSalesRuntime().repos;
    await repos.settings.upsert(g.ctx.workspace.id, {
      ...(parsed.icpProfile !== undefined ? { icpProfile: parsed.icpProfile } : {}),
      ...(parsed.defaultSendWindow !== undefined ? { defaultSendWindow: parsed.defaultSendWindow } : {}),
      ...(parsed.senderName !== undefined ? { senderName: parsed.senderName ?? null } : {}),
      ...(parsed.senderTitle !== undefined ? { senderTitle: parsed.senderTitle ?? null } : {}),
    });
    await audit({
      workspaceId: g.ctx.workspace.id, actorId: g.ctx.user.id,
      action: AUDIT_ACTIONS.salesSettingsUpdate, targetType: "sales_settings",
      metadata: { fields: Object.keys(parsed).filter((k) => (parsed as Record<string, unknown>)[k] !== undefined) },
    });
    // Rescore the book against the new ICP (bounded — large books rescore
    // lazily on their next write/research completion).
    if (parsed.icpProfile !== undefined) {
      const { crm, icpFor } = getSalesRuntime();
      const icp = await icpFor(g.ctx.workspace.id);
      const companies = await repos.companies.list(g.ctx.workspace.id, { take: 200 });
      for (const company of companies) {
        await crm.rescoreCompany(g.ctx.workspace.id, company.id, icp);
      }
    }
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not save sales settings.");
  }
}

export async function saveSearchAction(input: unknown): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    const parsed = z.object({
      name: z.string().trim().min(2).max(80),
      entity: z.enum(["companies", "contacts", "deals"]),
      filters: z.record(z.string(), z.unknown()),
    }).parse(input);
    await getSalesRuntime().repos.searches.upsert(g.ctx.workspace.id, parsed.name, parsed.entity, parsed.filters, g.ctx.user.id);
    await audit({
      workspaceId: g.ctx.workspace.id, actorId: g.ctx.user.id,
      action: AUDIT_ACTIONS.salesSearchSave, targetType: "sales_search",
      metadata: { name: parsed.name, entity: parsed.entity },
    });
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not save the search.");
  }
}

export async function deleteSearchAction(id: string): Promise<ActionState> {
  const g = await context("sales.write");
  if ("error" in g) return { error: g.error };
  try {
    await getSalesRuntime().repos.searches.delete(g.ctx.workspace.id, id);
    await audit({
      workspaceId: g.ctx.workspace.id, actorId: g.ctx.user.id,
      action: AUDIT_ACTIONS.salesSearchDelete, targetType: "sales_search", targetId: id,
    });
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not delete the saved search.");
  }
}

// ── Email connections (SES/SMTP) + approved-draft delivery ────────────────

export async function createEmailConnectionAction(input: unknown): Promise<ActionState> {
  const g = await context("sales.settings.manage");
  if ("error" in g) return { error: g.error };
  const gate = rateLimit(`salesEmailConnection:${g.ctx.workspace.id}`, RATE_LIMITS.salesEmailConnection.limit, RATE_LIMITS.salesEmailConnection.windowMs);
  if (!gate.success) return { error: `Too many connection changes. Try again in ${gate.retryAfterSeconds}s.` };
  try {
    const parsed = emailConnectionCreateApiSchema.parse(input);
    const connection = await createConnection(g.ctx.workspace.id, g.ctx.user.id, parsed);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not connect the email identity.");
  }
}

export async function updateEmailConnectionAction(id: string, input: unknown): Promise<ActionState> {
  const g = await context("sales.settings.manage");
  if ("error" in g) return { error: g.error };
  const gate = rateLimit(`salesEmailConnection:${g.ctx.workspace.id}`, RATE_LIMITS.salesEmailConnection.limit, RATE_LIMITS.salesEmailConnection.windowMs);
  if (!gate.success) return { error: `Too many connection changes. Try again in ${gate.retryAfterSeconds}s.` };
  try {
    const parsed = emailConnectionUpdateApiSchema.parse(input);
    await updateConnection(g.ctx.workspace.id, g.ctx.user.id, id, parsed);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not update the connection.");
  }
}

export async function deleteEmailConnectionAction(id: string): Promise<ActionState> {
  const g = await context("sales.settings.manage");
  if ("error" in g) return { error: g.error };
  try {
    await deleteConnection(g.ctx.workspace.id, g.ctx.user.id, id);
    revalidateSales();
    return { ok: true };
  } catch (err) {
    return salesError(err, "Could not remove the connection.");
  }
}

export async function verifyEmailConnectionAction(id: string, testTo?: string): Promise<ActionState> {
  const g = await context("sales.settings.manage");
  if ("error" in g) return { error: g.error };
  const gate = rateLimit(`salesEmailVerify:${g.ctx.workspace.id}`, RATE_LIMITS.salesEmailVerify.limit, RATE_LIMITS.salesEmailVerify.windowMs);
  if (!gate.success) return { error: `Too many verification attempts. Try again in ${gate.retryAfterSeconds}s.` };
  try {
    const result = await verifyConnection(g.ctx.workspace.id, g.ctx.user.id, id, {
      ...(testTo ? { testTo } : {}),
    });
    revalidateSales();
    return result.status === "VERIFIED"
      ? { ok: true }
      : { error: `Verification failed: ${result.error ?? "handshake refused"}` };
  } catch (err) {
    return salesError(err, "Could not verify the connection.");
  }
}

/** Manager decision: deliver an APPROVED draft immediately. */
export async function sendDraftNowAction(id: string): Promise<ActionState> {
  const g = await context("sales.drafts.review");
  if ("error" in g) return { error: g.error };
  const gate = rateLimit(`salesEmailSend:${g.ctx.workspace.id}`, RATE_LIMITS.salesEmailSend.limit, RATE_LIMITS.salesEmailSend.windowMs);
  if (!gate.success) return { error: `Too many sends. Try again in ${gate.retryAfterSeconds}s.` };
  try {
    const result = await sendDraft(g.ctx.workspace.id, g.ctx.user.id, id);
    revalidateSales();
    return result.status === "SENT"
      ? { ok: true }
      : { error: `Not delivered: ${result.error ?? "provider refused"}${result.status === "SCHEDULED" ? " — rescheduled for the next tick." : ""}` };
  } catch (err) {
    return salesError(err, "Could not send the draft.");
  }
}
