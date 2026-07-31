import { Prisma, type PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

import type {
  ActionEventRepository, ActionEventRow, BinaryRepository, BinaryRow,
  BrowserSettingsRow, DownloadRepository, DownloadRow, ExecutionRepository,
  ExecutionRow, PolicyRepository, PolicyRow, ProfileRepository, ProfileRow,
  RecordingRepository, RecordingRow, ScreenshotRepository, ScreenshotRow,
  SessionRepository, SessionRow, SettingsRepository, UploadRepository, UploadRow,
} from "../ports";
import type { StorageState } from "../types";

/**
 * Prisma repository adapters — the ONLY place engine ports meet the DB.
 * Services depend on the ports; the DI container (app glue) constructs
 * these with the shared PrismaClient. Row mapping keeps Prisma types from
 * leaking into the engine.
 */

/** AES-256-GCM vault seam (wired to lib/crypto in production). */
export interface SecretBox {
  seal(plaintext: string): string;
  open(box: string): string;
}

const DEFAULT_SETTINGS = (workspaceId: string): BrowserSettingsRow => ({
  workspaceId,
  defaultBrowser: "CHROMIUM",
  headless: true,
  actionTimeoutMs: 30_000,
  executionTimeoutMs: 120_000,
  sessionIdleTimeoutSec: 600,
  maxConcurrentSessions: 3,
  dialogPolicy: "dismiss",
  screenshotOnFail: true,
  recordScreenshots: true,
  maxArtifactMB: 25,
});

const DEFAULT_POLICY = (workspaceId: string): PolicyRow => ({
  workspaceId,
  readOnly: false,
  navigationOnly: false,
  allowJavascript: false,
  allowDownloads: true,
  allowUploads: true,
  allowClipboard: false,
  allowedDomains: [],
  blockedDomains: [],
  confirmationDomains: [],
  defaultAllowed: true,
});

function toSessionRow(r: Prisma.BrowserSessionGetPayload<object>): SessionRow {
  return {
    id: r.id, workspaceId: r.workspaceId, userId: r.userId, profileId: r.profileId,
    browser: r.browser, mode: r.mode, kind: r.kind, status: r.status,
    endpoint: r.endpoint, currentUrl: r.currentUrl, currentTitle: r.currentTitle,
    tabCount: r.tabCount, activeTab: r.activeTab, lastError: r.lastError,
    idleExpiresAt: r.idleExpiresAt, lastActivityAt: r.lastActivityAt,
    createdById: r.createdById, createdAt: r.createdAt, closedAt: r.closedAt,
  };
}

function toExecutionRow(r: Prisma.BrowserExecutionGetPayload<object>): ExecutionRow {
  return {
    id: r.id, workspaceId: r.workspaceId, userId: r.userId, sessionId: r.sessionId,
    goal: r.goal, status: r.status, plan: (r.plan as ExecutionRow["plan"]) ?? null,
    result: (r.result as Record<string, unknown> | null) ?? null, error: r.error,
    approvalId: r.approvalId, stepCount: r.stepCount, failedStep: r.failedStep,
    attempts: r.attempts, startedAt: r.startedAt, finishedAt: r.finishedAt, createdAt: r.createdAt,
  };
}

function toEventRow(r: Prisma.BrowserActionEventGetPayload<object>): ActionEventRow {
  return {
    id: r.id, executionId: r.executionId, workspaceId: r.workspaceId, seq: r.seq,
    action: r.action, selector: r.selector, args: r.args, status: r.status,
    attempt: r.attempt, durationMs: r.durationMs, error: r.error,
    screenshotId: r.screenshotId, healedFrom: r.healedFrom, metadata: r.metadata, createdAt: r.createdAt,
  };
}

export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly db: PrismaClient) {}

  async getSettings(workspaceId: string): Promise<BrowserSettingsRow> {
    const row = await this.db.browserWorkspaceSettings.upsert({
      where: { workspaceId },
      create: { workspaceId },
      update: {},
    });
    return {
      workspaceId,
      defaultBrowser: row.defaultBrowser,
      headless: row.headless,
      actionTimeoutMs: row.actionTimeoutMs,
      executionTimeoutMs: row.executionTimeoutMs,
      sessionIdleTimeoutSec: row.sessionIdleTimeoutSec,
      maxConcurrentSessions: row.maxConcurrentSessions,
      dialogPolicy: row.dialogPolicy === "accept" ? "accept" : "dismiss",
      screenshotOnFail: row.screenshotOnFail,
      recordScreenshots: row.recordScreenshots,
      maxArtifactMB: row.maxArtifactMB,
    };
  }

  async saveSettings(row: BrowserSettingsRow, updatedById: string): Promise<void> {
    await this.db.browserWorkspaceSettings.upsert({
      where: { workspaceId: row.workspaceId },
      create: { ...row, updatedById },
      update: { ...row, updatedById },
    });
  }
}

