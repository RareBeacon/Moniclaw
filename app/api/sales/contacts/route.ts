import { getSalesRuntime } from "@/lib/sales/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/sales/api";
import { contactCreateApiSchema, salesSearchFiltersSchema } from "@/lib/validations/sales";

export const dynamic = "force-dynamic";

/** GET /api/sales/contacts — search + filter. */
export async function GET(request: Request) {
  const g = await guard(request, "sales.read");
  if (isGuarded(g)) return g.response;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const filters = salesSearchFiltersSchema.parse({
      ...params,
      ...(typeof params.tags === "string" ? { tags: params.tags.split(",").filter(Boolean) } : {}),
    });
    const contacts = await getSalesRuntime().repos.contacts.list(g.principal.workspace.id, filters);
    return ok({ contacts });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/sales/contacts — create (email-deduped per workspace). */
export async function POST(request: Request) {
  const g = await guard(request, "sales.write");
  if (isGuarded(g)) return g.response;
  try {
    const input = contactCreateApiSchema.parse(await readJson(request));
    const contact = await getSalesRuntime().crm.createContact(g.principal.workspace.id, g.principal.userId, input);
    return ok({ contact }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
