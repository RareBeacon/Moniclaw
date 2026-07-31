import { z } from "zod";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullish(),
  browser: z.enum(["CHROMIUM", "CHROME", "MSEDGE", "FIREFOX"]).default("CHROMIUM"),
  userAgent: z.string().max(500).nullish(),
  viewport: z.object({ width: z.number().int().min(320).max(7680), height: z.number().int().min(240).max(4320) }).nullish(),
});

/** GET /api/browser/profiles — list reusable profiles. */
export async function GET(request: Request) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const runtime = getBrowserRuntime();
    const profiles = await runtime.profiles.list(g.principal.workspace.id);
    return ok({ profiles });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/browser/profiles — create (browser.profiles.manage). */
export async function POST(request: Request) {
  const g = await guard(request, "browser.profiles.manage");
  if (isGuarded(g)) return g.response;
  try {
    const body = createSchema.parse(await readJson(request));
    const runtime = getBrowserRuntime();
    const row = await runtime.profiles.create({
      workspaceId: g.principal.workspace.id,
      name: body.name,
      description: body.description ?? null,
      browser: body.browser,
      userAgent: body.userAgent ?? null,
      viewport: body.viewport ?? null,
      createdById: g.principal.userId,
    });
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId ?? undefined,
      action: AUDIT_ACTIONS.browserProfileCreate, targetType: "profile", targetId: row.id,
      metadata: { name: row.name, browser: row.browser },
    });
    return ok({ profile: row }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
