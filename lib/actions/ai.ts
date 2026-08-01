"use server";

import { revalidatePath } from "next/cache";
import crypto from "node:crypto";

import { db } from "@/lib/db";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import {
  checkPermission,
  resolveWorkspaceContext,
} from "@/lib/workspace";
import {
  aiSettingsSchema,
  apiKeyCreateSchema,
  memoryWriteSchema,
  providerConfigSchema,
  providerConfigUpdateSchema,
  promptTemplateSchema,
  workflowSaveSchema,
} from "@/lib/validations/ai";
import { generateApiKey } from "@/lib/api-auth";
import { getRuntime } from "@/lib/ai/runtime";
import { createChatProvider, providerMetaUpper, type ProviderId } from "@runtime/providers/registry";
import { decryptSecret } from "@/lib/crypto";
import { renderPrompt, promptVariablesSchema } from "@runtime/prompts/renderer";
import { workflowDefinitionSchema } from "@runtime/workflows/executor";

/** Server actions powering the AI dashboard surfaces. Every mutation is
 * permission-gated + audited; secrets re-encrypt at the boundary. */

export type AiFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  result?: string;
};

async function requireAi(action: Parameters<typeof checkPermission>[1]) {
  const resolved = await resolveWorkspaceContext();
  if (!("ctx" in resolved)) {
    return { ctx: null, denied: "error" in resolved ? resolved.error : "Sign in and select a workspace." };
  }
  const denied = checkPermission(resolved.ctx, action);
  if (denied) return { ctx: null, denied };
  return { ctx: resolved.ctx, denied: null };
}

// ── Provider configs ─────────────────────────────────────────────────────

export async function createProviderConfig(
  _prev: AiFormState,
  formData: FormData
): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("ai.providers.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };

  const parsed = providerConfigSchema.safeParse({
    provider: formData.get("provider"),
    label: formData.get("label"),
    apiKey: formData.get("apiKey") || undefined,
    baseUrl: formData.get("baseUrl") || undefined,
    defaultModel: formData.get("defaultModel") || undefined,
    priority: formData.get("priority"),
    enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  }
  const data = parsed.data;

  if (providerMetaUpper(data.provider).requiresKey && !data.apiKey) {
    return { error: `${data.provider} connections need an API key.` };
  }

  // Verify the connection BEFORE persisting — never store dead credentials.
  try {
    const adapter = createChatProvider(
      data.provider.toLowerCase() as ProviderId,
      { apiKey: data.apiKey, baseUrl: data.baseUrl },
      { model: data.defaultModel }
    );
    const health = await adapter.healthCheck();
    if (!health.ok) {
      return { error: `Connection test failed — credentials NOT saved. ${health.error ?? ""}`.trim() };
    }
  } catch (err) {
    return { error: `Connection test failed — credentials NOT saved. ${(err as Error).message}` };
  }

  try {
    await db.aiProviderConfig.create({
      data: {
        workspaceId: ctx.workspace.id,
        provider: data.provider,
        label: data.label,
        baseUrl: data.baseUrl ?? null,
        apiKeyEnc: data.apiKey ? encryptSecret(data.apiKey) : null,
        enabled: data.enabled,
        priority: data.priority,
        defaultModel: data.defaultModel ?? null,
        createdById: ctx.user.id,
        healthStatus: "ok",
        healthCheckedAt: new Date(),
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { error: `A connection named "${data.label}" already exists in this workspace.` };
    }
    throw err;
  }

  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.aiProviderCreate,
    targetType: "ai_provider",
    targetId: data.label,
    metadata: { provider: data.provider, priority: data.priority },
  });
  revalidatePath("/dashboard/ai-providers");
  return { ok: true };
}

export async function updateProviderConfig(
  _prev: AiFormState,
  formData: FormData
): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("ai.providers.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };

  const parsed = providerConfigUpdateSchema.safeParse({
    id: formData.get("id"),
    label: formData.get("label") || undefined,
    apiKey: formData.get("apiKey") || undefined,
    baseUrl: formData.get("baseUrl") || undefined,
    defaultModel: formData.get("defaultModel") || undefined,
    priority: formData.get("priority") || undefined,
    enabled: formData.get("enabled") === null ? undefined : formData.get("enabled") === "on" || formData.get("enabled") === "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check inputs." };

  const existing = await db.aiProviderConfig.findFirst({
    where: { id: parsed.data.id, workspaceId: ctx.workspace.id },
  });
  if (!existing) return { error: "Connection not found." };

  // If a new key/baseUrl is supplied, re-verify before saving.
  if (parsed.data.apiKey || parsed.data.baseUrl !== undefined) {
    const apiKey = parsed.data.apiKey ?? (existing.apiKeyEnc ? decryptSecret(existing.apiKeyEnc) : undefined);
    try {
      const adapter = createChatProvider(
        existing.provider.toLowerCase() as ProviderId,
        { apiKey, baseUrl: parsed.data.baseUrl ?? existing.baseUrl ?? undefined },
        { model: parsed.data.defaultModel ?? existing.defaultModel ?? undefined }
      );
      const health = await adapter.healthCheck();
      if (!health.ok) return { error: `Connection test failed — changes NOT saved. ${health.error ?? ""}`.trim() };
    } catch (err) {
      return { error: `Connection test failed — changes NOT saved. ${(err as Error).message}` };
    }
  }

  await db.aiProviderConfig.update({
    where: { id: existing.id },
    data: {
      label: parsed.data.label,
      baseUrl: parsed.data.baseUrl,
      defaultModel: parsed.data.defaultModel,
      priority: parsed.data.priority,
      enabled: parsed.data.enabled,
      ...(parsed.data.apiKey ? { apiKeyEnc: encryptSecret(parsed.data.apiKey) } : {}),
    },
  });
  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.aiProviderUpdate,
    targetType: "ai_provider",
    targetId: existing.label,
    metadata: {},
  });
  revalidatePath("/dashboard/ai-providers");
  return { ok: true };
}