export class PrismaPolicyRepository implements PolicyRepository {
  constructor(private readonly db: PrismaClient) {}

  async getPolicy(workspaceId: string): Promise<PolicyRow> {
    const row = await this.db.browserPolicy.upsert({
      where: { workspaceId },
      create: { workspaceId },
      update: {},
    });
    return { ...DEFAULT_POLICY(workspaceId), ...pickPolicy(row) };
  }

  async savePolicy(row: PolicyRow, updatedById: string): Promise<void> {
    await this.db.browserPolicy.upsert({
      where: { workspaceId: row.workspaceId },
      create: { ...row, updatedById },
      update: { ...row, updatedById },
    });
  }
}

function pickPolicy(r: Prisma.BrowserPolicyGetPayload<object>): Omit<PolicyRow, "workspaceId"> {
  return {
    readOnly: r.readOnly, navigationOnly: r.navigationOnly,
    allowJavascript: r.allowJavascript, allowDownloads: r.allowDownloads,
    allowUploads: r.allowUploads, allowClipboard: r.allowClipboard,
    allowedDomains: r.allowedDomains, blockedDomains: r.blockedDomains,
    confirmationDomains: r.confirmationDomains, defaultAllowed: r.defaultAllowed,
  };
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(row: Parameters<SessionRepository["create"]>[0]): Promise<SessionRow> {
    const created = await this.db.browserSession.create({
      data: {
        ...(row.id ? { id: row.id } : {}),
        workspaceId: row.workspaceId, userId: row.userId, profileId: row.profileId,
        browser: row.browser, mode: row.mode, kind: row.kind, status: row.status,
        endpoint: row.endpoint, currentUrl: row.currentUrl, currentTitle: row.currentTitle,
        tabCount: row.tabCount, activeTab: row.activeTab, lastError: row.lastError,
        idleExpiresAt: row.idleExpiresAt, createdById: row.createdById,
      },
    });
    return toSessionRow(created);
  }

  async get(id: string, workspaceId: string): Promise<SessionRow | null> {
    const row = await this.db.browserSession.findFirst({ where: { id, workspaceId } });
    return row ? toSessionRow(row) : null;
  }

  async list(workspaceId: string, opts?: { status?: SessionRow["status"][]; limit?: number }): Promise<SessionRow[]> {
    const rows = await this.db.browserSession.findMany({
      where: { workspaceId, ...(opts?.status ? { status: { in: opts.status } } : {}) },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts?.limit ?? 50, 200),
    });
    return rows.map(toSessionRow);
  }

  async update(id: string, patch: Partial<SessionRow>): Promise<void> {
    await this.db.browserSession.update({ where: { id }, data: sessionPatch(patch) });
  }

  async heartbeat(id: string): Promise<void> {
    await this.db.browserSession.update({ where: { id }, data: { lastActivityAt: new Date() } });
  }

  async close(id: string, patch?: Partial<SessionRow>): Promise<void> {
    await this.db.browserSession.update({
      where: { id },
      data: { ...sessionPatch(patch ?? {}), status: patch?.status ?? "CLOSED", closedAt: new Date() },
    });
  }

  async countActive(workspaceId: string): Promise<number> {
    return this.db.browserSession.count({
      where: { workspaceId, status: { in: ["STARTING", "ACTIVE", "IDLE", "RECOVERING"] } },
    });
  }

  async findIdleExpired(now: Date, limit: number): Promise<SessionRow[]> {
    const rows = await this.db.browserSession.findMany({
      where: { status: { in: ["STARTING", "ACTIVE", "IDLE"] }, idleExpiresAt: { not: null, lte: now } },
      take: limit,
    });
    return rows.map(toSessionRow);
  }
}

