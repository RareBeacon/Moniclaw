import { z } from "zod";
import { PROVIDER_IDS_UPPER, providerMetaUpper } from "@runtime/providers/registry";

/** Validation for the AI dashboard surfaces (server actions). */

/** Uppercase provider ids — derived from the registry catalog (single source). */
const providerIdEnum = z.enum(PROVIDER_IDS_UPPER);

/** Custom endpoints are complete only with a base URL and a model id. */
function customEndpointNeedsBoth(data: { provider?: string; baseUrl?: string; defaultModel?: string }, ctx: z.RefinementCtx) {
  if (!data.provider) return; // partial updates: provider unchanged
  if (!providerMetaUpper(data.provider).requiresBaseUrl) return;
  if (!data.baseUrl) {
    ctx.addIssue({ code: "custom", path: ["baseUrl"], message: "Custom endpoints need a Base URL (OpenAI-compatible, e.g. https://host/v1)." });
  }
  if (!data.defaultModel) {
    ctx.addIssue({ code: "custom", path: ["defaultModel"], message: "Custom endpoints need a Default model id." });
  }
}

export const providerConfigSchema = z.object({
  provider: providerIdEnum,
  label: z.string().trim().min(2).max(60),
  apiKey: z.string().trim().max(500).optional(), // absent = keep existing
  baseUrl: z
    .string()
    .trim()
    .url()
    .max(300)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  defaultModel: z.string().trim().max(120).optional(),
  priority: z.coerce.number().int().min(1).max(999).default(100),
  enabled: z.coerce.boolean().default(true),
}).superRefine(customEndpointNeedsBoth);

export const providerConfigUpdateSchema = providerConfigSchema.partial().extend({
  id: z.string().uuid(),
}).superRefine(customEndpointNeedsBoth);

export const aiSettingsSchema = z.object({
  defaultProvider: providerIdEnum
    .optional()
    .nullable(),
  defaultModel: z.string().trim().min(2).max(120),
  memoryMaxRecords: z.coerce.number().int().min(100).max(100_000),
  memoryRetentionDays: z.coerce.number().int().min(1).max(3650),
  memorySummarizeAfter: z.coerce.number().int().min(10).max(500),
  knowledgeMaxDocuments: z.coerce.number().int().min(10).max(10_000),
  knowledgeMaxFileMB: z.coerce.number().int().min(1).max(100),
  knowledgeMaxChunksPerDoc: z.coerce.number().int().min(100).max(20_000),
});

export const promptTemplateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  kind: z.enum(["SYSTEM", "WORKSPACE", "AGENT", "TASK"]),
  content: z.string().min(1).max(30_000),
  variables: z
    .array(
      z.object({
        name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
        description: z.string().max(280).optional(),
        default: z.string().max(1000).optional(),
        required: z.boolean().default(false),
      })
    )
    .max(32)
    .default([]),
  notes: z.string().max(500).optional(),
});

export const promptTestSchema = z.object({
  content: z.string().min(1).max(30_000),
  variables: z.record(z.string(), z.string()).default({}),
  dryRun: z.boolean().default(true),
});

export const memoryWriteSchema = z.object({
  scope: z.enum(["CONVERSATION", "WORKSPACE", "AGENT", "LONG_TERM"]).default("WORKSPACE"),
  content: z.string().trim().min(3).max(8_000),
  importance: z.coerce.number().int().min(0).max(100).default(50),
  tagsCsv: z.string().max(300).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(3650).optional(),
});

export const workflowSaveSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  definition: z.unknown(),
});

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  scopes: z.array(z.enum(["read", "write"])).min(1).max(2).default(["read"]),
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});
