import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, guard, isGuarded, ok } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

/** GET /api/browser/downloads — list captured downloads (workspace-scoped). */
export async function GET(request: Request) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const runtime = getBrowserRuntime();
    const downloads = await runtime.downloads.list(g.principal.workspace.id, { limit: 100 });
    return ok({
      downloads: downloads.map((d) => ({
        ...d,
        fileUrl: `/api/browser/downloads/${d.id}/file`,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