function sessionPatch(patch: Partial<SessionRow>): Prisma.BrowserSessionUpdateInput {
  const data: Prisma.BrowserSessionUpdateInput = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.endpoint !== undefined) data.endpoint = patch.endpoint;
  if (patch.currentUrl !== undefined) data.currentUrl = patch.currentUrl;
  if (patch.currentTitle !== undefined) data.currentTitle = patch.currentTitle;
  if (patch.tabCount !== undefined) data.tabCount = patch.tabCount;
  if (patch.activeTab !== undefined) data.activeTab = patch.activeTab;
  if (patch.lastError !== undefined) data.lastError = patch.lastError;
  if (patch.idleExpiresAt !== undefined) data.idleExpiresAt = patch.idleExpiresAt;
  return data;
}

export class PrismaExecutionRepository implements ExecutionRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(row: Parameters<ExecutionRepository["create"]>[0]): Promise<ExecutionRow> {
    const created = await this.db.browserExecution.create({
      data: {
        ...(row.id ? { id: row.id } : {}),
        workspaceId: row.workspaceId, userId: row.userId ?? null, sessionId: row.sessionId,
        goal: row.goal ?? null, plan: row.plan as unknown as Prisma.InputJsonValue,
        stepCount: row.stepCount, status: "QUEUED",
      },
    });
    return toExecutionRow(created);
  }

  async get(id: string, workspaceId: string): Promise<ExecutionRow | null> {
    const row = await this.db.browserExecution.findFirst({ where: { id, workspaceId } });
    return row ? toExecutionRow(row) : null;
  }

  async getUnscoped(id: string): Promise<ExecutionRow | null> {
    const row = await this.db.browserExecution.findUnique({ where: { id } });
    return row ? toExecutionRow(row) : null;
  }

  async list(workspaceId: string, opts?: { status?: ExecutionRow["status"][]; sessionId?: string; limit?: number; before?: Date }): Promise<ExecutionRow[]> {
    const rows = await this.db.browserExecution.findMany({
      where: {
        workspaceId,
        ...(opts?.status ? { status: { in: opts.status } } : {}),
        ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}),
        ...(opts?.before ? { createdAt: { lt: opts.before } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts?.limit ?? 50, 200),
    });
    return rows.map(toExecutionRow);
  }

  async update(id: string, patch: Partial<ExecutionRow>): Promise<void> {
    const data: Prisma.BrowserExecutionUpdateInput = {};
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.error !== undefined) data.error = patch.error;
    if (patch.result !== undefined) data.result = patch.result === null ? Prisma.DbNull : (patch.result as unknown as Prisma.InputJsonValue);
    if (patch.approvalId !== undefined) data.approvalId = patch.approvalId;
    if (patch.failedStep !== undefined) data.failedStep = patch.failedStep;
    if (patch.attempts !== undefined) data.attempts = patch.attempts;
    if (patch.startedAt !== undefined) data.startedAt = patch.startedAt;
    if (patch.finishedAt !== undefined) data.finishedAt = patch.finishedAt;
    if (patch.plan !== undefined) data.plan = patch.plan as unknown as Prisma.InputJsonValue;
    await this.db.browserExecution.update({ where: { id }, data });
  }
}

export class PrismaActionEventRepository implements ActionEventRepository {
  constructor(private readonly db: PrismaClient) {}

