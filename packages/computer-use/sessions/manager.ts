import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext } from "playwright-core";
import { LivePageSet, type SessionPageHandle } from "../browser-engine/handle";
import type { BrowserPool, LeasedBrowser } from "../browser-engine/pool";
import { CueError } from "../errors";
import type {
  ProfileRepository, SessionRepository, SessionRow, SettingsRepository,
} from "../ports";
import { limitsOfSettings } from "../ports";
import type { AuditService } from "../audit/service";
import { CUE_AUDIT_ACTIONS } from "../audit/service";
import type { BrowserId, BrowserMode, BrowserTarget, EngineLimits, SessionKind } from "../types";

interface LiveSessionRecord {
  lease: LeasedBrowser;
  context: BrowserContext;
  handle: SessionPageHandle;
  downloadsDir: string;
  workspaceId: string;
}

export interface CreateSessionInput {
  workspaceId: string;
  userId?: string | null;
  profileId?: string | null;
  kind?: SessionKind;
  browser?: BrowserId;
  mode?: BrowserMode;
  /** Force a headed launch (mode=HEADED) — settings default otherwise. */
  startUrl?: string;
}

export interface AttachedSession {
  row: SessionRow;
  handle: SessionPageHandle;
  context: BrowserContext;
  limits: EngineLimits;
}

/**
 * SessionManager — the lifecycle authority for browser sessions.
 *
 *  • create: validates the concurrency cap, resolves the profile's encrypted
 *    storage state (PERSISTENT), leases a pooled process, builds an isolated
 *    context + page set, persists the row, audits.
 *  • attach: returns a live in-process session; when the process was lost
 *    (serverless hop / crash) a PERSISTENT session resumes from its profile
 *    snapshot, keeping session recovery a first-class concept.
 *  • close/sweep: deterministic teardown + profile write-back + idle reaper.
 */
export class SessionManager {
  private readonly live = new Map<string, LiveSessionRecord>();

  constructor(
    private readonly deps: {
      pool: BrowserPool;
      sessions: SessionRepository;
      profiles: ProfileRepository;
      settings: SettingsRepository;
      audit?: AuditService | null;
      downloadsRoot?: string;
    }
  ) {}

  private downloadsDirFor(sessionId: string): string {
    const root = this.deps.downloadsRoot ?? join(tmpdir(), "mcue-downloads");
    mkdirSync(root, { recursive: true });
    return mkdtempSync(join(root, `-${sessionId.slice(0, 8)}`));
  }

  async limitsFor(workspaceId: string): Promise<EngineLimits> {
    return limitsOfSettings(await this.deps.settings.getSettings(workspaceId));
  }

