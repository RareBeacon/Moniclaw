import { z } from "zod";
import { catalogMetadata } from "@cue/index";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/browser/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const runSchema = z.object({
  sessionId: z.string().uuid(),
  action: z.string().min(1).max(60),
  args: z.record(z.string(), z.unknown()).default({}),
});

/** GET /api/browser/actions — the action catalog (schemas, permissions, risk). */
export async function GET(request: Request) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  return ok({ actions: catalogMetadata() });
}

/** POST /api/browser/actions — run ONE action inline against a session. */
export async function POST(request: Request) {
  const g = await guard(request, "browser.execute", { rate: "browserExecute" });
  if (isGuarded(g)) return g.response;
  try {
    const body = runSchema.parse(await readJson(request));
    const runtime = getBrowserRuntime();
    const row = await runtime.executions.runInline({
      workspaceId: g.principal.workspace.id,
      userId: g.principal.userId,
      sessionId: body.sessionId,
      steps: [{ action: body.action, args: body.args }],
    });
    return ok({ execution: row });
  } catch (err) {
    return errorResponse(err);
  }
}
