import type { Browser, BrowserContext } from "playwright-core";
import { CueError } from "../errors";
import type { BrowserTarget } from "../types";
import type { BrowserDriver, ContextOptions, ProcessLease } from "./driver";

/**
 * Browser pool — process reuse across sessions/executions.
 *
 *  • lazy init: nothing starts until the first acquire
 *  • connection reuse: acquires with the same pool key share one process;
 *    contexts are per-session isolation units (cookies/storage/auth state)
 *  • refcounted leases; idle processes are reaped after idleTimeoutMs
 *  • hard caps (per-key process count is 1 — contexts fan out)
 *  • destroyAll() for tests/shutdown; leases are also GC-safe
 *
 *  Serverless caveat: a warm pool only exists within a warm Lambda instance;
 *  the DB session table remains the cross-invocation truth, and remote
 *  workers make pooling process-independent.
 */

export interface PoolOptions {
  maxProcesses?: number; // default 4
  maxContextsPerProcess?: number; // default 6
  idleTimeoutMs?: number; // default 120s
  sweepIntervalMs?: number; // default 30s
  now?: () => number;
}

interface PoolEntry {
  key: string;
  target: BrowserTarget;
  lease: ProcessLease | null;
  refs: number; // live contexts
  contexts: number; // total contexts opened (cap guard)
  lastUsedAt: number;
  opening: Promise<PoolEntry> | null;
}

export interface LeasedBrowser {
  readonly entryKey: string;
  readonly browser: BrowserTarget["browser"];
  readonly endpoint: string;
  createContext(options: ContextOptions): Promise<BrowserContext>;
  releaseContext(): void; // call when the context closes
  isLive(): boolean;
}

const DEFAULTS: Required<Omit<PoolOptions, "now">> = {
  maxProcesses: 4,
  maxContextsPerProcess: 6,
  idleTimeoutMs: 120_000,
  sweepIntervalMs: 30_000,
};

export class BrowserPool {
  private readonly entries = new Map<string, PoolEntry>();
  private readonly sweeper: NodeJS.Timeout | null = null;
  private readonly opts: Required<Omit<PoolOptions, "now">> & { now: () => number };

  constructor(
    private readonly driver: BrowserDriver,
    options: PoolOptions = {}
  ) {
    this.opts = { ...DEFAULTS, ...options, now: options.now ?? Date.now };
    if (this.opts.sweepIntervalMs > 0) {
      this.sweeper = setInterval(() => void this.sweep(), this.opts.sweepIntervalMs);
      this.sweeper.unref?.();
    }
  }

  /** Deterministic reuse key — sessions on the same browser+mode+endpoint share a process. */
  static keyFor(target: BrowserTarget): string {
    return [
      target.browser,
      target.headless ? "headless" : "headed",
      target.endpoint ?? "local",
      target.channel ?? "",
    ].join("|");
  }

  async acquire(target: BrowserTarget): Promise<LeasedBrowser> {
    const key = BrowserPool.keyFor(target);
    let entry = this.entries.get(key);
    if (!entry) {
      const liveCount = [...this.entries.values()].filter((e) => e.lease || e.opening).length;
      if (liveCount >= this.opts.maxProcesses) {
        throw new CueError("quota", `Browser process limit reached (${this.opts.maxProcesses}). Close idle sessions or raise the pool limit.`);
      }
      entry = {
        key,
        target,
        lease: null,
        refs: 0,
        contexts: 0,
        lastUsedAt: this.opts.now(),
        opening: null,
      };
      entry.opening = this.driver
        .launch(target)
        .then((lease) => {
          entry!.lease = lease;
          entry!.opening = null;
          lease.process.on("disconnected", () => {
            this.entries.delete(key);
          });
          return entry!;
        })
        .catch((err) => {
          this.entries.delete(key);
          throw err;
        });
      this.entries.set(key, entry);
    }
    if (entry.opening) await entry.opening;
    if (!entry.lease) throw new CueError("browser_unavailable", "Pool entry lost its process during acquisition.");
    entry.lastUsedAt = this.opts.now();

    return this.leaseFor(entry);
  }

  private leaseFor(entry: PoolEntry): LeasedBrowser {
    const pool = this;
    return {
      entryKey: entry.key,
      browser: entry.target.browser,
      endpoint: entry.lease?.endpoint ?? "local",
      async createContext(options: ContextOptions): Promise<BrowserContext> {
        if (entry.contexts >= pool.opts.maxContextsPerProcess) {
          throw new CueError("quota", `Context limit reached for this browser process (${pool.opts.maxContextsPerProcess}). Close a session first.`);
        }
        const freshStorageState = options.storageState
          ? { cookies: options.storageState.cookies as never, origins: options.storageState.origins }
          : undefined;
        const context = await entry.lease!.process.newContext({
          storageState: freshStorageState,
          userAgent: options.userAgent ?? undefined,
          viewport: options.viewport ?? { width: 1366, height: 900 },
          acceptDownloads: options.acceptDownloadsDir != null,
          bypassCSP: false,
          javaScriptEnabled: true,
          ignoreHTTPSErrors: false,
        });
        entry.contexts += 1;
        entry.refs += 1;
        entry.lastUsedAt = pool.opts.now();
        context.on("close", () => {
          entry.refs = Math.max(0, entry.refs - 1);
          entry.lastUsedAt = pool.opts.now();
        });
        return context;
      },
      releaseContext() {
        entry.refs = Math.max(0, entry.refs - 1);
      },
      isLive(): boolean {
        return !!entry.lease && entry.lease.process.isConnected();
      },
    };
  }

  /** Reap idle, unreferenced processes. Returns reaped count (for diagnostics). */
  async sweep(): Promise<number> {
    const now = this.opts.now();
    let reaped = 0;
    for (const [key, entry] of this.entries) {
      if (entry.opening) continue;
      const idle = now - entry.lastUsedAt;
      if (entry.refs === 0 && entry.lease && idle >= this.opts.idleTimeoutMs) {
        this.entries.delete(key);
        reaped += 1;
        await entry.lease.process.close().catch(() => {});
      }
    }
    return reaped;
  }

  stats(): { processes: number; contexts: number; keys: string[] } {
    let contexts = 0;
    for (const e of this.entries.values()) contexts += e.refs;
    return { processes: this.entries.size, contexts, keys: [...this.entries.keys()] };
  }

  async destroyAll(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
    const entries = [...this.entries.values()];
    this.entries.clear();
    await Promise.all(entries.map((e) => e.lease?.process.close().catch(() => {})));
  }
}
