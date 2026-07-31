/**
 * Sales Runtime — shared contracts for the AI Sales Employee.
 *
 * Built ON the platform: workspace/RBAC (Phase 2), AI Runtime (Phase 3),
 * Computer Use Engine (Phase 4), Agent Runtime workers (Phase 5). This
 * package adds sales-domain semantics only — no framework, SDK or SQL
 * imports; persistence and platform bridges live behind ports.
 */
import { z } from "zod";

// ── Enumerations (mirror prisma enums as string unions for decoupling) ────

export const SALES_RESEARCH_STATUSES = ["NONE", "QUEUED", "RUNNING", "COMPLETED", "FAILED"] as const;
export const SALES_CONTACT_STATUSES = ["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "CUSTOMER", "LOST"] as const;
export const SALES_CONTACT_SOURCES = ["MANUAL", "RESEARCH", "IMPORT"] as const;
export const SALES_DEAL_STATUSES = ["OPEN", "WON", "LOST"] as const;
export const SALES_ACTIVITY_TYPES = ["NOTE", "TASK", "CALL", "MEETING", "EMAIL", "REMINDER"] as const;
export const SALES_CAMPAIGN_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"] as const;
export const SALES_CAMPAIGN_STEP_KINDS = ["DRAFT_EMAIL", "LINKEDIN_CONNECT", "TASK", "WAIT"] as const;
export const SALES_ENROLLMENT_STATUSES = ["ACTIVE", "PAUSED", "COMPLETED", "UNSUBSCRIBED", "BOUNCED"] as const;
export const SALES_DRAFT_CHANNELS = ["EMAIL", "LINKEDIN"] as const;
export const SALES_DRAFT_STATUSES = [
  "DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "SCHEDULED", "SENT", "FAILED", "CANCELED",
] as const;

export type SalesContactStatus = (typeof SALES_CONTACT_STATUSES)[number];
export type SalesDealStatus = (typeof SALES_DEAL_STATUSES)[number];
export type SalesCampaignStatus = (typeof SALES_CAMPAIGN_STATUSES)[number];
export type SalesDraftStatus = (typeof SALES_DRAFT_STATUSES)[number];
export type SalesDraftChannel = (typeof SALES_DRAFT_CHANNELS)[number];

// ── Domain scores ─────────────────────────────────────────────────────────

export const scoreSchema = z.number().int().min(0).max(100);

export const icpProfileSchema = z.object({
  industries: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  sizes: z.array(z.string().trim().min(1).max(20)).max(10).default([]), // buckets: 1-10, 11-50, …
  geographies: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  keywords: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  roles: z.array(z.string().trim().min(1).max(60)).max(20).default([]), // for contact-level fit
});
export type IcpProfile = z.infer<typeof icpProfileSchema>;

export interface ScoreResult {
  score: number; // 0-100
  reasons: string[]; // explainability — persisted on the record
}

// ── CRM inputs ────────────────────────────────────────────────────────────

const domainRegex = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i;

export const companyInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  domain: z.string().trim().max(200).regex(domainRegex, "domain like acme.com").nullish(),
  industry: z.string().trim().max(80).nullish(),
  size: z.string().trim().max(20).nullish(),
  geography: z.string().trim().max(120).nullish(),
  businessModel: z.string().trim().max(400).nullish(),
  productsServices: z.string().trim().max(1000).nullish(),
  targetMarket: z.string().trim().max(400).nullish(),
  techStack: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  segment: z.string().trim().max(60).nullish(),
  territory: z.string().trim().max(60).nullish(),
  custom: z.record(z.string(), z.unknown()).optional(),
});
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const contactInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  companyId: z.string().uuid().nullish(),
  title: z.string().trim().max(120).nullish(),
  email: z.string().trim().email().max(200).nullish(),
  linkedinUrl: z.string().trim().url().max(300).nullish(),
  phone: z.string().trim().max(40).nullish(),
  notes: z.string().trim().max(4000).nullish(),
  source: z.enum(SALES_CONTACT_SOURCES).default("MANUAL"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

export const dealInputSchema = z.object({
  companyId: z.string().uuid(),
  primaryContactId: z.string().uuid().nullish(),
  pipelineId: z.string().uuid().optional(), // defaults to the workspace default pipeline
  stageId: z.string().uuid().optional(), // defaults to the pipeline's first stage
  title: z.string().trim().min(2).max(200),
  valueUsd: z.number().min(0).max(1_000_000_000).nullish(),
  currency: z.string().trim().length(3).default("USD"),
  expectedCloseAt: z.string().datetime({ offset: true }).or(z.string().datetime()).nullish(),
});
export type DealInput = z.infer<typeof dealInputSchema>;

export const activityInputSchema = z.object({
  type: z.enum(SALES_ACTIVITY_TYPES),
  subject: z.string().trim().min(2).max(200),
  body: z.string().trim().max(8000).nullish(),
  dueAt: z.string().datetime({ offset: true }).or(z.string().datetime()).nullish(),
  companyId: z.string().uuid().nullish(),
  contactId: z.string().uuid().nullish(),
  dealId: z.string().uuid().nullish(),
}).refine((v) => v.companyId || v.contactId || v.dealId, {
  message: "An activity must attach to a company, contact or deal.",
});
export type ActivityInput = z.infer<typeof activityInputSchema>;

// ── Campaigns ─────────────────────────────────────────────────────────────

export const campaignStepSchema = z.object({
  order: z.number().int().min(0).max(50),
  kind: z.enum(SALES_CAMPAIGN_STEP_KINDS),
  subject: z.string().trim().max(200).nullish(),
  bodyTemplate: z.string().trim().max(20000).nullish(),
  delayValue: z.number().int().min(0).max(365).default(0),
  delayUnit: z.enum(["HOURS", "DAYS"]).default("DAYS"),
  condition: z.object({
    ifContactStatus: z.array(z.enum(SALES_CONTACT_STATUSES)).optional(),
  }).default({}),
}).superRefine((v, ctx) => {
  if ((v.kind === "DRAFT_EMAIL" || v.kind === "LINKEDIN_CONNECT") && !v.bodyTemplate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bodyTemplate"], message: "Messaging steps need a body template." });
  }
});
export type CampaignStepInput = z.infer<typeof campaignStepSchema>;

export const campaignInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  goal: z.string().trim().max(400).nullish(),
  dailyCap: z.number().int().min(1).max(200).default(20),
  sendWindow: z.object({
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([1, 2, 3, 4, 5]),
    startHour: z.number().int().min(0).max(23).default(9),
    endHour: z.number().int().min(0).max(23).default(17),
    timezone: z.string().trim().max(60).default("UTC"),
  }).default({ daysOfWeek: [1, 2, 3, 4, 5], startHour: 9, endHour: 17, timezone: "UTC" }),
  knowledgeContext: z.string().trim().max(1000).nullish(),
  steps: z.array(campaignStepSchema).max(20).default([]),
});
export type CampaignInput = z.infer<typeof campaignInputSchema>;

