import { z } from "zod";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  defaultBrowser: z.enum(["CHROMIUM", "CHROME", "MSEDGE", "FIREFOX"]),
  headless: z.boolean(),
  actionTimeoutMs: z.number().int().min(1000).max(120_000),
  executionTimeoutMs: z.number().int().min(5000).max(600_000),
  sessionIdleTimeoutSec: z.number().int().min(30).max(86_400),
  maxConcurrentSessions: z.number().int().min(1).max(10),
  dialogPolicy: z.enum(["dismiss", "accept"]),
  screenshotOnFail: z.boolean(),
  recordScreenshots: z.boolean(),
  maxArtifactMB: z.number().int().min(1).max(50),
});

/** GET /api/browser/settings — engine settings for this workspace. */
export async function GET(request: Request) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const runtime = getBrowserRuntime();
    const settings = await runtime.repos.settings.getSettings(g.principal.workspace.id);
    return ok({ settings });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT /api/browser/settings — update engine settings (ADMIN). */
export async function PUT(request: Request) {
  const g = await guard(request, "browser.settings.manage");
  if (isGuarded(g)) return g.response;
  try {
    const body = settingsSchema.parse(await readJson(request));
    const runtime = getBrowserRuntime();
    await runtime.repos.settings.saveSettings({ workspaceId: g.principal.workspace.id, ...body }, g.principal.userId ?? "");
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId ?? undefined,
      action: AUDIT_ACTIONS.browserSettingsUpdate, targetType: "settings",
      metadata: body as Record<string, unknown>,
    });
    return ok({ settings: { workspaceId: g.principal.workspace.id, ...body } });
  } catch (err) {
    return errorResponse(err);
  }
}
