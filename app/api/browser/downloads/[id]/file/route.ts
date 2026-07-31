import { getBrowserRuntime } from "@/lib/browser/runtime";
import { errorResponse, fail, guard, isGuarded } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/browser/downloads/[id]/file — stream the payload (HELD → 403). */
export async function GET(request: Request, { params }: Params) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const { id } = await params;
    const runtime = getBrowserRuntime();
    const found = await runtime.downloads.read(id, g.principal.workspace.id);
    if (!found) return fail(404, "not_found", "Download not found in this workspace.");
    const { row, binary } = found;
    if (row.scanStatus === "HELD") {
      return fail(403, "policy_denied", `Download is held by the content scanner (${row.scanDetail ?? "no detail"}). Delete it or adjust the scanner policy.`);
    }
    return new Response(new Uint8Array(binary.data), {
      headers: {
        "Content-Type": row.mime || "application/octet-stream",
        "Content-Length": String(binary.data.length),
        "Content-Disposition": `attachment; filename="${row.filename.replace(/"/g, "_")}"`,
        "X-Content-Sha256": row.sha256,
        "X-Scan-Status": row.scanStatus,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