  async append(row: Parameters<ActionEventRepository["append"]>[0]): Promise<ActionEventRow> {
    const created = await this.db.browserActionEvent.create({
      data: {
        executionId: row.executionId, workspaceId: row.workspaceId, seq: row.seq,
        action: row.action,
        selector: row.selector === null ? Prisma.DbNull : (row.selector as Prisma.InputJsonValue),
        args: row.args === null ? Prisma.DbNull : (row.args as Prisma.InputJsonValue),
        status: row.status, attempt: row.attempt, durationMs: row.durationMs,
        error: row.error, screenshotId: row.screenshotId,
        healedFrom: row.healedFrom === null ? Prisma.DbNull : (row.healedFrom as Prisma.InputJsonValue),
        metadata: row.metadata === null ? Prisma.DbNull : (row.metadata as Prisma.InputJsonValue),
      },
    });
    return toEventRow(created);
  }

  async update(id: string, patch: Partial<ActionEventRow>): Promise<void> {
    const data: Prisma.BrowserActionEventUpdateInput = {};
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.durationMs !== undefined) data.durationMs = patch.durationMs;
    if (patch.error !== undefined) data.error = patch.error;
    if (patch.screenshotId !== undefined) data.screenshotId = patch.screenshotId;
    if (patch.selector !== undefined) data.selector = patch.selector === null ? Prisma.DbNull : (patch.selector as Prisma.InputJsonValue);
    if (patch.healedFrom !== undefined) data.healedFrom = patch.healedFrom === null ? Prisma.DbNull : (patch.healedFrom as Prisma.InputJsonValue);
    if (patch.metadata !== undefined) data.metadata = patch.metadata === null ? Prisma.DbNull : (patch.metadata as Prisma.InputJsonValue);
    await this.db.browserActionEvent.update({ where: { id }, data });
  }

  async listForExecution(executionId: string, opts?: { afterSeq?: number; limit?: number }): Promise<ActionEventRow[]> {
    const rows = await this.db.browserActionEvent.findMany({
      where: { executionId, ...(opts?.afterSeq ? { seq: { gt: opts.afterSeq } } : {}) },
      orderBy: [{ seq: "asc" }, { attempt: "asc" }],
      take: Math.min(opts?.limit ?? 500, 2000),
    });
    return rows.map(toEventRow);
  }

  async list(workspaceId: string, opts?: { action?: string; status?: string; limit?: number }): Promise<ActionEventRow[]> {
    const rows = await this.db.browserActionEvent.findMany({
      where: {
        workspaceId,
        ...(opts?.action ? { action: opts.action } : {}),
        ...(opts?.status ? { status: opts.status as never } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts?.limit ?? 100, 500),
    });
    return rows.map(toEventRow);
  }
}

export class PrismaRecordingRepository implements RecordingRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsert(row: Parameters<RecordingRepository["upsert"]>[0]): Promise<RecordingRow> {
    const data = {
      workspaceId: row.workspaceId, steps: row.steps, screenshots: row.screenshots,
      errors: row.errors, retries: row.retries, durationMs: row.durationMs,
      timeline: row.timeline as unknown as Prisma.InputJsonValue,
    };
    const saved = await this.db.browserRecording.upsert({
      where: { executionId: row.executionId },
      create: { executionId: row.executionId, ...data },
      update: data,
    });
    return {
      id: saved.id, executionId: saved.executionId, workspaceId: saved.workspaceId,
      steps: saved.steps, screenshots: saved.screenshots, errors: saved.errors,
      retries: saved.retries, durationMs: saved.durationMs,
      timeline: saved.timeline as unknown as RecordingRow["timeline"], createdAt: saved.createdAt,
    };
  }

  async getByExecution(executionId: string, workspaceId: string): Promise<RecordingRow | null> {
    const row = await this.db.browserRecording.findFirst({ where: { executionId, workspaceId } });
    return row ? {
      id: row.id, executionId: row.executionId, workspaceId: row.workspaceId,
      steps: row.steps, screenshots: row.screenshots, errors: row.errors,
      retries: row.retries, durationMs: row.durationMs,
      timeline: row.timeline as unknown as RecordingRow["timeline"], createdAt: row.createdAt,
    } : null;
  }

  async list(workspaceId: string, opts?: { limit?: number }): Promise<RecordingRow[]> {
    const rows = await this.db.browserRecording.findMany({
      where: { workspaceId }, orderBy: { createdAt: "desc" }, take: Math.min(opts?.limit ?? 50, 200),
    });
    return rows.map((row) => ({
      id: row.id, executionId: row.executionId, workspaceId: row.workspaceId,
      steps: row.steps, screenshots: row.screenshots, errors: row.errors,
      retries: row.retries, durationMs: row.durationMs,
      timeline: row.timeline as unknown as RecordingRow["timeline"], createdAt: row.createdAt,
    }));
  }
}

