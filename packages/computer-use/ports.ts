/**
 * MCUE ports — every boundary (persistence, binaries, scanning, queues,
 * event fan-out, approvals, model vision) is an interface. Services take
 * these via constructor injection; Prisma implementations live in
 * repositories/prisma.ts, infrastructural ones in their own modules.
 */

import type {
  ActionEventStatus, BrowserId, BrowserMode, CookieRecord,
  EngineLimits, ExecutionStatus, SessionKind, SessionStatus, StorageState,
} from "./types";

export function limitsOfSettings(s: BrowserSettingsRow): EngineLimits {
  return {
    actionTimeoutMs: s.actionTimeoutMs,
    executionTimeoutMs: s.executionTimeoutMs,
    sessionIdleTimeoutSec: s.sessionIdleTimeoutSec,
    maxConcurrentSessions: s.maxConcurrentSessions,
    artifactMaxBytes: s.maxArtifactMB * 1024 * 1024,
    dialogPolicy: s.dialogPolicy,
    screenshotOnFail: s.screenshotOnFail,
    recordScreenshots: s.recordScreenshots,
  };
}

// ── Persistence rows (plain DTOs — no Prisma types leak into the engine) ──

export interface SessionRow {
  id: string; workspaceId: string; userId: string | null; profileId: string | null;
  browser: BrowserId; mode: BrowserMode; kind: SessionKind; status: SessionStatus;
  endpoint: string | null; currentUrl: string | null; currentTitle: string | null;
  tabCount: number; activeTab: number; lastError: string | null;
  idleExpiresAt: Date | null; lastActivityAt: Date; createdById: string | null;
  createdAt: Date; closedAt: Date | null;
}

export interface PlanStep {
  seq: number;
  action: string;
  args: Record<string, unknown>;
  /** Optional human note from the goal decomposition. */
  note?: string;
}

export interface ExecutionRow {
  id: string; workspaceId: string; userId: string | null; sessionId: string;
  goal: string | null; status: ExecutionStatus; plan: PlanStep[] | null;
  result: Record<string, unknown> | null; error: string | null;
  approvalId: string | null; stepCount: number; failedStep: number | null;
  attempts: number; startedAt: Date | null; finishedAt: Date | null; createdAt: Date;
}

export interface ActionEventRow {
  id: string; executionId: string; workspaceId: string; seq: number; action: string;
  selector: unknown; args: unknown; status: ActionEventStatus; attempt: number;
  durationMs: number | null; error: string | null; screenshotId: string | null;
  healedFrom: unknown; metadata: unknown; createdAt: Date;
}

export interface RecordingRow {
  id: string; executionId: string; workspaceId: string; steps: number;
  screenshots: number; errors: number; retries: number; durationMs: number;
  timeline: TimelineFrame[]; createdAt: Date;
}

export interface TimelineFrame {
  seq: number; action: string; status: ActionEventStatus; attempt: number;
  at: string; durationMs: number | null; screenshotId: string | null; url?: string;
  error?: string;
}

export interface BinaryRow { id: string; workspaceId: string; sha256: string; mime: string; sizeBytes: number; createdAt: Date }

export interface DownloadRow {
  id: string; workspaceId: string; sessionId: string | null; executionId: string | null;
  filename: string; suggestedName: string; mime: string; sizeBytes: number; sha256: string;
  binaryId: string; scanStatus: "PENDING" | "CLEAN" | "HELD"; scanDetail: string | null; createdAt: Date;
}

export interface UploadRow {
  id: string; workspaceId: string; uploaderId: string | null; filename: string;
  mime: string; sizeBytes: number; sha256: string; binaryId: string;
  usedCount: number; createdAt: Date; deletedAt: Date | null;
}

export interface ScreenshotRow {
  id: string; workspaceId: string; sessionId: string | null; executionId: string | null;
  kind: "AUTO" | "MANUAL" | "FAILURE" | "STEP"; binaryId: string;
  width: number | null; height: number | null; createdAt: Date;
}