  async create(input: CreateSessionInput): Promise<SessionRow> {
    const settings = await this.deps.settings.getSettings(input.workspaceId);
    const limits = limitsOfSettings(settings);

    const activeCount = await this.deps.sessions.countActive(input.workspaceId);
    if (activeCount >= settings.maxConcurrentSessions) {
      throw new CueError("quota", `Concurrent session cap reached (${settings.maxConcurrentSessions}). Close an idle session first.`);
    }

    const kind = input.kind ?? (input.profileId ? "PERSISTENT" : "EPHEMERAL");
    if (kind === "PERSISTENT" && !input.profileId) {
      throw new CueError("validation", "PERSISTENT sessions require a profileId (session state must have a home).");
    }

    // Resolve profile + its encrypted storage state.
    let storageState = null;
    let profile = null;
    if (input.profileId) {
      profile = await this.deps.profiles.get(input.profileId, input.workspaceId);
      if (!profile) throw new CueError("validation", "Profile not found in this workspace.");
      storageState = kind === "INCOGNITO" ? null : await this.deps.profiles.readStorageState(profile.id);
    }

    const browser = input.browser ?? profile?.browser ?? settings.defaultBrowser;
    const mode: BrowserMode = input.mode ?? (settings.headless ? "HEADLESS" : "HEADED");
    const target: BrowserTarget = {
      browser,
      headless: mode === "HEADLESS",
      channel: browser === "CHROME" ? "chrome" : browser === "MSEDGE" ? "msedge" : undefined,
    };

    const row = await this.deps.sessions.create({
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      profileId: profile?.id ?? null,
      browser,
      mode,
      kind,
      status: "STARTING",
      endpoint: null,
      currentUrl: null,
      currentTitle: null,
      tabCount: 1,
      activeTab: 0,
      lastError: null,
      idleExpiresAt: new Date(Date.now() + limits.sessionIdleTimeoutSec * 1000),
      createdById: input.userId ?? null,
      closedAt: null,
    });

    try {
      const lease = await this.deps.pool.acquire(target);
      const downloadsDir = this.downloadsDirFor(row.id);
      const context = await lease.createContext({
        storageState: storageState ?? undefined,
        userAgent: profile?.userAgent ?? null,
        viewport: profile?.viewport ?? null,
        acceptDownloadsDir: downloadsDir,
        dialogPolicy: limits.dialogPolicy,
      });
      // Ensure at least one tab exists.
      if (context.pages().length === 0) await context.newPage();
      const handle = new LivePageSet(context, limits.dialogPolicy);
      if (input.startUrl) {
        await handle.page().goto(input.startUrl, { waitUntil: "domcontentloaded", timeout: limits.actionTimeoutMs }).catch(() => {});
      }
      this.live.set(row.id, { lease, context, handle, downloadsDir, workspaceId: input.workspaceId });
      context.on("close", () => {
        // Unexpected close (crash): mark ERROR unless we closed it ourselves.
        this.live.delete(row.id);
        void this.deps.sessions.get(row.id, input.workspaceId).then((fresh) => {
          if (fresh && fresh.status !== "CLOSED") {
            void this.deps.sessions.update(row.id, { status: "ERROR", lastError: "Browser context closed unexpectedly." });
          }
        }).catch(() => {});
      });

      await this.deps.sessions.update(row.id, {
        status: "ACTIVE",
        endpoint: lease.endpoint,
        currentUrl: handle.url(),
        currentTitle: await handle.title(),
        tabCount: handle.tabCount(),
      });
      await this.deps.audit?.record({
        workspaceId: input.workspaceId, actorId: input.userId ?? null,
        action: CUE_AUDIT_ACTIONS.sessionCreate, targetType: "session", targetId: row.id,
        metadata: { browser, mode, kind, profileId: profile?.id ?? null, endpoint: lease.endpoint },
      });
      return { ...row, status: "ACTIVE", endpoint: lease.endpoint };
    } catch (err) {
      await this.deps.sessions.update(row.id, {
        status: "ERROR",
        lastError: err instanceof Error ? err.message.slice(0, 300) : String(err),
      }).catch(() => {});
      throw err;
    }
  }

  /** Attach to a live session for action execution (resume when needed). */
  async attach(sessionId: string, workspaceId: string): Promise<AttachedSession> {
    const row = await this.deps.sessions.get(sessionId, workspaceId);
    if (!row) throw new CueError("session_not_found", `Session ${sessionId} not found in this workspace.`);
    if (row.status === "CLOSED" || row.status === "TIMEOUT") {
      throw new CueError("session_closed", `Session ${sessionId} is ${row.status.toLowerCase()} — create a new session.`);
    }
    const limits = await this.limitsFor(workspaceId);

    const existing = this.live.get(sessionId);
    if (existing && existing.handle.isLive()) {
      await this.touch(sessionId, existing);
      return { row: { ...row, status: "ACTIVE" }, handle: existing.handle, context: existing.context, limits };
    }

    // Recovery path: only PERSISTENT sessions can cross-process resume.
    if (row.kind !== "PERSISTENT" || !row.profileId) {
      throw new CueError("session_closed", "This session's browser process is no longer live (serverless hop or crash). Only PERSISTENT profile-bound sessions can resume across processes — create a new session instead.");
    }

    await this.deps.sessions.update(sessionId, { status: "RECOVERING" });
    const storageState = await this.deps.profiles.readStorageState(row.profileId);
    const target: BrowserTarget = {
      browser: row.browser,
      headless: row.mode === "HEADLESS",
      channel: row.browser === "CHROME" ? "chrome" : row.browser === "MSEDGE" ? "msedge" : undefined,
    };
    try {
      const lease = await this.deps.pool.acquire(target);
      const downloadsDir = this.downloadsDirFor(sessionId);
      const context = await lease.createContext({
        storageState: storageState ?? undefined,
        acceptDownloadsDir: downloadsDir,
        dialogPolicy: limits.dialogPolicy,
      });
      if (context.pages().length === 0) await context.newPage();
      const handle = new LivePageSet(context, limits.dialogPolicy);
      if (row.currentUrl) {
        await handle.page().goto(row.currentUrl, { waitUntil: "domcontentloaded", timeout: limits.actionTimeoutMs }).catch(() => {});
      }
      this.live.set(sessionId, { lease, context, handle, downloadsDir, workspaceId });
      context.on("close", () => this.live.delete(sessionId));
      await this.deps.sessions.update(sessionId, { status: "ACTIVE", lastError: null, endpoint: lease.endpoint });
      await this.deps.audit?.record({
        workspaceId, actorId: row.userId, action: CUE_AUDIT_ACTIONS.sessionRecover,
        targetType: "session", targetId: sessionId, metadata: { reason: "resume from profile snapshot" },
      });
      return { row: { ...row, status: "ACTIVE" }, handle, context, limits };
    } catch (err) {
      await this.deps.sessions.update(sessionId, { status: "ERROR", lastError: (err as Error).message.slice(0, 300) }).catch(() => {});
      throw err;
    }
  }

