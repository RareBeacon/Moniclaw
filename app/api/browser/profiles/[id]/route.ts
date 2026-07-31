import { z } from "zod";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { errorResponse, fail, guard, isGuarded, ok, readJson } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullish(),
  userAgent: z.string().max(500).nullish(),
  viewport: z.object({ width: z.number().int().min(320).max(7680), height: z.number().int().min(240).max(4320) }).nullish(),
  clearStorageState: z.boolean().optional(),
});

/** GET /api/browser/profiles/[id] — detail (+ whether storage state exists). */
export async function GET(request: Request, { params }: Params) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const row = await runtime.profiles.get(id, g.principal.workspace.id);
    if (!row) return fail(404, "not_found", "Profile not found in this workspace.");
    const state = await runtime.profiles.readStorageState(id).catch(() => null);
    return ok({
      profile: row,
      storageState: state ? { cookies: state.cookies.length, origins: state.origins.length } : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PATCH /api/browser/profiles/[id] — update metadata / clear stored state. */
export async function PATCH(request: Request, { params }: Params) {
  const g = await guard(request, "browser.profiles.manage");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const body = patchSchema.parse(await readJson(request));
    const runtime = getBrowserRuntime();
    const row = await runtime.profiles.get(id, g.principal.workspace.id);
    if (!row) return fail(404, "not_found", "Profile not found in this workspace.");
    await runtime.profiles.update(id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description ?? null } : {}),
      ...(body.userAgent !== undefined ? { userAgent: body.userAgent ?? null } : {}),
      ...(body.viewport !== undefined ? { viewport: body.viewport ?? null } : {}),
    });
    if (body.clearStorageState) await runtime.profiles.clearStorageState(id);
    return ok({ profile: await runtime.profiles.get(id, g.principal.workspace.id) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/browser/profiles/[id] — soft delete + wipe stored state. */
export async function DELETE(request: Request, { params }: Params) {
  const g = await guard(request, "browser.profiles.manage");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const deleted = await runtime.profiles.softDelete(id, g.principal.workspace.id);
    if (!deleted) return fail(404, "not_found", "Profile not found in this workspace.");
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId ?? undefined,
      action: AUDIT_ACTIONS.browserProfileDelete, targetType: "profile", targetId: id,
    });
    return ok({ deleted: true, id });
  } catch (err) {
    return errorResponse(err);
  }
}
