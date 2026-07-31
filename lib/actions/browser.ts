"use server";

import { revalidatePath } from "next/cache";

import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { checkPermission, resolveWorkspaceContext } from "@/lib/workspace";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import {
  browserPolicySchema, browserSettingsSchema, parseDomainLines,
  planRunSchema, profileCreateSchema, quickActionSchema, sessionCreateSchema,
} from "@/lib/validations/browser";
import { executionStartSchema } from "@cue/index";

/** Server actions powering the Computer Use dashboard surfaces. */

export type BrowserFormState = {
  ok?: boolean;
  error?: string;
  result?: string;
  executionId?: string;
  sessionId?: string;
};

async function requireBrowser(action: Parameters<typeof checkPermission>[1]) {
  const resolved = await resolveWorkspaceContext();
  if (!("ctx" in resolved)) {
    return { ctx: null, denied: "error" in resolved ? resolved.error : "Sign in and select a workspace." };
  }
  const denied = checkPermission(resolved.ctx, action);
  if (denied) return { ctx: null, denied };
  return { ctx: resolved.ctx, denied: null };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 300) : "Unexpected error.";
}

// ── Sessions ─────────────────────────────────────────────────────────────

export async function createSessionAction(_prev: BrowserFormState, formData: FormData): Promise<BrowserFormState> {
  const { ctx, denied } = await requireBrowser("browser.execute");
  if (denied || !ctx) return { error: denied ?? "Access denied." };

  const parsed = sessionCreateSchema.safeParse({
    kind: formData.get("kind") || "EPHEMERAL",
    profileId: formData.get("profileId") || null,
    browser: formData.get("browser") || null,
    startUrl: formData.get("startUrl") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    const runtime = getBrowserRuntime();
    const { startUrl, profileId, browser, kind } = parsed.data;
    if (startUrl) {
      const policy = await runtime.permissions.policyFor(ctx.workspace.id);
      const verdict = runtime.permissions.assertNavigation(policy, startUrl);
      if (verdict.needsConfirmation) {
        return { error: `startUrl matches confirmation rule "${verdict.matched}" — open without an URL and navigate via a plan (approval gate).` };
      }
    }
    const row = await runtime.sessions.create({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      kind,
      profileId: profileId ?? null,
      ...(browser ? { browser } : {}),
      ...(startUrl ? { startUrl } : {}),
    });
    revalidatePath("/dashboard/browser");
    return { ok: true, sessionId: row.id, result: `Session ${row.id.slice(0, 8)} (${row.browser}, ${row.kind}) is live.` };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

export async function closeSessionAction(_prev: BrowserFormState, formData: FormData): Promise<BrowserFormState> {
  const { ctx, denied } = await requireBrowser("browser.execute");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return { error: "sessionId required." };
  try {
    await getBrowserRuntime().sessions.close(sessionId, ctx.workspace.id, { reason: "closed from dashboard" });
    revalidatePath("/dashboard/browser");
    return { ok: true, result: "Session closed." };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

// ── Profiles ─────────────────────────────────────────────────────────────

export async function createProfileAction(_prev: BrowserFormState, formData: FormData): Promise<BrowserFormState> {
  const { ctx, denied } = await requireBrowser("browser.profiles.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const parsed = profileCreateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    browser: formData.get("browser") || "CHROMIUM",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  try {
    const runtime = getBrowserRuntime();
    const row = await runtime.profiles.create({
      workspaceId: ctx.workspace.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      browser: parsed.data.browser,
      userAgent: null,
      viewport: null,
      createdById: ctx.user.id,
    });
    await audit({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: AUDIT_ACTIONS.browserProfileCreate, targetType: "profile", targetId: row.id,
      metadata: { name: row.name },
    });
    revalidatePath("/dashboard/browser");
    return { ok: true, result: `Profile "${row.name}" created.` };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

export async function deleteProfileAction(_prev: BrowserFormState, formData: FormData): Promise<BrowserFormState> {
  const { ctx, denied } = await requireBrowser("browser.profiles.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const profileId = String(formData.get("profileId") ?? "");
  if (!profileId) return { error: "profileId required." };
  try {
    await getBrowserRuntime().profiles.softDelete(profileId, ctx.workspace.id);
    await audit({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: AUDIT_ACTIONS.browserProfileDelete, targetType: "profile", targetId: profileId,
    });
    revalidatePath("/dashboard/browser");
    return { ok: true, result: "Profile deleted (stored state wiped)." };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

// ── Actions + executions ─────────────────────────────────────────────────

export async function runQuickAction(_prev: BrowserFormState, formData: FormData): Promise<BrowserFormState> {
  const { ctx, denied } = await requireBrowser("browser.execute");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const parsed = quickActionSchema.safeParse({
    sessionId: formData.get("sessionId"),
    preset: formData.get("preset"),
    url: formData.get("url") || undefined,
    fullPage: formData.get("fullPage") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const { preset, sessionId, url, fullPage } = parsed.data;
  const step =
    preset === "navigate"
      ? { action: "navigate", args: { url: url ?? "" } }
      : preset === "screenshot"
        ? { action: "take_screenshot", args: { fullPage } }
        : preset === "extract_links"
          ? { action: "extract_links", args: {} }
          : { action: "extract_text", args: {} };
  if (preset === "navigate" && !url) return { error: "URL required for navigate." };

  try {
    const runtime = getBrowserRuntime();
    const row = await runtime.executions.runInline({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      sessionId,
      steps: [step],
    });
    const output = (row.result as { outputs?: Record<string, unknown> } | null)?.outputs?.["1"];
    revalidatePath("/dashboard/browser/live");
    return {
      ok: row.status === "SUCCEEDED",
      executionId: row.id,
      result: row.status === "SUCCEEDED"
        ? `${preset} succeeded: ${JSON.stringify(output ?? {}).slice(0, 600)}`
        : `${preset} failed: ${row.error ?? "unknown error"}`,
      error: row.status === "SUCCEEDED" ? undefined : (row.error ?? "Action failed."),
    };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

export async function runPlanAction(_prev: BrowserFormState, formData: FormData): Promise<BrowserFormState> {
  const { ctx, denied } = await requireBrowser("browser.execute");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const parsed = planRunSchema.safeParse({
    sessionId: formData.get("sessionId"),
    goal: formData.get("goal") || undefined,
    stepsJson: formData.get("stepsJson"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  try {
    const plan = executionStartSchema.parse({
      sessionId: parsed.data.sessionId,
      goal: parsed.data.goal,
      steps: JSON.parse(parsed.data.stepsJson),
    });
    const runtime = getBrowserRuntime();
    const row = await runtime.executions.start({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      sessionId: plan.sessionId,
      ...(plan.goal ? { goal: plan.goal } : {}),
      steps: plan.steps,
    });
    revalidatePath("/dashboard/browser/live");
    return { ok: true, executionId: row.id, result: `Execution ${row.id.slice(0, 8)} queued (${row.stepCount} steps).` };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

export async function cancelExecutionAction(_prev: BrowserFormState, formData: FormData): Promise<BrowserFormState> {
  const { ctx, denied } = await requireBrowser("browser.execute");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const executionId = String(formData.get("executionId") ?? "");
  if (!executionId) return { error: "executionId required." };
  try {
    await getBrowserRuntime().executions.cancel(executionId, ctx.workspace.id);
    revalidatePath("/dashboard/browser/live");
    revalidatePath("/dashboard/browser/history");
    return { ok: true, result: "Execution cancelled." };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

export async function resumeExecutionAction(_prev: BrowserFormState, formData: FormData): Promise<BrowserFormState> {
  const { ctx, denied } = await requireBrowser("browser.execute");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const executionId = String(formData.get("executionId") ?? "");
  if (!executionId) return { error: "executionId required." };
  try {
    const runtime = getBrowserRuntime();
    const execution = await runtime.executions.get(executionId, ctx.workspace.id);
    if (!execution.approvalId) return { error: "Execution is not parked on an approval." };
    const { db } = await import("@/lib/db");
    const approval = await db.approval.findFirst({ where: { id: execution.approvalId, workspaceId: ctx.workspace.id } });
    if (!approval || approval.status !== "APPROVED") {
      return { error: approval ? `Approval is ${approval.status.toLowerCase()} — decide it on the Approvals page first.` : "Approval not found." };
    }
    await runtime.executions.resume(executionId, ctx.workspace.id);
    revalidatePath("/dashboard/browser/history");
    return { ok: true, result: "Execution resumed." };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

// ── Files ────────────────────────────────────────────────────────────────

export async function stageUploadAction(_prev: BrowserFormState, formData: FormData): Promise<BrowserFormState> {
  const { ctx, denied } = await requireBrowser("browser.execute");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to stage." };
  try {
    const runtime = getBrowserRuntime();
    const settings = await runtime.repos.settings.getSettings(ctx.workspace.id);
    const { row, deduplicated } = await runtime.uploads.store({
      workspaceId: ctx.workspace.id,
      uploaderId: ctx.user.id,
      filename: file.name || "upload.bin",
      mime: file.type || "application/octet-stream",
      data: Buffer.from(await file.arrayBuffer()),
      maxBytes: settings.maxArtifactMB * 1024 * 1024,
    });
    await audit({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: AUDIT_ACTIONS.browserUploadStore, targetType: "upload", targetId: row.id,
      metadata: { filename: row.filename, bytes: row.sizeBytes },
    });
    revalidatePath("/dashboard/browser/uploads");
    return { ok: true, result: `${row.filename} staged (${(row.sizeBytes / 1024).toFixed(1)}KB)${deduplicated ? " — content deduped" : ""}.` };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

export async function deleteUploadAction(_prev: BrowserFormState, formData: FormData): Promise<BrowserFormState> {
  const { ctx, denied } = await requireBrowser("browser.downloads.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const id = String(formData.get("id") ?? "");
  try {
    await getBrowserRuntime().uploads.delete(id, ctx.workspace.id);
    await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: AUDIT_ACTIONS.browserUploadDelete, targetType: "upload", targetId: id });
    revalidatePath("/dashboard/browser/uploads");
    return { ok: true, result: "Upload deleted." };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

export async function deleteDownloadAction(_prev: BrowserFormState, formData: FormData): Promise<BrowserFormState> {
  const { ctx, denied } = await requireBrowser("browser.downloads.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const id = String(formData.get("id") ?? "");
  try {
    await getBrowserRuntime().downloads.delete(id, ctx.workspace.id);
    await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: AUDIT_ACTIONS.browserDownloadDelete, targetType: "download", targetId: id });
    revalidatePath("/dashboard/browser/downloads");
    return { ok: true, result: "Download deleted." };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

// ── Settings + policy ────────────────────────────────────────────────────

export async function saveBrowserSettingsAction(_prev: BrowserFormState, formData: FormData): Promise<BrowserFormState> {
  const { ctx, denied } = await requireBrowser("browser.settings.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const bool = (name: string) => formData.get(name) === "on";
  const parsed = browserSettingsSchema.safeParse({
    defaultBrowser: formData.get("defaultBrowser") || "CHROMIUM",
    headless: bool("headless"),
    actionTimeoutMs: Number(formData.get("actionTimeoutMs") ?? 30_000),
    executionTimeoutMs: Number(formData.get("executionTimeoutMs") ?? 120_000),
    sessionIdleTimeoutSec: Number(formData.get("sessionIdleTimeoutSec") ?? 600),
    maxConcurrentSessions: Number(formData.get("maxConcurrentSessions") ?? 3),
    dialogPolicy: formData.get("dialogPolicy") || "dismiss",
    screenshotOnFail: bool("screenshotOnFail"),
    recordScreenshots: bool("recordScreenshots"),
    maxArtifactMB: Number(formData.get("maxArtifactMB") ?? 25),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  try {
    const runtime = getBrowserRuntime();
    await runtime.repos.settings.saveSettings({ workspaceId: ctx.workspace.id, ...parsed.data }, ctx.user.id);
    await audit({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: AUDIT_ACTIONS.browserSettingsUpdate, targetType: "settings",
      metadata: parsed.data as Record<string, unknown>,
    });
    revalidatePath("/dashboard/browser/settings");
    return { ok: true, result: "Browser engine settings saved." };
  } catch (err) {
    return { error: messageOf(err) };
  }
}

export async function saveBrowserPolicyAction(_prev: BrowserFormState, formData: FormData): Promise<BrowserFormState> {
  const { ctx, denied } = await requireBrowser("browser.policy.manage");
  if (denied || !ctx) return { error: denied ?? "Access denied." };
  const bool = (name: string) => formData.get(name) === "on";
  const parsed = browserPolicySchema.safeParse({
    readOnly: bool("readOnly"),
    navigationOnly: bool("navigationOnly"),
    allowJavascript: bool("allowJavascript"),
    allowDownloads: bool("allowDownloads"),
    allowUploads: bool("allowUploads"),
    allowClipboard: bool("allowClipboard"),
    allowedDomains: String(formData.get("allowedDomains") ?? ""),
    blockedDomains: String(formData.get("blockedDomains") ?? ""),
    confirmationDomains: String(formData.get("confirmationDomains") ?? ""),
    defaultAllowed: bool("defaultAllowed"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;
  try {
    const runtime = getBrowserRuntime();
    await runtime.permissions.save({
      workspaceId: ctx.workspace.id,
      readOnly: d.readOnly,
      navigationOnly: d.navigationOnly,
      allowJavascript: d.allowJavascript,
      allowDownloads: d.allowDownloads,
      allowUploads: d.allowUploads,
      allowClipboard: d.allowClipboard,
      allowedDomains: parseDomainLines(d.allowedDomains),
      blockedDomains: parseDomainLines(d.blockedDomains),
      confirmationDomains: parseDomainLines(d.confirmationDomains),
      defaultAllowed: d.defaultAllowed,
    }, ctx.user.id);
    await audit({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: AUDIT_ACTIONS.browserPolicyUpdate, targetType: "policy",
      metadata: { readOnly: d.readOnly, allowJavascript: d.allowJavascript, defaultAllowed: d.defaultAllowed },
    });
    revalidatePath("/dashboard/browser/permissions");
    return { ok: true, result: "Workspace browser policy updated." };
  } catch (err) {
    return { error: messageOf(err) };
  }
}