  /** Activity heartbeat + row sync after a run. */
  async touch(sessionId: string, record?: LiveSessionRecord): Promise<void> {
    const live = record ?? this.live.get(sessionId);
    await this.deps.sessions.heartbeat(sessionId);
    if (live) {
      await this.deps.sessions.update(sessionId, {
        status: "ACTIVE",
        currentUrl: live.handle.url(),
        currentTitle: await live.handle.title(),
        tabCount: live.handle.tabCount(),
        activeTab: live.handle.activeIndex(),
        idleExpiresAt: null,
      }).catch(() => {});
    }
  }

  /** Graceful close + persistent-state write-back. */
  async close(sessionId: string, workspaceId: string, opts: { reason?: string; status?: "CLOSED" | "TIMEOUT" } = {}): Promise<void> {
    const row = await this.deps.sessions.get(sessionId, workspaceId);
    const live = this.live.get(sessionId);

    // Write the context state back into the owning profile (PERSISTENT only).
    if (live && row?.kind === "PERSISTENT" && row.profileId) {
      try {
        const state = (await live.context.storageState()) as never;
        await this.deps.profiles.writeStorageState(row.profileId, state);
      } catch { /* best effort — closing must not fail on write-back */ }
    }

    this.live.delete(sessionId);
    if (live) {
      live.lease.releaseContext();
      await live.context.close().catch(() => {});
      rmSync(live.downloadsDir, { recursive: true, force: true });
    }
    await this.deps.sessions.close(sessionId, {
      status: opts.status ?? "CLOSED",
      lastError: opts.reason ?? null,
    });
    await this.deps.audit?.record({
      workspaceId, actorId: row?.userId ?? null,
      action: CUE_AUDIT_ACTIONS.sessionClose, targetType: "session", targetId: sessionId,
      metadata: { reason: opts.reason ?? "user-requested", status: opts.status ?? "CLOSED" },
    });
  }

  /** Reap sessions whose idle TTL expired — called by the sweeper route. */
  async sweepIdle(): Promise<number> {
    const expired = await this.deps.sessions.findIdleExpired(new Date(), 50);
    for (const row of expired) {
      await this.close(row.id, row.workspaceId, { reason: "Idle timeout reached.", status: "TIMEOUT" }).catch(() => {});
    }
    return expired.length;
  }

  /** Page-set for an active in-process session (execution layer fast path). */
  liveHandle(sessionId: string): SessionPageHandle | null {
    return this.live.get(sessionId)?.handle ?? null;
  }

  isLive(sessionId: string): boolean {
    return this.live.get(sessionId)?.handle.isLive() ?? false;
  }

  list(workspaceId: string, opts?: Parameters<SessionRepository["list"]>[1]) {
    return this.deps.sessions.list(workspaceId, opts);
  }

  get(sessionId: string, workspaceId: string) {
    return this.deps.sessions.get(sessionId, workspaceId);
  }
}
