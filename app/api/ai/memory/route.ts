import { z } from "zod";
import { db } from "@/lib/db";
import { getRuntime } from "@/lib/ai/runtime";
import { ok, fail, errorResponse, readJson } from "@/lib/ai/api";
import { requirePrincipal, resolveApiPrincipal } from "@/lib/api-auth";

/** GET    /api/ai/memory — list/filter records (scope, conversationKey, limit)
 *  POST   /api/ai/memory — store a memory (embeds when a provider exists)
 *  DELETE /api/ai/memory?id=… — forget one record (MANAGER+) */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const writeSchema = z.object({
  scope: z.enum(["CONVERSATION", "WORKSPACE", "AGENT", "LONG_TERM"]).default("WORKSPACE"),
  content: z.string().min(1).max(8_000),
  agentId: z.string().uuid().optional(),
  conversationKey: z.string().max(120).optional(),
  importance: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
  embed: z.boolean().default(true),
});

const memoryRead = async (request: Request) => {
  const principal = await resolveApiPrincipal(request);
  const guard = requirePrincipal(principal, "ai.memory.read");
  if (guard) return { response: guard } as const;
  return { principal } as const;
};

export async function GET(request: Request) {
  try {
    const { principal, response } = await memoryRead(request);
    if (response) return response;
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    const conversationKey = url.searchParams.get("conversationKey");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
    const records = await db.memoryRecord.findMany({
      where: {
        workspaceId: principal!.workspace.id,
        ...(scope ? { scope: scope as never } : {}),
        ...(conversationKey ? { conversationKey } : {}),
      },
      orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true, scope: true, content: true, importance: true, tags: true,
        conversationKey: true, expiresAt: true, createdAt: true,
        embeddingModel: true,
      },
    });
    return ok({ records: records.map((r) => ({ ...r, embedded: !!r.embeddingModel })) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "ai.memory.write");
    return guard ?? (await (async () => {
      const parsed = writeSchema.parse(await readJson(request));
      const runtime = getRuntime();

      let embedding: number[] | undefined;
      if (parsed.embed) {
        try {
          const response = await runtime.router.embed(
            { workspaceId: principal!.workspace.id, userId: principal!.userId },
            { texts: [parsed.content], taskType: "RETRIEVAL_DOCUMENT", signal: request.signal }
          );
          embedding = response.vectors[0];
        } catch {
          embedding = undefined; // embedding optional — memory still stored
        }
      }

      const record = await runtime.memory.remember({
        workspaceId: principal!.workspace.id,
        scope: parsed.scope,
        content: parsed.content,
        agentId: parsed.agentId ?? null,
        conversationKey: parsed.conversationKey ?? null,
        importance: parsed.importance,
        tags: parsed.tags,
        expiresAt: parsed.expiresInDays
          ? new Date(Date.now() + parsed.expiresInDays * 86_400_000)
          : null,
        createdById: principal!.userId,
        embedding,
      });
      return ok({ record: { id: record.id, scope: record.scope, embedded: !!embedding } }, { status: 201 });
    })());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "ai.memory.delete");
    if (guard) return guard;
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return fail(400, "validation", "Pass ?id=<record id>.");
    const result = await db.memoryRecord.deleteMany({
      where: { id, workspaceId: principal!.workspace.id },
    });
    if (!result.count) return fail(404, "not_found", "Memory record not found.");
    return ok({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
