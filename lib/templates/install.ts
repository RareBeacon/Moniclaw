import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { TemplateManifest } from "@/lib/templates/catalog";

export class InstallError extends Error {
  constructor(
    readonly code: "not_found" | "failed",
    message: string
  ) {
    super(message);
    this.name = "InstallError";
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "worker";
}

/**
 * Install a catalog template into a workspace: mint a REAL Agent from the
 * declarative manifest (SHADOW/DRAFT by design — workers earn autonomy, the
 * operator flips status when satisfied), stamp install lineage, count the
 * install. Slug collisions resolve with numeric suffixes, same as manual
 * agent creation — installing twice yields a second, independent worker.
 */
export async function installTemplate(workspaceId: string, actorId: string | null, slug: string) {
  const template = await db.agentTemplate.findUnique({ where: { slug } });
  if (!template) throw new InstallError("not_found", "Template not found in the catalog.");
  const manifest = template.manifest as unknown as TemplateManifest;

  const baseSlug = slugify(template.name);
  let agent = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5 && !agent; attempt++) {
    const agentSlug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    try {
      agent = await db.$transaction(async (tx) => {
        const created = await tx.agent.create({
          data: {
            workspaceId,
            name: template.name,
            slug: agentSlug,
            description: template.summary,
            category: template.category,
            status: manifest.status ?? "SHADOW",
            trigger: manifest.trigger ?? "MANUAL",
            schedule: manifest.schedule ?? null,
            skills: manifest.skills ?? [],
            workerType: template.workerType,
            goal: manifest.goal,
            instructions: manifest.instructions,
            toolPolicy: (manifest.toolPolicy ?? {}) as object,
            budget: (manifest.budget ?? {}) as object,
            templateSlug: template.slug,
          },
        });
        await tx.agentTemplate.update({
          where: { id: template.id },
          data: { installs: { increment: 1 } },
        });
        return created;
      });
    } catch (err) {
      lastError = err;
      if (!/unique|duplicate/i.test(String((err as Error)?.message))) throw err;
    }
  }
  if (!agent) {
    throw new InstallError(
      "failed",
      `Could not allocate a worker slug for this template${lastError ? ` (${(lastError as Error).message.slice(0, 120)})` : ""}.`
    );
  }

  await audit({
    workspaceId,
    actorId,
    action: "agent.create",
    targetType: "agent",
    targetId: agent.id,
    metadata: { source: "template", template: template.slug, version: template.version },
  });

  return { agent, template };
}
