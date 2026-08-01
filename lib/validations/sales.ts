/** Zod contracts for the /api/sales/* REST surface.
 *  Create schemas are reused verbatim from the sales-runtime package;
 *  update schemas are re-declared with every field optional (never
 *  `.partial()` over defaulted fields — a partially-submitted array would
 *  otherwise silently reset to its default). */
import { z } from "zod";
import {
  activityInputSchema,
  campaignInputSchema,
  campaignStepSchema,
  companyInputSchema,
  contactInputSchema,
  dealInputSchema,
  draftInputSchema,
  icpProfileSchema,
  salesSearchFiltersSchema,
  SALES_CAMPAIGN_STEP_KINDS,
  SALES_CAMPAIGN_STATUSES,
  SALES_CONTACT_SOURCES,
  SALES_CONTACT_STATUSES,
  SALES_DRAFT_CHANNELS,
} from "@sales/index";

// ── Companies ─────────────────────────────────────────────────────────────

export const companyCreateApiSchema = companyInputSchema;

export const companyUpdateApiSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  domain: z.string().trim().max(200).regex(/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i, "domain like acme.com").nullish(),
  industry: z.string().trim().max(80).nullish(),
  size: z.string().trim().max(20).nullish(),
  geography: z.string().trim().max(120).nullish(),
  businessModel: z.string().trim().max(400).nullish(),
  productsServices: z.string().trim().max(1000).nullish(),
  targetMarket: z.string().trim().max(400).nullish(),
  techStack: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  segment: z.string().trim().max(60).nullish(),
  territory: z.string().trim().max(60).nullish(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

// ── Contacts ──────────────────────────────────────────────────────────────

export const contactCreateApiSchema = contactInputSchema;

export const contactUpdateApiSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  companyId: z.string().uuid().nullish(),
  title: z.string().trim().max(120).nullish(),
  email: z.string().trim().email().max(200).nullish(),
  linkedinUrl: z.string().trim().url().max(300).nullish(),
  phone: z.string().trim().max(40).nullish(),
  notes: z.string().trim().max(4000).nullish(),
  source: z.enum(SALES_CONTACT_SOURCES).optional(),
  status: z.enum(SALES_CONTACT_STATUSES).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

// ── Deals ─────────────────────────────────────────────────────────────────

export const dealCreateApiSchema = dealInputSchema;

export const dealUpdateApiSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  valueUsd: z.number().min(0).max(1_000_000_000).nullish(),
  currency: z.string().trim().length(3).optional(),
  expectedCloseAt: z.string().datetime({ offset: true }).or(z.string().datetime()).nullish(),
  primaryContactId: z.string().uuid().nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export const dealMoveApiSchema = z.object({
  stageId: z.string().uuid(),
});

export const dealCloseApiSchema = z.object({
  status: z.enum(["WON", "LOST"]),
  lostReason: z.string().trim().max(400).optional(),
});

// ── Activities ────────────────────────────────────────────────────────────

export const activityCreateApiSchema = activityInputSchema;

export const activityListQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  openOnly: z.coerce.boolean().optional(),
  dueBefore: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
});

// ── Pipelines ─────────────────────────────────────────────────────────────

export const pipelineCreateApiSchema = z.object({
  name: z.string().trim().min(2).max(80),
  stages: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    winProbability: z.number().int().min(0).max(100).default(25),
  })).min(1).max(20),
});

// ── Campaigns ─────────────────────────────────────────────────────────────

export const campaignCreateApiSchema = campaignInputSchema;

export const campaignUpdateApiSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  goal: z.string().trim().max(400).nullish(),
  dailyCap: z.number().int().min(1).max(200).optional(),
  sendWindow: z.object({
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([1, 2, 3, 4, 5]),
    startHour: z.number().int().min(0).max(23).default(9),
    endHour: z.number().int().min(0).max(23).default(17),
    timezone: z.string().trim().max(60).default("UTC"),
  }).optional(),
  knowledgeContext: z.string().trim().max(1000).nullish(),
});

export const campaignStatusApiSchema = z.object({
  status: z.enum(SALES_CAMPAIGN_STATUSES),
});

export const campaignStepsApiSchema = z.object({
  steps: z.array(campaignStepSchema).min(1).max(20),
});

export const campaignEnrollApiSchema = z.object({
  contactId: z.string().uuid().optional(),
  contactIds: z.array(z.string().uuid()).max(100).optional(),
}).refine((v) => v.contactId || v.contactIds?.length, {
  message: "Provide contactId or contactIds.",
});

