import { getRuntime } from "@/lib/ai/runtime";
import { ok, errorResponse } from "@/lib/ai/api";
import { requirePrincipal, resolveApiPrincipal } from "@/lib/api-auth";

/** GET /api/ai/usage?days=30 — aggregated AI usage for the dashboard/SDK. */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "usage.read");
    if (guard) return guard;
    const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get("days") ?? 30) || 30, 1), 365);
    const runtime = getRuntime();
    const summary = await runtime.usage.summarize(principal!.workspace.id, days);
    return ok(summary);
  } catch (err) {
    return errorResponse(err);
  }
}
