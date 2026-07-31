import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ActionPlanner, AuditService, BrowserPool, buildPrismaRepositories,
  CookiesService, DownloadService, ExecutionManager, HeuristicScanner,
  InProcessExecutionEmitter, InProcessExecutionQueue, PermissionService,
  PlaywrightDriver, ProfileService, RecoveryService, RecordingService,
  ScreenshotService, SessionManager, UploadService, VisionService, sanitizeFilename,
  type ApprovalPort, type AuditSinkPort, type BrowserGateway,
  type ExecutionRow, type PrismaRepositories, type SessionRow,
  type UploadMaterializer,
} from "@cue/index";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/**
 * Browser runtime — the DI container for MCUE inside the Next app.
 *
 * One process-global instance (HMR-safe). Every engine service is
 * constructor-wired through ports here; NOTHING else in app/ builds engine
 * objects. Queue concurrency is 2 (a warm instance comfortably drives two
 * concurrent sessions); swap in a BullMQ adapter at this one site to scale.
 */

export interface BrowserRuntime {
  repos: PrismaRepositories;
  pool: BrowserPool;
  sessions: SessionManager;
  executions: ExecutionManager;
  queue: InProcessExecutionQueue;
  emitter: InProcessExecutionEmitter;
  permissions: PermissionService;
  planner: ActionPlanner;
  recovery: RecoveryService;
  screenshots: ScreenshotService;
  recordings: RecordingService;
  downloads: DownloadService;
  uploads: UploadService;
  profiles: ProfileService;
  cookies: CookiesService;
  vision: VisionService;
  audit: AuditService;
  gateway: BrowserGateway;
}

const globalForBrowser = globalThis as unknown as { __mcueRuntime?: BrowserRuntime };

/** AES-256-GCM vault adapter (same construction as provider BYOK keys). */
const secretBox = {
  seal: (plaintext: string) => encryptSecret(plaintext),
  open: (box: string) => decryptSecret(box),
};

const auditSink: AuditSinkPort = {
  async record(entry) {
    await audit({
      workspaceId: entry.workspaceId,
      actorId: entry.actorId ?? undefined,
      action: entry.action as never,
      targetType: entry.targetType,
      targetId: entry.targetId ?? undefined,
      metadata: entry.metadata,
    });
  },
};

const approvalBridge: ApprovalPort = {
  async request(input) {
    // Plan-derived approval row (workspace-linked, same idiom as Phase 3).
    const approval = await db.approval.create({
      data: {
        workspaceId: input.workspaceId,
        actionType: input.actionType,
        requestedTo: "workspace.manager",
        detail: { ...input.detail, executionId: input.executionId, reason: input.reason } as object,
        status: "PENDING",
      },
    });
    return { approvalId: approval.id };
  },
};

/** Upload payloads land in a per-process temp dir the driver can read. */
class TempUploadMaterializer implements UploadMaterializer {
  private readonly root = join(tmpdir(), "mcue-uploads");

  write(row: { id: string; filename: string }, data: Buffer): Promise<string> {
    const dir = join(this.root, row.id);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, sanitizeFilename(row.filename));
    writeFileSync(path, data);
    return Promise.resolve(path);
  }
}

export function getBrowserRuntime(): BrowserRuntime {
  if (globalForBrowser.__mcueRuntime) return globalForBrowser.__mcueRuntime;

  const repos = buildPrismaRepositories(db, secretBox);
  const pool = new BrowserPool(new PlaywrightDriver(), {
    maxProcesses: Number(process.env.MCUE_POOL_MAX_PROCESSES ?? 4),
    maxContextsPerProcess: 6,
    idleTimeoutMs: Number(process.env.MCUE_POOL_IDLE_MS ?? 120_000),
  });

  const auditSvc = new AuditService(auditSink);
  const permissionsSvc = new PermissionService(repos.policies);
  const planner = new ActionPlanner(permissionsSvc);
  const recovery = new RecoveryService();
  const screenshots = new ScreenshotService(repos.binaries, repos.screenshots);
  const recordings = new RecordingService(repos.recordings);
  // Default content scanner (ClamAV/cloud AV slots into the same port).
  const downloads = new DownloadService(repos.binaries, repos.downloads, new HeuristicScanner());
  const uploads = new UploadService(repos.binaries, repos.uploads, new TempUploadMaterializer());
  const profiles = new ProfileService(repos.profiles);
  const cookies = new CookiesService();
  const vision = new VisionService(); // OCR/multimodal seams stay unwired (documented)

  const sessions = new SessionManager({
    pool,
    sessions: repos.sessions,
    profiles: repos.profiles,
    settings: repos.settings,
    audit: auditSvc,
  });

  const emitter = new InProcessExecutionEmitter();
  const executions = new ExecutionManager({
    sessions,
    executions: repos.executions,
    events: repos.events,
    planner,
    recovery,
    permissions: permissionsSvc,
    screenshots,
    recording: recordings,
    downloads,
    uploads,
    emitter,
    approvals: approvalBridge,
    audit: auditSvc,
  });
  const queue = new InProcessExecutionQueue((id) => executions.run(id), 2);
  executions.attachQueue(queue);

  const gateway: BrowserGateway = {
    createSession(input) {
      return sessions.create(input);
    },
    async closeSession(sessionId, workspaceId) {
      await sessions.close(sessionId, workspaceId);
    },
    getSession(sessionId, workspaceId) {
      return sessions.get(sessionId, workspaceId);
    },
    async runExecution(input): Promise<ExecutionRow> {
      const steps = input.steps.map((s) => ({ action: s.action, args: s.args }));
      if (input.inline) {
        return executions.runInline({ workspaceId: input.workspaceId, userId: input.userId, sessionId: input.sessionId, goal: input.goal, steps });
      }
      return executions.start({ workspaceId: input.workspaceId, userId: input.userId, sessionId: input.sessionId, goal: input.goal, steps });
    },
    async tabList(sessionId, workspaceId) {
      const handle = sessions.liveHandle(sessionId);
      if (!handle) return null;
      const row = await sessions.get(sessionId, workspaceId);
      if (!row) return null;
      return handle.tabs();
    },
  };

  const runtime: BrowserRuntime = {
    repos, pool, sessions, executions, queue, emitter,
    permissions: permissionsSvc, planner, recovery,
    screenshots, recordings, downloads, uploads, profiles, cookies, vision,
    audit: auditSvc, gateway,
  };
  globalForBrowser.__mcueRuntime = runtime;
  return runtime;
}

/** Narrow alias for route signatures. */
export type { SessionRow };
