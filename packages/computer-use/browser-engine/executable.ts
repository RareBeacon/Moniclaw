import { existsSync } from "node:fs";
import { join } from "node:path";
import { CueError } from "../errors";
import type { BrowserTarget } from "../types";

/**
 * Browser executable resolution — where can a driver come from?
 *
 *  1. BROWSER_WS_ENDPOINT (remote worker; production pattern — see
 *     packages/browser-worker) → no local executable needed.
 *  2. PLAYWRIGHT_BROWSERS_PATH / default cache with a playwright-managed
 *     chromium/firefox build (dev, CI, VM deployments).
 *  3. Vendor channels: chrome/msedge executables installed on the host.
 *  4. MCUE_SERVERLESS_CHROMIUM=1 → @sparticuz/chromium (Vercel Lambda) —
 *     dynamically imported so standard deployments ship zero extra weight.
 *
 *  Nothing else fakes availability: if no source exists we throw
 *  browser_unavailable with an actionable message (mirrors Phase 3's honest
 *  no_provider posture).
 */

export interface ExecutablePlan {
  mode: "remote" | "local" | "channel" | "serverless";
  endpoint?: string; // remote ws (token never included in logs)
  token?: string;
  channel?: "chrome" | "msedge";
  executablePath?: string;
}

export interface ResolveInput {
  browser: BrowserTarget["browser"];
  headless: boolean;
}

/** Vendor channel executables probed on common hosts. */
const CHANNEL_PATHS: Record<"chrome" | "msedge", string[]> = {
  chrome: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome"],
  msedge: ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable", "/opt/microsoft/msedge/msedge"],
};

export function channelForBrowser(browser: BrowserTarget["browser"]): "chrome" | "msedge" | null {
  if (browser === "CHROME") return "chrome";
  if (browser === "MSEDGE") return "msedge";
  return null;
}

function firstExisting(paths: string[]): string | null {
  for (const p of paths) if (existsSync(p)) return p;
  return null;
}

/**
 * Decide HOW to obtain a browser for the target. Pure resolution — callers
 * decide whether a remote endpoint is acceptable (serverless invocations
 * should prefer remote or serverless-chromium, never spawn processes).
 */
export async function resolveExecutable(input: ResolveInput): Promise<ExecutablePlan> {
  // 1 · Remote worker — the documented production topology.
  const endpoint = process.env.BROWSER_WS_ENDPOINT;
  if (endpoint) {
    return {
      mode: "remote",
      endpoint,
      token: process.env.BROWSER_WORKER_TOKEN,
    };
  }

  // 2 · Serverless chromium (opt-in; dependency loaded on demand).
  if (process.env.MCUE_SERVERLESS_CHROMIUM === "1") {
    let chromiumPack: { executablePath(): Promise<string> } & Record<string, unknown>;
    try {
      const mod = (await import("@sparticuz/chromium").catch(() => null)) as
        | { default?: { executablePath(): Promise<string> } & Record<string, unknown> }
        | null;
      chromiumPack = (mod?.default ?? null) as never;
    } catch {
      chromiumPack = null as never;
    }
    if (chromiumPack) {
      const executablePath = await chromiumPack.executablePath();
      return { mode: "serverless", executablePath };
    }
    // fall through to local — sparticuz not installed
  }

  // 3 · Vendor channels (only meaningful when explicitly requested).
  const channel = channelForBrowser(input.browser);
  if (channel) {
    const executablePath = firstExisting(CHANNEL_PATHS[channel]);
    if (executablePath) return { mode: "channel", channel, executablePath };
    throw new CueError(
      "browser_unavailable",
      `Browser channel "${channel}" is not installed on this host (looked in: ${CHANNEL_PATHS[channel].join(", ")}). Use CHROMIUM or provision a browser worker.`
    );
  }

  // 4 · Local playwright-managed build. Resolution is delegated to the driver
  //     (playwright knows its cache layout) — we just sanity-check the cache.
  const cacheRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (cacheRoot && !existsSync(cacheRoot)) {
    throw new CueError(
      "browser_unavailable",
      `PLAYWRIGHT_BROWSERS_PATH (${cacheRoot}) does not exist. Run "npx playwright install ${input.browser === "FIREFOX" ? "firefox" : "chromium"}" or configure BROWSER_WS_ENDPOINT.`
    );
  }
  return { mode: "local" };
}

/** Redact tokens/passwords from endpoints before persisting/logging. */
export function sanitizeEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    url.username = "";
    url.password = "";
    url.searchParams.delete("token");
    return url.toString().replace(/\/+$/, "");
  } catch {
    return endpoint.replace(/(token=)[^&]+/i, "$1•••");
  }
}
