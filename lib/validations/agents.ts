/** Zod contracts for the /api/agents/* REST surface. */
import { z } from "zod";
import { toolPolicySchema, workerBudgetSchema, workerTypeSchema, dispatchSchema } from "@agents/index";
import { isValidCron } from "@agents/cron";

export const agentCreateApiSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase, digits, dashes").optional(),
  description: z.string().trim().min(30).max(2000),
  category: z.string().trim().max(40).optional(),
  workerType: workerTypeSchema.default("general"),
  goal: z.string().trim().min(3).max(4000).optional(),
  instructions: z.string().trim().max(4000).optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  toolPolicy: toolPolicySchema.prefault({}),
  budget: workerBudgetSchema.prefault({}),
  trigger: z.enum(["MANUAL", "SCHEDULE", "WEBHOOK", "EVENT"]).default("MANUAL"),
  schedule: z.string().trim().max(60).optional(),
  status: z.enum(["DRAFT", "SHADOW", "SUPERVISED", "AUTONOMOUS"]).default("DRAFT"),
}).superRefine((value, ctx) => {
  if (value.trigger === "SCHEDULE") {
    if (!value.schedule) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["schedule"], message: "SCHEDULE triggers need a 5-field cron expression." });
    } else if (!isValidCron(value.schedule)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["schedule"], message: "Not a valid 5-field cron expression." });
    }
  }
});

export const agentUpdateApiSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().min(30).max(2000).optional(),
  category: z.string().trim().max(40).nullable().optional(),
  workerType: workerTypeSchema.optional(),
  goal: z.string().trim().min(3).max(4000).nullable().optional(),
  instructions: z.string().trim().max(4000).nullable().optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  toolPolicy: toolPolicySchema.optional(),
  budget: workerBudgetSchema.optional(),
  trigger: z.enum(["MANUAL", "SCHEDULE", "WEBHOOK", "EVENT"]).optional(),
  schedule: z.string().trim().max(60).nullable().optional(),
  status: z.enum(["DRAFT", "SHADOW", "SUPERVISED", "AUTONOMOUS", "PAUSED"]).optional(),
}).superRefine((value, ctx) => {
  if (value.schedule && !isValidCron(value.schedule)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["schedule"], message: "Not a valid 5-field cron expression." });
  }
});

export const dispatchApiSchema = dispatchSchema;

// ── Phase 7 · Multi-agent teams ──────────────────────────────────────────

const teamMemberSchema = z.object({
  agentId: z.string().uuid(),
  promptHint: z.string().trim().min(3).max(240).nullish(),
  position: z.coerce.number().int().min(0).max(99).default(0),
});

export const teamCreateApiSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase, digits, dashes").optional(),
  description: z.string().trim().max(500).nullish(),
  leaderAgentId: z.string().uuid().nullish(),
  members: z.array(teamMemberSchema).max(12).default([]),
  budget: workerBudgetSchema.partial().optional(),
});

export const teamUpdateApiSchema = teamCreateApiSchema.partial();

/** Team runs need a concrete objective (the leader delegates against it). */
export const teamRunApiSchema = z.object({
  goal: z.string().trim().min(3).max(2000),
  mode: z.enum(["LIVE", "SHADOW"]).optional(),
  idempotencyKey: z.string().trim().min(4).max(120).optional(),
});

export const runListQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
  status: z.enum(["QUEUED", "RUNNING", "NEEDS_APPROVAL", "SUCCEEDED", "FAILED", "CANCELED"]).optional(),
  teamId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const eventListQuerySchema = z.object({
  after: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