export const enrollmentStatusApiSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "UNSUBSCRIBED"]),
});

export { SALES_CAMPAIGN_STEP_KINDS };

// ── Drafts ────────────────────────────────────────────────────────────────

export const draftCreateApiSchema = draftInputSchema;

export const draftUpdateApiSchema = z.object({
  subject: z.string().trim().max(300).nullish(),
  body: z.string().trim().min(10).max(20000).optional(),
  channel: z.enum(SALES_DRAFT_CHANNELS).optional(),
});

export const draftRescheduleApiSchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
});

export const draftRejectApiSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

// ── Research ──────────────────────────────────────────────────────────────

export const researchRequestApiSchema = z.object({
  companyId: z.string().uuid(),
});

// ── Analytics / searches / settings ───────────────────────────────────────

export const savedSearchApiSchema = z.object({
  name: z.string().trim().min(2).max(80),
  entity: z.enum(["companies", "contacts", "deals"]),
  filters: salesSearchFiltersSchema,
});

export { salesSearchFiltersSchema };

export const salesSettingsApiSchema = z.object({
  icpProfile: icpProfileSchema.optional(),
  defaultSendWindow: z.object({
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([1, 2, 3, 4, 5]),
    startHour: z.number().int().min(0).max(23).default(9),
    endHour: z.number().int().min(0).max(23).default(17),
    timezone: z.string().trim().max(60).default("UTC"),
  }).optional(),
  senderName: z.string().trim().max(120).nullish(),
  senderTitle: z.string().trim().max(120).nullish(),
});

// ── Email connections (Phase 6 — outbound identities) ─────────────────────

/** All AWS regions that expose an SES SMTP endpoint. */
export const SES_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "af-south-1", "ap-south-1", "ap-south-2", "ap-southeast-1", "ap-southeast-2",
  "ap-southeast-3", "ap-southeast-4", "ap-northeast-1", "ap-northeast-2",
  "ap-northeast-3", "ca-central-1", "ca-west-1", "eu-central-1", "eu-central-2",
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-south-1", "eu-south-2",
  "eu-north-1", "il-central-1", "me-south-1", "me-central-1", "sa-east-1",
  "us-gov-east-1", "us-gov-west-1",
] as const;

export function sesSmtpHost(region: string): string {
  return `email-smtp.${region}.amazonaws.com`;
}

const smtpHostSchema = z
  .string()
  .trim()
  .min(3)
  .max(253)
  .regex(/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/, "Enter a valid hostname (dots and dashes allowed).")
  .refine((h) => !h.includes(".."), "Enter a valid hostname.");

const emailConnectionBase = z.object({
  provider: z.enum(["SMTP", "AMAZON_SES"]).default("SMTP"),
  label: z.string().trim().min(2).max(80),
  senderName: z.string().trim().max(120).nullish(),
  senderEmail: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
  smtpHost: smtpHostSchema,
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecure: z.boolean().default(false),
  smtpUsername: z.string().trim().max(253).nullish(),
  password: z.string().min(1).max(256).nullish(), // write-only; AES-256-GCM at rest
  region: z.enum(SES_REGIONS).nullish(),
  isDefault: z.boolean().default(false),
});

export const emailConnectionCreateApiSchema = emailConnectionBase.superRefine((v, ctx) => {
  if (v.provider === "AMAZON_SES") {
    const region = v.region ?? "";
    if (!region) {
      ctx.addIssue({ code: "custom", path: ["region"], message: "Pick your SES region." });
      return;
    }
    if (!v.smtpUsername || !v.password) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "SES requires its SMTP username and password." });
    }
  }
});

export const emailConnectionUpdateApiSchema = z.object({
  label: z.string().trim().min(2).max(80).optional(),
  senderName: z.string().trim().max(120).nullish(),
  smtpHost: smtpHostSchema.optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUsername: z.string().trim().max(253).nullish(),
  password: z.string().min(1).max(256).nullish(), // omitted = keep; null = clear
  region: z.enum(SES_REGIONS).nullish(),
  isDefault: z.boolean().optional(),
});

export const emailConnectionVerifyApiSchema = z.object({
  testTo: z.string().trim().email().max(254).optional(), // when set, a real test email is delivered
});

export const draftSendApiSchema = z.object({
  connectionId: z.string().uuid().optional(), // defaults to the workspace default connection
});

export type EmailConnectionCreateInput = z.infer<typeof emailConnectionCreateApiSchema>;
export type EmailConnectionUpdateInput = z.infer<typeof emailConnectionUpdateApiSchema>;
