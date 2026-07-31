import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getAgentRuntime } from "@/lib/agents/runtime";
import { errorResponse, guard, isGuarded, ok, readJson } from "@/lib/agents/api";
import { agentCreateApiSchema } from "@/lib/validations/agents";

export const dynamic = "force-dynamic";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "worker";
}

/** GET /api/agents — workers in the workspace. */
export async function GET(request: Request) {
  const g = await guard(request, "agents.read");
  if (isGuarded(g)) return g.response;
  try {
    const runtime = getAgentRuntime();
    const agents = await runtime.repos.agents.list(g.principal.workspace.id, {
      includeArchived: new URL(request.url).searchParams.get("includeArchived") === "1",
    });
    return ok({ agents });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/agents — create a worker definition. */
export async function POST(request: Request) {
  const g = await guard(request, "agents.create");
  if (isGuarded(g)) return g.response;
  try {
    const parsed = agentCreateApiSchema.parse(await readJson(request));
    const baseSlug = parsed.slug ?? slugify(parsed.name);

    // Unique (workspaceId, slug) — race-safe retry with numeric suffixes.
    let agent = null;
    for (let attempt = 0; attempt < 5 && !agent; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      try {
        agent = await db.agent.create({
          data: {
            workspaceId: g.principal.workspace.id,
            name: parsed.name,
            slug,
            description: parsed.description,
            category: parsed.category ?? null,
            status: parsed.status,
            trigger: parsed.trigger,
            schedule: parsed.schedule ?? null,
            skills: parsed.skills,
            workerType: parsed.workerType,
            goal: parsed.goal ?? null,
            instructions: parsed.instructions ?? null,
            toolPolicy: parsed.toolPolicy as object,
            budget: parsed.budget as object,
          },
        });
      } catch (err) {
        if (!/unique|duplicate/i.test(String((err as Error)?.message))) throw err;
      }
    }
    if (!agent) throw new Error("Could not allocate a unique slug.");

    await audit({
      workspaceId: g.principal.workspace.id,
      actorId: g.principal.userId,
      action: "agent.create",
      targetType: "agent",
      targetId: agent.id,
      metadata: { slug: agent.slug, workerType: agent.workerType },
    });
    return ok({ agent }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