// ── Drafts / personalization ──────────────────────────────────────────────

export const draftInputSchema = z.object({
  contactId: z.string().uuid().nullish(),
  companyId: z.string().uuid().nullish(),
  channel: z.enum(SALES_DRAFT_CHANNELS).default("EMAIL"),
  subject: z.string().trim().max(300).nullish(),
  body: z.string().trim().min(10).max(20000),
}).refine((v) => v.contactId || v.companyId, { message: "A draft needs a contact or company." });
export type DraftInput = z.infer<typeof draftInputSchema>;

/** Template context available to campaign steps + manual drafting. */
export interface DraftContext {
  contactFirstName: string;
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  companyName: string;
  companyDomain: string;
  companyIndustry: string;
  companySummary: string;
  senderName: string;
  senderTitle: string;
  workspaceName: string;
}

// ── Search ────────────────────────────────────────────────────────────────

export const salesSearchFiltersSchema = z.object({
  query: z.string().trim().max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  segment: z.string().trim().max(60).optional(),
  territory: z.string().trim().max(60).optional(),
  industry: z.string().trim().max(80).optional(),
  status: z.string().trim().max(20).optional(), // contact/deal status depending on entity
  stageId: z.string().uuid().optional(),
  minPriority: z.coerce.number().int().min(0).max(100).optional(),
  minFit: z.coerce.number().int().min(0).max(100).optional(),
  hasOpenDeal: z.coerce.boolean().optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type SalesSearchFilters = z.infer<typeof salesSearchFiltersSchema>;

// ── Company research output ───────────────────────────────────────────────

export const companyProfileSchema = z.object({
  summary: z.string().max(4000),
  industry: z.string().max(80).optional(),
  size: z.string().max(20).optional(),
  geography: z.string().max(120).optional(),
  businessModel: z.string().max(400).optional(),
  productsServices: z.string().max(1000).optional(),
  targetMarket: z.string().max(400).optional(),
  techStack: z.array(z.string().max(60)).max(30).optional(),
  socialLinks: z.array(z.object({ type: z.string().max(30), url: z.string().url().max(300) })).max(10).optional(),
  sources: z.array(z.object({ url: z.string().url().max(2000), title: z.string().max(500).default("") })).max(50).default([]),
});
export type CompanyProfile = z.infer<typeof companyProfileSchema>;
