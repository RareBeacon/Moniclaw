import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/browser/api";
import { ACTIONS } from "@cue/index";

export const dynamic = "force-dynamic";

/** GET /api/browser/health — engine diagnostics (pool, queue, capabilities). */
export async function GET(request: Request) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const runtime = getBrowserRuntime();
    const pool = runtime.pool.stats();
    return ok({
      status: "ok",
      driver: { driver: "playwright", capabilities: ["chromium", "chrome", "msedge", "firefox", "headless", "headed", "remote-ws"] },
      remote: Boolean(process.env.BROWSER_WS_ENDPOINT),
      serverlessChromium: process.env.MCUE_SERVERLESS_CHROMIUM === "1",
      pool,
      queue: runtime.queue.stats(),
      actions: ACTIONS.length,
      vision: runtime.vision.capabilities(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