export async function deleteProviderConfig(id: string): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("ai.providers.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const result = await db.aiProviderConfig.deleteMany({
    where: { id, workspaceId: ctx.workspace.id },
  });
  if (!result.count) return { error: "Connection not found." };
  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.aiProviderDelete,
    targetType: "ai_provider",
    targetId: id,
    metadata: {},
  });
  revalidatePath("/dashboard/ai-providers");
  return { ok: true };
}

export async function testProviderConfig(id: string): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("ai.providers.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const config = await db.aiProviderConfig.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
  });
  if (!config) return { error: "Connection not found." };
  try {
    const adapter = createChatProvider(
      config.provider.toLowerCase() as ProviderId,
      { apiKey: config.apiKeyEnc ? decryptSecret(config.apiKeyEnc) : undefined, baseUrl: config.baseUrl ?? undefined },
      { model: config.defaultModel ?? undefined }
    );
    const health = await adapter.healthCheck();
    await db.aiProviderConfig.update({
      where: { id: config.id },
      data: {
        healthStatus: health.ok ? "ok" : "error",
        healthCheckedAt: new Date(),
        healthError: health.ok ? null : (health.error ?? "unknown").slice(0, 300),
      },
    });
    await audit({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      action: AUDIT_ACTIONS.aiProviderTest,
      targetType: "ai_provider",
      targetId: config.label,
      metadata: { ok: health.ok, latencyMs: health.latencyMs },
    });
    revalidatePath("/dashboard/ai-providers");
    return health.ok
      ? { ok: true, result: `Healthy · ${health.latencyMs}ms` }
      : { error: health.error ?? "Unhealthy" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── AI settings ──────────────────────────────────────────────────────────

export async function updateAiSettings(
  _prev: AiFormState,
  formData: FormData
): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("ai.settings.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };

  const parsed = aiSettingsSchema.safeParse({
    defaultProvider: formData.get("defaultProvider") || null,
    defaultModel: formData.get("defaultModel"),
    memoryMaxRecords: formData.get("memoryMaxRecords"),
    memoryRetentionDays: formData.get("memoryRetentionDays"),
    memorySummarizeAfter: formData.get("memorySummarizeAfter"),
    knowledgeMaxDocuments: formData.get("knowledgeMaxDocuments"),
    knowledgeMaxFileMB: formData.get("knowledgeMaxFileMB"),
    knowledgeMaxChunksPerDoc: formData.get("knowledgeMaxChunksPerDoc"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check inputs." };

  const toolPermissions: Record<string, boolean> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("tool:")) toolPermissions[key.slice(5)] = value === "on";
  }
  // Unchecked checkboxes omit keys → explicit false for known tools.
  const runtime = getRuntime();
  for (const tool of runtime.tools.list()) {
    if (!(tool.name in toolPermissions)) toolPermissions[tool.name] = false;
  }

  await db.aiWorkspaceSettings.upsert({
    where: { workspaceId: ctx.workspace.id },
    create: { workspaceId: ctx.workspace.id, ...parsed.data, toolPermissions, updatedById: ctx.user.id },
    update: { ...parsed.data, toolPermissions, updatedById: ctx.user.id },
  });
  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.aiSettingsUpdate,
    targetType: "ai_settings",
    metadata: { defaultModel: parsed.data.defaultModel },
  });
  revalidatePath("/dashboard/ai-providers");
  return { ok: true };
}

// ── Prompt templates ─────────────────────────────────────────────────────

export async function savePromptTemplate(
  _prev: AiFormState,
  formData: FormData
): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("ai.prompts.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };

  const parsed = promptTemplateSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    content: formData.get("content"),
    variables: JSON.parse((formData.get("variables") as string) || "[]"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check inputs." };

  const templateKey = (formData.get("templateKey") as string) || crypto.randomUUID();
  const latest = await db.promptTemplate.findFirst({
    where: { workspaceId: ctx.workspace.id, templateKey },
    orderBy: { version: "desc" },
  });
  const version = (latest?.version ?? 0) + 1;

  await db.promptTemplate.create({
    data: {
      workspaceId: ctx.workspace.id,
      templateKey,
      name: parsed.data.name,
      kind: parsed.data.kind,
      content: parsed.data.content,
      variables: parsed.data.variables as object[],
      version,
      notes: parsed.data.notes ?? null,
      status: "DRAFT",
      createdById: ctx.user.id,
    },
  });
  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: latest ? AUDIT_ACTIONS.aiPromptUpdate : AUDIT_ACTIONS.aiPromptCreate,
    targetType: "prompt_template",
    targetId: templateKey,
    metadata: { version },
  });
  revalidatePath("/dashboard/prompts");
  return { ok: true, result: `Saved as version ${version}.` };
}

