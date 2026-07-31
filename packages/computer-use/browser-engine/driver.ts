import type { BrowserContext, Browser, Page } from "playwright-core";
import type { BrowserTarget, CookieRecord, StorageState } from "../types";

/**
 * Driver port — the engine only ever talks to these interfaces. Implementations:
 *  • PlaywrightDriver (local launch or remote ws connect), see playwright.ts
 *  • a future CDP-direct / cloud-grid driver slots in here without touching
 *    actions, sessions, or execution.
 */

export interface ContextOptions {
  storageState?: StorageState;
  userAgent?: string | null;
  viewport?: { width: number; height: number } | null;
  baseURL?: string | null;
  /** downloads dir (driver-managed temp area). */
  acceptDownloadsDir?: string;
  /** When true the driver should auto-handle JS dialogs per this policy. */
  dialogPolicy?: "dismiss" | "accept";
}

export interface ProcessLease {
  /** Opaque handle to the live process (playwright Browser under local driver). */
  readonly process: Browser;
  /** Remote connects must not outlive their lease sweep. */
  readonly remote: boolean;
  readonly endpoint: string; // "local" | ws url (sanitized, no token)
  readonly browser: BrowserTarget["browser"];
}

export interface BrowserDriver {
  /** Launch (local) or connect (remote) — returns a process lease. */
  launch(target: BrowserTarget): Promise<ProcessLease>;
  describe(): { driver: string; capabilities: string[] };
}

export type { BrowserContext, Page };