export class PrismaBinaryRepository implements BinaryRepository {
  constructor(private readonly db: PrismaClient) {}

  async put(input: { workspaceId: string; data: Buffer; mime: string }): Promise<BinaryRow> {
    const sha256 = createHash("sha256").update(input.data).digest("hex");
    const existing = await this.db.browserBinary.findFirst({ where: { workspaceId: input.workspaceId, sha256 } });
    if (existing) {
      return { id: existing.id, workspaceId: input.workspaceId, sha256, mime: existing.mime, sizeBytes: existing.sizeBytes, createdAt: existing.createdAt };
    }
    const created = await this.db.browserBinary.create({
      data: { workspaceId: input.workspaceId, sha256, mime: input.mime, sizeBytes: input.data.length, data: new Uint8Array(input.data) },
    });
    return { id: created.id, workspaceId: input.workspaceId, sha256, mime: created.mime, sizeBytes: created.sizeBytes, createdAt: created.createdAt };
  }

  async get(id: string, workspaceId: string): Promise<(BinaryRow & { data: Buffer }) | null> {
    const row = await this.db.browserBinary.findFirst({ where: { id, workspaceId } });
    if (!row) return null;
    return {
      id: row.id, workspaceId: row.workspaceId, sha256: row.sha256, mime: row.mime,
      sizeBytes: row.sizeBytes, createdAt: row.createdAt, data: Buffer.from(row.data),
    };
  }
}

export class PrismaDownloadRepository implements DownloadRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(row: Parameters<DownloadRepository["create"]>[0]): Promise<DownloadRow> {
    const created = await this.db.browserDownload.create({ data: row });
    return toDownloadRow(created);
  }

  async list(workspaceId: string, opts?: { limit?: number }): Promise<DownloadRow[]> {
    const rows = await this.db.browserDownload.findMany({
      where: { workspaceId }, orderBy: { createdAt: "desc" }, take: Math.min(opts?.limit ?? 50, 200),
    });
    return rows.map(toDownloadRow);
  }

  async get(id: string, workspaceId: string): Promise<DownloadRow | null> {
    const row = await this.db.browserDownload.findFirst({ where: { id, workspaceId } });
    return row ? toDownloadRow(row) : null;
  }

  async updateScan(id: string, status: DownloadRow["scanStatus"], detail?: string): Promise<void> {
    await this.db.browserDownload.update({ where: { id }, data: { scanStatus: status, scanDetail: detail ?? null } });
  }

  async delete(id: string, workspaceId: string): Promise<boolean> {
    const res = await this.db.browserDownload.deleteMany({ where: { id, workspaceId } });
    return res.count > 0;
  }

  async findByHash(workspaceId: string, sha256: string): Promise<DownloadRow | null> {
    const row = await this.db.browserDownload.findFirst({ where: { workspaceId, sha256 } });
    return row ? toDownloadRow(row) : null;
  }
}