export async function publishPromptVersion(id: string): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("ai.prompts.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const version = await db.promptTemplate.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
  });
  if (!version) return { error: "Version not found." };

  await db.$transaction([
    db.promptTemplate.updateMany({
      where: { workspaceId: ctx.workspace.id, templateKey: version.templateKey, status: "PUBLISHED" },
      data: { status: "ARCHIVED" },
    }),
    db.promptTemplate.update({
      where: { id: version.id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    }),
  ]);
  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.aiPromptPublish,
    targetType: "prompt_template",
    targetId: version.templateKey,
    metadata: { version: version.version },
  });
  revalidatePath("/dashboard/prompts");
  return { ok: true, result: `v${version.version} is now live.` };
}

export async function deletePromptTemplate(id: string): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("ai.prompts.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const result = await db.promptTemplate.deleteMany({
    where: { id, workspaceId: ctx.workspace.id, status: { not: "PUBLISHED" } },
  });
  if (!result.count) return { error: "Only draft/archived versions can be deleted." };
  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.aiPromptDelete,
    targetType: "prompt_template",
    targetId: id,
    metadata: {},
  });
  revalidatePath("/dashboard/prompts");
  return { ok: true };
}

export async function testPromptRender(
  content: string,
  variablesJson: string,
  valuesJson: string
): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("ai.prompts.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  try {
    const variables = promptVariablesSchema.parse(JSON.parse(variablesJson || "[]"));
    const values = JSON.parse(valuesJson || "{}") as Record<string, string>;
    const result = renderPrompt(content, variables, values);
    return {
      ok: true,
      result: JSON.stringify({
        rendered: result.rendered.slice(0, 4000),
        warnings: result.warnings,
        used: result.used,
      }),
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Memory ───────────────────────────────────────────────────────────────

export async function writeMemory(
  _prev: AiFormState,
  formData: FormData
): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("ai.memory.write");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const parsed = memoryWriteSchema.safeParse({
    scope: formData.get("scope"),
    content: formData.get("content"),
    importance: formData.get("importance"),
    tagsCsv: formData.get("tagsCsv") || undefined,
    expiresInDays: formData.get("expiresInDays") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check inputs." };

  const runtime = getRuntime();
  let embedding: number[] | undefined;
  try {
    const response = await runtime.router.embed(
      { workspaceId: ctx.workspace.id, userId: ctx.user.id },
      { texts: [parsed.data.content], taskType: "RETRIEVAL_DOCUMENT" }
    );
    embedding = response.vectors[0];
  } catch {
    embedding = undefined;
  }

  await runtime.memory.remember({
    workspaceId: ctx.workspace.id,
    scope: parsed.data.scope,
    content: parsed.data.content,
    importance: parsed.data.importance,
    tags: parsed.data.tagsCsv
      ? parsed.data.tagsCsv.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10)
      : [],
    expiresAt: parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000)
      : null,
    createdById: ctx.user.id,
    embedding,
  });
  revalidatePath("/dashboard/memory");
  return { ok: true, result: embedding ? "Stored with semantic embedding." : "Stored (no embedding provider configured)." };
}

export async function forgetMemory(id: string): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("ai.memory.delete");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const record = await db.memoryRecord.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
  });
  if (!record) return { error: "Memory not found." };
  await db.memoryRecord.delete({ where: { id } });
  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.aiMemoryForget,
    targetType: "memory_record",
    targetId: id,
    metadata: { scope: record.scope },
  });
  revalidatePath("/dashboard/memory");
  return { ok: true };
}

// ── Knowledge ingestion (server-action path mirrors the REST endpoint) ───

