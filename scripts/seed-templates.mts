/**
 * Seed the first-party template catalog (Phase 8) — idempotent slug upserts.
 * Safe to re-run: manifest edits in lib/templates/catalog.ts publish on the
 * next seed; install counters are preserved (only content fields update).
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/seed-templates.mts
 */
import { PrismaClient } from "@prisma/client";
import { FIRST_PARTY_TEMPLATES } from "../lib/templates/catalog";

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(2);
  }
  const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  try {
    let created = 0;
    let updated = 0;
    for (const tpl of FIRST_PARTY_TEMPLATES) {
      const existing = await db.agentTemplate.findUnique({ where: { slug: tpl.slug } });
      await db.agentTemplate.upsert({
        where: { slug: tpl.slug },
        create: {
          slug: tpl.slug,
          name: tpl.name,
          summary: tpl.summary,
          description: tpl.description,
          category: tpl.category,
          workerType: tpl.workerType,
          icon: tpl.icon,
          manifest: tpl.manifest as object,
        },
        update: {
          name: tpl.name,
          summary: tpl.summary,
          description: tpl.description,
          category: tpl.category,
          workerType: tpl.workerType,
          icon: tpl.icon,
          manifest: tpl.manifest as object,
        },
      });
      if (existing) updated++;
      else created++;
      console.log(`  · ${tpl.slug} ${existing ? "updated" : "created"}`);
    }
    console.log(`\nCatalog seeded: ${created} created, ${updated} refreshed (${FIRST_PARTY_TEMPLATES.length} total).\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
