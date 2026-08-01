import { createManualDraft } from "@/lib/sales/drafts";
import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { draftCreateApiSchema } from "@/lib/validations/sales";
import { SALES_DRAFT_STATUSES } from "@sales/index";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** GET /api/sales/drafts — list (single/comma statuses, contact/company). */
export async function GET(request: Request) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const q = z.object({
      status: z.string().optional(),
      contactId: z.string().uuid().optional(),
      companyId: z.string().uuid().optional(),
      take: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const statuses = q.status?.split(",").filter((s) => (SALES_DRAFT_STATUSES as readonly string[]).includes(s));
    const drafts = await getSalesRuntime().repos.drafts.list(g.principal.workspace.id, {
      ...(statuses?.length ? { status: statuses } : {}),
      ...(q.contactId ? { contactId: q.contactId } : {}),
      ...(q.companyId ? { companyId: q.companyId } : {}),
      take: q.take,
    });
    return ok({ drafts });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/sales/drafts — manual draft; nothing ever auto-sends. */
export async function POST(request: Request) {
  const g = await guard(request, "sales.write", { rate: "salesDraftCreate" });
  if (isGuarded(g)) return g.response;
  try {
    const input = draftCreateApiSchema.parse(await readJson(request));
    const draft = await createManualDraft(g.principal.workspace.id, g.principal.userId, input);
    return ok({ draft }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
