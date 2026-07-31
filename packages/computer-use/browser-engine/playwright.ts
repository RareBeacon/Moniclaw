import { chromium, firefox, type Browser, type BrowserType } from "playwright-core";
import { CueError } from "../errors";
import type { BrowserTarget } from "../types";
import { resolveExecutable, sanitizeEndpoint, type ExecutablePlan } from "./executable";
import type { BrowserDriver, ProcessLease } from "./driver";

/**
 * Playwright-backed driver — local launch, vendor channel, remote ws connect,
 * or opt-in serverless chromium. The ONLY playwright-aware module in MCUE;
 * every other package consumes the driver port.
 */

/** Container- and CI-safe args. --no-sandbox is required in containers where
 *  user namespaces aren't available (documented, deliberate). */
export const CONTAINER_SAFE_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-features=TranslateUI",
  "--no-first-run",
  "--no-default-browser-check",
];

async function browserTypeFor(browser: BrowserTarget["browser"]): Promise<BrowserType> {
  switch (browser) {
    case "CHROMIUM":
    case "CHROME":
    case "MSEDGE":
      return chromium;
    case "FIREFOX":
      return firefox;
  }
}

async function launchWithPlan(plan: ExecutablePlan, target: BrowserTarget): Promise<Browser> {
  const type = await browserTypeFor(target.browser);

  if (plan.mode === "remote") {
    // Remote worker (packages/browser-worker or any playwright.launchServer).
    const wsEndpoint = plan.endpoint!;
    const headers = plan.token ? { "x-mcue-token": plan.token } : undefined;
    const browser = await (type as typeof chromium)
      .connect(wsEndpoint, headers ? { headers, timeout: 15_000 } : { timeout: 15_000 })
      .catch((err) => {
        throw new CueError("browser_unavailable", `Remote browser worker unreachable at ${sanitizeEndpoint(wsEndpoint)}: ${(err as Error).message.slice(0, 200)}`, { cause: err });
      });
    return browser;
  }

  const common = {
    headless: target.headless,
    args: [...CONTAINER_SAFE_ARGS],
    timeout: 20_000,
  };

  if (plan.mode === "channel") {
    return type.launch({ ...common, channel: plan.channel });
  }

  if (plan.mode === "serverless") {
    let args = common.args;
    try {
      const mod = (await import("@sparticuz/chromium").catch(() => null)) as {
        default?: { args: string[] };
      } | null;
      if (mod?.default?.args) args = [...mod.default.args, ...common.args];
    } catch { /* args stay container-safe */ }
    return type.launch({ ...common, args, executablePath: plan.executablePath });
  }

  // Local playwright-managed build.
  return type.launch(common).catch((err) => {
    const message = (err as Error).message;
    if (/executable doesn't exist|browser is not installed|please run|Failed to launch/i.test(message)) {
      throw new CueError(
        "browser_unavailable",
        `No local ${target.browser.toLowerCase()} runtime found (and BROWSER_WS_ENDPOINT is unset). Run "npx playwright install ${target.browser === "FIREFOX" ? "firefox" : "chromium"}" or provision packages/browser-worker.`,
        { cause: err }
      );
    }
    throw new CueError("browser_crash", `Failed to launch browser: ${message.slice(0, 250)}`, { cause: err });
  });
}

export class PlaywrightDriver implements BrowserDriver {
  async launch(target: BrowserTarget): Promise<ProcessLease> {
    const plan = await resolveExecutable({ browser: target.browser, headless: target.headless });
    // A wall-clock guard so a hung connect/launch can't pin the caller forever.
    const browser = await Promise.race([
      launchWithPlan(plan, target),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new CueError("timeout", "Browser launch/connect timed out (25s)")), 25_000)
      ),
    ]);
    return {
      process: browser,
      remote: plan.mode === "remote",
      endpoint: plan.mode === "remote" ? sanitizeEndpoint(plan.endpoint!) : "local",
      browser: target.browser,
    };
  }

  describe() {
    return {
      driver: "playwright",
      capabilities: ["chromium", "chrome", "msedge", "firefox", "headless", "headed", "remote-ws", "serverless-opt-in"],
    };
  }
}