export interface PolicyRow {
  workspaceId: string; readOnly: boolean; navigationOnly: boolean;
  allowJavascript: boolean; allowDownloads: boolean; allowUploads: boolean; allowClipboard: boolean;
  allowedDomains: string[]; blockedDomains: string[]; confirmationDomains: string[]; defaultAllowed: boolean;
}

export interface ProfileRow {
  id: string; workspaceId: string; name: string; description: string | null;
  browser: BrowserId; userAgent: string | null;
  viewport: { width: number; height: number } | null;
  createdById: string | null; createdAt: Date; updatedAt: Date;
}

// ── Repositories ──────────────────────────────────────────────────────────

export interface SessionRepository {
  create(row: Omit<SessionRow, "id" | "createdAt" | "lastActivityAt"> & { id?: string }): Promise<SessionRow>;
  get(id: string, workspaceId: string): Promise<SessionRow | null>;
  list(workspaceId: string, opts?: { status?: SessionStatus[]; limit?: number }): Promise<SessionRow[]>;
  update(id: string, patch: Partial<SessionRow>): Promise<void>;
  heartbeat(id: string): Promise<void>;
  close(id: string, patch?: Partial<SessionRow>): Promise<void>;
  countActive(workspaceId: string): Promise<number>;
  findIdleExpired(now: Date, limit: number): Promise<SessionRow[]>;
}

export interface ExecutionRepository {
  create(row: { id?: string; workspaceId: string; userId?: string | null; sessionId: string; goal?: string | null; plan: PlanStep[]; stepCount: number }): Promise<ExecutionRow>;
  get(id: string, workspaceId: string): Promise<ExecutionRow | null>;
  /** Trusted runner path (queue workers) — callers stay workspace-scoped via get(). */
  getUnscoped(id: string): Promise<ExecutionRow | null>;
  list(workspaceId: string, opts?: { status?: ExecutionStatus[]; sessionId?: string; limit?: number; before?: Date }): Promise<ExecutionRow[]>;
  update(id: string, patch: Partial<ExecutionRow>): Promise<void>;
}

export interface ActionEventRepository {
  append(row: Omit<ActionEventRow, "id" | "createdAt">): Promise<ActionEventRow>;
  update(id: string, patch: Partial<ActionEventRow>): Promise<void>;
  listForExecution(executionId: string, opts?: { afterSeq?: number; limit?: number }): Promise<ActionEventRow[]>;
  list(workspaceId: string, opts?: { action?: string; status?: ActionEventStatus; limit?: number }): Promise<ActionEventRow[]>;
}

export interface RecordingRepository {
  upsert(row: Omit<RecordingRow, "id" | "createdAt">): Promise<RecordingRow>;
  getByExecution(executionId: string, workspaceId: string): Promise<RecordingRow | null>;
  list(workspaceId: string, opts?: { limit?: number }): Promise<RecordingRow[]>;
}

export interface BinaryRepository {
  /** Content-addressed put: reuses an existing row for identical workspace+sha256. */
  put(input: { workspaceId: string; data: Buffer; mime: string }): Promise<BinaryRow>;
  get(id: string, workspaceId: string): Promise<(BinaryRow & { data: Buffer }) | null>;
}

export interface DownloadRepository {
  create(row: Omit<DownloadRow, "id" | "createdAt">): Promise<DownloadRow>;
  list(workspaceId: string, opts?: { limit?: number }): Promise<DownloadRow[]>;
  get(id: string, workspaceId: string): Promise<DownloadRow | null>;
  updateScan(id: string, status: DownloadRow["scanStatus"], detail?: string): Promise<void>;
  delete(id: string, workspaceId: string): Promise<boolean>;
  findByHash(workspaceId: string, sha256: string): Promise<DownloadRow | null>;
}