export async function ingestKnowledgeFile(formData: FormData): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("knowledge.write");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a file to ingest." };

  const settings = await db.aiWorkspaceSettings.findUnique({ where: { workspaceId: ctx.workspace.id } });
  const runtime = getRuntime();
  try {
    const document = await runtime.knowledge.ingestFile({
      workspaceId: ctx.workspace.id,
      filename: file.name,
      mime: file.type || undefined,
      buffer: Buffer.from(await file.arrayBuffer()),
      limits: {
        maxDocuments: settings?.knowledgeMaxDocuments ?? 200,
        maxFileBytes: (settings?.knowledgeMaxFileMB ?? 10) * 1024 * 1024,
        maxChunksPerDoc: settings?.knowledgeMaxChunksPerDoc ?? 2000,
      },
      createdById: ctx.user.id,
    });
    await audit({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      action: AUDIT_ACTIONS.aiKnowledgeIngest,
      targetType: "knowledge_document",
      targetId: document.id,
      metadata: { title: document.title, chunks: document.chunkCount },
    });
    revalidatePath("/dashboard/knowledge");
    return { ok: true, result: `Indexed "${document.title}" into ${document.chunkCount} chunks.` };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Workflows ────────────────────────────────────────────────────────────

export async function saveWorkflow(
  _prev: AiFormState,
  formData: FormData
): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("ai.workflows.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const parsed = workflowSaveSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    definition: JSON.parse((formData.get("definition") as string) || "null"),
  });
  if (!parsed.success || !parsed.data.definition) {
    return { error: !parsed.success ? parsed.error.issues[0]?.message : "Definition JSON is required." };
  }
  const definition = workflowDefinitionSchema.safeParse(parsed.data.definition);
  if (!definition.success) {
    return { error: `Invalid graph: ${definition.error.issues[0]?.message}` };
  }

  const existingId = (formData.get("id") as string) || null;
  if (existingId) {
    const existing = await db.workflowDef.findFirst({
      where: { id: existingId, workspaceId: ctx.workspace.id, deletedAt: null },
    });
    if (!existing) return { error: "Workflow not found." };
    await db.workflowDef.update({
      where: { id: existing.id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        definition: definition.data as object,
        version: { increment: 1 },
      },
    });
  } else {
    await db.workflowDef.create({
      data: {
        workspaceId: ctx.workspace.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        definition: definition.data as object,
        createdById: ctx.user.id,
      },
    });
  }
  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: existingId ? AUDIT_ACTIONS.aiWorkflowUpdate : AUDIT_ACTIONS.aiWorkflowCreate,
    targetType: "workflow_def",
    targetId: existingId ?? parsed.data.name,
    metadata: {},
  });
  revalidatePath("/dashboard/workflows");
  return { ok: true };
}

export async function deleteWorkflow(id: string): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("ai.workflows.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const result = await db.workflowDef.updateMany({
    where: { id, workspaceId: ctx.workspace.id },
    data: { deletedAt: new Date() },
  });
  if (!result.count) return { error: "Workflow not found." };
  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.aiWorkflowDelete,
    targetType: "workflow_def",
    targetId: id,
    metadata: {},
  });
  revalidatePath("/dashboard/workflows");
  return { ok: true };
}

// ── API keys ─────────────────────────────────────────────────────────────

export async function createApiKey(
  _prev: AiFormState,
  formData: FormData
): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("apikeys.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const parsed = apiKeyCreateSchema.safeParse({
    name: formData.get("name"),
    scopes: formData.getAll("scopes").length ? formData.getAll("scopes") : ["read"],
    expiresInDays: formData.get("expiresInDays") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check inputs." };

  const { rawKey, prefix, keyHash } = generateApiKey();
  await db.apiKey.create({
    data: {
      workspaceId: ctx.workspace.id,
      name: parsed.data.name,
      prefix,
      keyHash,
      scopes: parsed.data.scopes,
      expiresAt: parsed.data.expiresInDays
        ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000)
        : null,
      createdById: ctx.user.id,
    },
  });
  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.aiApiKeyCreate,
    targetType: "api_key",
    targetId: prefix,
    metadata: { scopes: parsed.data.scopes },
  });
  revalidatePath("/dashboard/api-keys");
  // The raw key is returned ONCE and never stored readable again.
  return { ok: true, result: rawKey };
}

export async function revokeApiKey(id: string): Promise<AiFormState> {
  const { ctx, denied } = await requireAi("apikeys.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const result = await db.apiKey.updateMany({
    where: { id, workspaceId: ctx.workspace.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!result.count) return { error: "Key not found or already revoked." };
  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: AUDIT_ACTIONS.aiApiKeyRevoke,
    targetType: "api_key",
    targetId: id,
    metadata: {},
  });
  revalidatePath("/dashboard/api-keys");
  return { ok: true };
}