function toDownloadRow(r: Prisma.BrowserDownloadGetPayload<object>): DownloadRow {
  return {
    id: r.id, workspaceId: r.workspaceId, sessionId: r.sessionId, executionId: r.executionId,
    filename: r.filename, suggestedName: r.suggestedName, mime: r.mime, sizeBytes: r.sizeBytes,
    sha256: r.sha256, binaryId: r.binaryId,
    scanStatus: r.scanStatus as DownloadRow["scanStatus"], scanDetail: r.scanDetail, createdAt: r.createdAt,
  };
}

export class PrismaUploadRepository implements UploadRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(row: Parameters<UploadRepository["create"]>[0]): Promise<UploadRow> {
    const created = await this.db.browserUpload.create({ data: row });
    return toUploadRow(created);
  }

  async list(workspaceId: string, opts?: { limit?: number }): Promise<UploadRow[]> {
    const rows = await this.db.browserUpload.findMany({
      where: { workspaceId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: Math.min(opts?.limit ?? 50, 200),
    });
    return rows.map(toUploadRow);
  }

  async get(id: string, workspaceId: string): Promise<UploadRow | null> {
    const row = await this.db.browserUpload.findFirst({ where: { id, workspaceId } });
    return row ? toUploadRow(row) : null;
  }

  async incrementUsed(ids: string[]): Promise<void> {
    await this.db.browserUpload.updateMany({ where: { id: { in: ids } }, data: { usedCount: { increment: 1 } } });
  }

  async delete(id: string, workspaceId: string): Promise<boolean> {
    const res = await this.db.browserUpload.updateMany({
      where: { id, workspaceId, deletedAt: null }, data: { deletedAt: new Date() },
    });
    return res.count > 0;
  }

  async findByHash(workspaceId: string, sha256: string): Promise<UploadRow | null> {
    const row = await this.db.browserUpload.findFirst({ where: { workspaceId, sha256, deletedAt: null } });
    return row ? toUploadRow(row) : null;
  }
}

function toUploadRow(r: Prisma.BrowserUploadGetPayload<object>): UploadRow {
  return {
    id: r.id, workspaceId: r.workspaceId, uploaderId: r.uploaderId, filename: r.filename,
    mime: r.mime, sizeBytes: r.sizeBytes, sha256: r.sha256, binaryId: r.binaryId,
    usedCount: r.usedCount, createdAt: r.createdAt, deletedAt: r.deletedAt,
  };
}

export class PrismaScreenshotRepository implements ScreenshotRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(row: Parameters<ScreenshotRepository["create"]>[0]): Promise<ScreenshotRow> {
    const created = await this.db.browserScreenshot.create({ data: row });
    return toScreenshotRow(created);
  }

  async list(workspaceId: string, opts?: { executionId?: string; sessionId?: string; limit?: number }): Promise<ScreenshotRow[]> {
    const rows = await this.db.browserScreenshot.findMany({
      where: {
        workspaceId,
        ...(opts?.executionId ? { executionId: opts.executionId } : {}),
        ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts?.limit ?? 100, 400),
    });
    return rows.map(toScreenshotRow);
  }

  async get(id: string, workspaceId: string): Promise<ScreenshotRow | null> {
    const row = await this.db.browserScreenshot.findFirst({ where: { id, workspaceId } });
    return row ? toScreenshotRow(row) : null;
  }

  async delete(id: string, workspaceId: string): Promise<boolean> {
    const res = await this.db.browserScreenshot.deleteMany({ where: { id, workspaceId } });
    return res.count > 0;
  }
}

function toScreenshotRow(r: Prisma.BrowserScreenshotGetPayload<object>): ScreenshotRow {
  return {
    id: r.id, workspaceId: r.workspaceId, sessionId: r.sessionId, executionId: r.executionId,
    kind: r.kind as ScreenshotRow["kind"], binaryId: r.binaryId,
    width: r.width, height: r.height, createdAt: r.createdAt,
  };
}

