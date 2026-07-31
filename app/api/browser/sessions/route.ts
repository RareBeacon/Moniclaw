import { z } from "zod";
import { CueError } from "@cue/index";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/browser/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const createSchema = z.object({
  kind: z.enum(["EPHEMERAL", "PERSISTENT", "INCOGNITO"]).optional(),
  profileId: z.string().uuid().nullish(),
  browser: z.enum(["CHROMIUM", "CHROME", "MSEDGE", "FIREFOX"]).optional(),
  mode: z.enum(["HEADLESS", "HEADED"]).optional(),
  startUrl: z.string().url().max(2000).optional(),
});

/** GET /api/browser/sessions — list sessions (workspace-scoped). */
export async function GET(request: Request) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const runtime = getBrowserRuntime();
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const sessions = await runtime.sessions.list(g.principal.workspace.id, {
      ...(status ? { status: status.split(",") as never } : {}),
      limit: 50,
    });
    return ok({ sessions: sessions.map((s) => ({ ...s, live: runtime.sessions.isLive(s.id) })) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/browser/sessions — create a session (policy-checked startUrl). */
export async function POST(request: Request) {
  const g = await guard(request, "browser.execute", { rate: "browserSession" });
  if (isGuarded(g)) return g.response;
  try {
    const body = createSchema.parse(await readJson(request));
    const runtime = getBrowserRuntime();
    if (body.startUrl) {
      const policy = await runtime.permissions.policyFor(g.principal.workspace.id);
      const verdict = runtime.permissions.assertNavigation(policy, body.startUrl); // blocked → throws
      if (verdict.needsConfirmation) {
        throw new CueError("policy_denied", `startUrl matches confirmation rule "${verdict.matched}" — open the session without startUrl and navigate via an execution (approval gate applies).`);
      }
    }
    const row = await runtime.sessions.create({
      workspaceId: g.principal.workspace.id,
      userId: g.principal.userId,
      ...(body.kind ? { kind: body.kind } : {}),
      profileId: body.profileId ?? null,
      ...(body.browser ? { browser: body.browser } : {}),
      ...(body.mode ? { mode: body.mode } : {}),
      ...(body.startUrl ? { startUrl: body.startUrl } : {}),
    });
    return ok({ session: row }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