export interface UploadRepository {
  create(row: Omit<UploadRow, "id" | "createdAt" | "usedCount" | "deletedAt">): Promise<UploadRow>;
  list(workspaceId: string, opts?: { limit?: number }): Promise<UploadRow[]>;
  get(id: string, workspaceId: string): Promise<UploadRow | null>;
  incrementUsed(ids: string[]): Promise<void>;
  delete(id: string, workspaceId: string): Promise<boolean>;
  findByHash(workspaceId: string, sha256: string): Promise<UploadRow | null>;
}

export interface ScreenshotRepository {
  create(row: Omit<ScreenshotRow, "id" | "createdAt">): Promise<ScreenshotRow>;
  list(workspaceId: string, opts?: { executionId?: string; sessionId?: string; limit?: number }): Promise<ScreenshotRow[]>;
  get(id: string, workspaceId: string): Promise<ScreenshotRow | null>;
  delete(id: string, workspaceId: string): Promise<boolean>;
}

export interface PolicyRepository {
  getPolicy(workspaceId: string): Promise<PolicyRow>;
  savePolicy(row: PolicyRow, updatedById: string): Promise<void>;
}

export interface ProfileRepository {
  create(row: Omit<ProfileRow, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<ProfileRow>;
  list(workspaceId: string): Promise<ProfileRow[]>;
  get(id: string, workspaceId: string): Promise<ProfileRow | null>;
  update(id: string, patch: Partial<ProfileRow>): Promise<void>;
  softDelete(id: string, workspaceId: string): Promise<boolean>;
  readStorageState(id: string): Promise<StorageState | null>;
  writeStorageState(id: string, state: StorageState): Promise<void>;
  clearStorageState(id: string): Promise<void>;
}

// ── Workspace engine settings (Browser Settings page) ────────────────────

export interface BrowserSettingsRow {
  workspaceId: string;
  defaultBrowser: BrowserId;
  headless: boolean;
  actionTimeoutMs: number;
  executionTimeoutMs: number;
  sessionIdleTimeoutSec: number;
  maxConcurrentSessions: number;
  dialogPolicy: "dismiss" | "accept";
  screenshotOnFail: boolean;
  recordScreenshots: boolean;
  maxArtifactMB: number;
}

export interface SettingsRepository {
  getSettings(workspaceId: string): Promise<BrowserSettingsRow>;
  saveSettings(row: BrowserSettingsRow, updatedById: string): Promise<void>;
}

// ── Infrastructure ports ──────────────────────────────────────────────────

/** Abstraction over antivirus/content scanning for downloads. */
export interface VirusScannerPort {
  readonly name: string;
  scan(input: { filename: string; mime: string; data: Buffer }): Promise<{
    status: "CLEAN" | "HELD";
    detail?: string;
  }>;
}

/** Execution fan-out — DB rows are the canonical truth; this emits live hints
 *  for same-process listeners (SSE fast path) and the future pub/sub seam. */
export interface ExecutionEventEmitter {
  emit(executionId: string, event: { type: string; seq?: number; data?: unknown }): void;
  subscribe(executionId: string, listener: (event: { type: string; seq?: number; data?: unknown }) => void): () => void;
}

/** Queue seam — in-process runner now, BullMQ/SQS-shaped later. */
export interface ExecutionQueuePort {
  enqueue(executionId: string): Promise<void>;
}

/** Human approval bridge — production wires to the Approval table. */
export interface ApprovalPort {
  request(input: {
    workspaceId: string; executionId: string; reason: string;
    detail: Record<string, unknown>; actionType: string;
  }): Promise<{ approvalId: string }>;
}

/** Future multimodal vision model seam (Gemini Vision etc.). Unimplemented
 *  by default — DOM/accessibility vision is the always-on baseline. */
export interface VisionModelPort {
  describe(input: { image: Buffer; prompt: string }): Promise<string>;
  readonly model: string;
}

/** Workspace audit trail sink — production wires to the app audit log. */
export interface AuditSinkPort {
  record(entry: {
    workspaceId: string;
    actorId: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}