export class PrismaProfileRepository implements ProfileRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly box: SecretBox
  ) {}

  async create(row: Parameters<ProfileRepository["create"]>[0]): Promise<ProfileRow> {
    const created = await this.db.browserProfile.create({
      data: {
        ...(row.id ? { id: row.id } : {}),
        workspaceId: row.workspaceId, name: row.name, description: row.description,
        browser: row.browser, userAgent: row.userAgent,
        viewport: row.viewport === null ? Prisma.DbNull : (row.viewport as Prisma.InputJsonValue),
        createdById: row.createdById,
      },
    });
    return toProfileRow(created);
  }

  async list(workspaceId: string): Promise<ProfileRow[]> {
    const rows = await this.db.browserProfile.findMany({
      where: { workspaceId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 100,
    });
    return rows.map(toProfileRow);
  }

  async get(id: string, workspaceId: string): Promise<ProfileRow | null> {
    const row = await this.db.browserProfile.findFirst({ where: { id, workspaceId, deletedAt: null } });
    return row ? toProfileRow(row) : null;
  }

  async update(id: string, patch: Partial<ProfileRow>): Promise<void> {
    const data: Prisma.BrowserProfileUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.browser !== undefined) data.browser = patch.browser;
    if (patch.userAgent !== undefined) data.userAgent = patch.userAgent;
    if (patch.viewport !== undefined) data.viewport = patch.viewport === null ? Prisma.DbNull : (patch.viewport as Prisma.InputJsonValue);
    await this.db.browserProfile.update({ where: { id }, data });
  }

  async softDelete(id: string, workspaceId: string): Promise<boolean> {
    const res = await this.db.browserProfile.updateMany({
      where: { id, workspaceId, deletedAt: null }, data: { deletedAt: new Date() },
    });
    return res.count > 0;
  }

  async readStorageState(id: string): Promise<StorageState | null> {
    const row = await this.db.browserProfile.findUnique({ where: { id } });
    if (!row?.storageStateEnc) return null;
    const plaintext = this.box.open(row.storageStateEnc);
    const parsed = JSON.parse(plaintext) as StorageState;
    return {
      cookies: parsed.cookies ?? [],
      origins: parsed.origins ?? [],
    };
  }

  async writeStorageState(id: string, state: StorageState): Promise<void> {
    const enc = this.box.seal(JSON.stringify({ cookies: state.cookies ?? [], origins: state.origins ?? [] }));
    await this.db.browserProfile.update({ where: { id }, data: { storageStateEnc: enc } });
  }

  async clearStorageState(id: string): Promise<void> {
    await this.db.browserProfile.update({ where: { id }, data: { storageStateEnc: null } });
  }
}

function toProfileRow(r: Prisma.BrowserProfileGetPayload<object>): ProfileRow {
  return {
    id: r.id, workspaceId: r.workspaceId, name: r.name, description: r.description,
    browser: r.browser, userAgent: r.userAgent,
    viewport: (r.viewport as ProfileRow["viewport"]) ?? null,
    createdById: r.createdById, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

/** Convenience aggregate for the DI container. */
export interface PrismaRepositories {
  settings: PrismaSettingsRepository;
  policies: PrismaPolicyRepository;
  sessions: PrismaSessionRepository;
  executions: PrismaExecutionRepository;
  events: PrismaActionEventRepository;
  recordings: PrismaRecordingRepository;
  binaries: PrismaBinaryRepository;
  downloads: PrismaDownloadRepository;
  uploads: PrismaUploadRepository;
  screenshots: PrismaScreenshotRepository;
  profiles: PrismaProfileRepository;
}

export function buildPrismaRepositories(db: PrismaClient, box: SecretBox): PrismaRepositories {
  return {
    settings: new PrismaSettingsRepository(db),
    policies: new PrismaPolicyRepository(db),
    sessions: new PrismaSessionRepository(db),
    executions: new PrismaExecutionRepository(db),
    events: new PrismaActionEventRepository(db),
    recordings: new PrismaRecordingRepository(db),
    binaries: new PrismaBinaryRepository(db),
    downloads: new PrismaDownloadRepository(db),
    uploads: new PrismaUploadRepository(db),
    screenshots: new PrismaScreenshotRepository(db),
    profiles: new PrismaProfileRepository(db, box),
  };
}
