import { z } from "zod";
import { getBrowserRuntime } from "@/lib/browser/runtime";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/browser/api";

export const dynamic = "force-dynamic";

const domainList = z.array(z.string().min(1).max(253)).max(200);

const policySchema = z.object({
  readOnly: z.boolean(),
  navigationOnly: z.boolean(),
  allowJavascript: z.boolean(),
  allowDownloads: z.boolean(),
  allowUploads: z.boolean(),
  allowClipboard: z.boolean(),
  allowedDomains: domainList,
  blockedDomains: domainList,
  confirmationDomains: domainList,
  defaultAllowed: z.boolean(),
});

/** GET /api/browser/permissions — effective policy + permission summary. */
export async function GET(request: Request) {
  const g = await guard(request, "browser.read");
  if (isGuarded(g)) return g.response;
  try {
    const runtime = getBrowserRuntime();
    const policy = await runtime.permissions.policyFor(g.principal.workspace.id);
    return ok({
      policy,
      evaluationOrder: ["blocked", "confirmation", "allowed", "defaultAllowed"],
      permissionTiers: {
        readOnly: "Extraction/capture only",
        navigationOnly: "+ navigate family",
        javascriptGate: policy.allowJavascript ? "execute_javascript allowed" : "execute_javascript denied",
        downloads: policy.allowDownloads,
        uploads: policy.allowUploads,
        clipboard: policy.allowClipboard,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT /api/browser/permissions — update workspace policy (ADMIN). */
export async function PUT(request: Request) {
  const g = await guard(request, "browser.policy.manage");
  if (isGuarded(g)) return g.response;
  try {
    const body = policySchema.parse(await readJson(request));
    const runtime = getBrowserRuntime();
    await runtime.permissions.save({ workspaceId: g.principal.workspace.id, ...body }, g.principal.userId ?? "");
    await audit({
      workspaceId: g.principal.workspace.id, actorId: g.principal.userId ?? undefined,
      action: AUDIT_ACTIONS.browserPolicyUpdate, targetType: "policy",
      metadata: { readOnly: body.readOnly, navigationOnly: body.navigationOnly, allowJavascript: body.allowJavascript, allowedDomains: body.allowedDomains.length, blockedDomains: body.blockedDomains.length, confirmationDomains: body.confirmationDomains.length },
    });
    return ok({ policy: body });
  } catch (err) {
    return errorResponse(err);
  }
}
