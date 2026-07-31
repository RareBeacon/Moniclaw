/**
 * MCUE shared contracts — pure types, zero implementation imports.
 * Everything in the engine depends on these primitives.
 */

export type BrowserId = "CHROMIUM" | "CHROME" | "MSEDGE" | "FIREFOX";
export type BrowserMode = "HEADLESS" | "HEADED";
export type SessionKind = "EPHEMERAL" | "PERSISTENT" | "INCOGNITO";

export type SessionStatus =
  | "STARTING" | "ACTIVE" | "IDLE" | "RECOVERING"
  | "CLOSED" | "ERROR" | "TIMEOUT";

export type ExecutionStatus =
  | "QUEUED" | "PLANNING" | "RUNNING" | "VALIDATING" | "RETRYING"
  | "SUCCEEDED" | "FAILED" | "CANCELLED" | "AWAITING_APPROVAL";

export type ActionEventStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED" | "RECOVERED";

/** What an action is allowed to touch — smallest unit of the policy engine. */
export type ActionPermission =
  | "read"            // extraction, capture, attribute reads
  | "navigate"        // navigation family
  | "interact"        // clicks, hover, focus, drag/drop, select/check/radio
  | "input"           // typing into the page
  | "javascript"      // arbitrary in-page script execution
  | "files:download"
  | "files:upload"
  | "cookies:read"
  | "cookies:write"
  | "clipboard";

export type ActionCategory =
  | "navigation" | "tabs" | "mouse" | "input" | "scroll"
  | "dom" | "capture" | "files" | "cookies" | "script";

/** Risk tier drives step-screenshot + approval heuristics. */
export type RiskTier = "low" | "medium" | "high";

/** Resolved launch plan for one browser process. */
export interface BrowserTarget {
  browser: BrowserId;
  headless: boolean;
  /** "chrome" | "msedge" — uses the vendor build when installed locally. */
  channel?: "chrome" | "msedge";
  /** Remote worker ws endpoint (chromium.connect). "local" or undefined = in-process. */
  endpoint?: string;
  /** Auth header for remote workers, never persisted to DB. */
  token?: string;
}

/** Common selectors — see selectors/types.ts for the full spec union. */
export interface CookieRecord {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number; // unix seconds; -1/undefined = session cookie
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

/** Playwright storageState shape (kept structurally to avoid a hard import). */
export interface StorageState {
  cookies: CookieRecord[];
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
}

/** Session limits resolved from workspace settings at runtime. */
export interface EngineLimits {
  actionTimeoutMs: number;
  executionTimeoutMs: number;
  sessionIdleTimeoutSec: number;
  maxConcurrentSessions: number;
  artifactMaxBytes: number;
  dialogPolicy: "dismiss" | "accept";
  screenshotOnFail: boolean;
  recordScreenshots: boolean;
}

export const DEFAULT_ENGINE_LIMITS: EngineLimits = {
  actionTimeoutMs: 30_000,
  executionTimeoutMs: 120_000,
  sessionIdleTimeoutSec: 600,
  maxConcurrentSessions: 3,
  artifactMaxBytes: 25 * 1024 * 1024,
  dialogPolicy: "dismiss",
  screenshotOnFail: true,
  recordScreenshots: true,
};

/** Element box in CSS pixels — vision + drag/drop share it. */
export interface ElementBox { x: number; y: number; width: number; height: number }

/** A captured artifact handed from an action to the persistence layer. */
export interface ActionArtifact {
  kind: "screenshot" | "pdf" | "download" | "file-ref";
  data?: Buffer;
  tempPath?: string;
  suggestedFilename?: string;
  mime?: string;
  /** Upload ids an upload_file action consumed (for usedCount accounting). */
  uploadIds?: string[];
}
