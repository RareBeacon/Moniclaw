import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, fail, guard, isGuarded } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/browser/screenshots/[id]/image — raw image bytes. */
export async function GET(request: Request, { params }: Params) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const found = await runtime.screenshots.read(id, g.principal.workspace.id);
    if (!found) return fail(404, "not_found", "Screenshot not found in this workspace.");
    return new Response(new Uint8Array(found.binary.data), {
      headers: {
        "Content-Type": found.binary.mime,
        "Content-Length": String(found.binary.data.length),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
