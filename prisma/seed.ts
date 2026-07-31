/**
 * Development seed — idempotent demo workspace so the dashboard is explorable
 * on first boot. Run: npm run db:seed (requires DATABASE_URL).
 *
 * Demo credentials: demo@moniclaw.dev / password123  (development only)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = "demo@moniclaw.dev";
  const passwordHash = await bcrypt.hash("password123", 12);

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: {
      name: "Demo Operator",
      email,
      passwordHash,
      emailVerified: new Date(),
    },
  });

  let membership = await db.membership.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
  });
  if (!membership) {
    const workspace = await db.workspace.create({
      data: {
        name: "Demo Logistics Co",
        slug: `demo-logistics-${Math.random().toString(36).slice(2, 6)}`,
        plan: "GROWTH",
        memberships: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    membership = { workspace } as never;
  }
  const workspaceId = membership!.workspace.id;

  // ── Agents ─────────────────────────────────────────────────────────
  const mara = await db.agent.upsert({
    where: { workspaceId_slug: { workspaceId, slug: "mara-ar" } },
    update: {},
    create: {
      workspaceId,
      name: "Mara — AR reconciler",
      slug: "mara-ar",
      category: "finance",
      description:
        "Every weekday at 06:00, reconcile the prior day's Stripe payouts against open NetSuite invoices. Flag variance over $25 to Finance with evidence; draft correction entries for approval; post the close summary to Slack.",
      status: "AUTONOMOUS",
      trigger: "SCHEDULE",
      schedule: "0 6 * * 1-5",
      skills: ["browser.ops", "stripe.read", "netsuite.write"],
      policy: {
        approvals: [{ when: "amount > 50", to: email }],
        budgets: { dailyUsd: 200 },
      },
    },
  });

  const felix = await db.agent.upsert({
    where: { workspaceId_slug: { workspaceId, slug: "felix-revops" } },
    update: {},
    create: {
      workspaceId,
      name: "Felix — Lead enrichment",
      slug: "felix-revops",
      category: "sales",
      description:
        "On new signup webhook: research the company, score against ICP rubric v4, enrich the HubSpot record, and route tier-A leads to an AE with a written brief. Escalate ambiguous scores.",
      status: "SHADOW",
      trigger: "WEBHOOK",
      skills: ["browser.ops", "hubspot.write"],
      policy: { approvals: [{ when: "crm_write", to: email }], budgets: { dailyUsd: 50 } },
    },
  });

  // ── Runs, events, approvals ────────────────────────────────────────
  const hasRuns = await db.agentRun.count({ where: { workspaceId } });
  if (hasRuns === 0) {
    const succeeded = await db.agentRun.create({
      data: {
        agentId: mara.id,
        workspaceId,
        mode: "LIVE",
        status: "SUCCEEDED",
        triggerSource: "schedule",
        creditsUsed: 112,
        startedAt: new Date(Date.now() - 26 * 3_600_000),
        finishedAt: new Date(Date.now() - 26 * 3_600_000 + 11 * 60_000),
        events: {
          create: [
            { type: "note", message: "Run started — schedule 0 6 * * 1-5" },
            { type: "api_call", message: "Fetched 214 Stripe payouts" },
            { type: "browser_action", message: "Matched invoices in NetSuite — 211 matched" },
            { type: "note", message: "Run completed · 3 variances drafted" },
          ],
        },
      },
    });

    const needsApproval = await db.agentRun.create({
      data: {
        agentId: mara.id,
        workspaceId,
        mode: "LIVE",
        status: "NEEDS_APPROVAL",
        triggerSource: "schedule",
        creditsUsed: 41,
        startedAt: new Date(Date.now() - 2 * 3_600_000),
        events: {
          create: [
            { type: "note", message: "Run started" },
            { type: "approval", message: "Refund request $78.40 exceeds $50 policy threshold" },
          ],
        },
      },
    });

    await db.approval.create({
      data: {
        runId: needsApproval.id,
        actionType: "issue_refund",
        amountUsd: 78.4,
        detail: { customer: "Acme Industries", invoice: "INV-2081", reason: "duplicate_charge" },
        requestedTo: email,
      },
    });

    await db.agentRun.create({
      data: {
        agentId: felix.id,
        workspaceId,
        mode: "SHADOW",
        status: "SUCCEEDED",
        triggerSource: "webhook",
        creditsUsed: 38,
        startedAt: new Date(Date.now() - 50 * 60_000),
        finishedAt: new Date(Date.now() - 41 * 60_000),
        events: {
          create: [{ type: "note", message: "Shadow run — actions simulated, diff available" }],
        },
      },
    });

    console.info(`Seeded runs (incl. ${succeeded.id}) + pending approval`);
  }

  // ── Knowledge ──────────────────────────────────────────────────────
  const hasKnowledge = await db.knowledgeEntry.count({ where: { workspaceId } });
  if (hasKnowledge === 0) {
    await db.knowledgeEntry.createMany({
      data: [
        {
          workspaceId,
          title: "Refund policy — approval matrix",
          body: "Auto-approve refunds up to $50 within policy. $50–$200 requires Finance (Priya). Above $200 always requires the VP of Finance. Duplicate charges are always refundable regardless of amount — escalate with evidence rather than auto-approving.",
          tags: ["finance", "refunds", "policy"],
          createdById: user.id,
        },
        {
          workspaceId,
          title: "Vendor portal quirks — Northwind",
          body: "Northwind's portal renamed 'Invoices' to 'Billing Center' in May 2026. Session expiry is 10 minutes of idle time. The export button only appears after scrolling the table into view. Mara handles all three; flag any layout change beyond these.",
          tags: ["vendors", "portal", "notes"],
          createdById: user.id,
        },
      ],
    });
  }

  console.info(`Seed complete → ${email} / password123 (dev only)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
