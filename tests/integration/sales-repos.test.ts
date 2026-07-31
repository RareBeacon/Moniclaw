import { test, before, after, type TestContext } from "node:test";
import assert from "node:assert/strict";

/**
 * Integration tests for the Sales Runtime Prisma repositories + CRM service
 * against a REAL Postgres database. Skipped per-test when unreachable.
 *
 * Covers: unique-domain dedupe, search filters (tags/minPriority/open deal),
 * soft delete, contacts email uniqueness + listByCompany + touch scoring
 * side-effects, default-pipeline idempotency, deal close analytics,
 * activities, campaign steps/enrollment dedupe/due listing/cap counting,
 * drafts lifecycle, saved searches rollup, workspace isolation.
 */

import { PrismaClient } from "@prisma/client";
import { buildSalesRepositories } from "../../packages/sales-runtime/repositories/prisma";
import { SalesCrmService } from "../../packages/sales-runtime/crm/service";
import type { SalesRepositories } from "../../packages/sales-runtime/ports";
import { icpProfileSchema } from "../../packages/sales-runtime/types";

let dbAvailable = false;
let prisma: PrismaClient;
let workspaceId = "";
let otherWorkspaceId = "";
let repos: SalesRepositories;
let crm: SalesCrmService;

function itDb(name: string, fn: (t: TestContext) => Promise<void>): void {
  test(name, async (t) => {
    if (!dbAvailable) {
      t.skip("DATABASE_URL not reachable — skipping integration test.");
      return;
    }
    await fn(t);
  });
}

before(async () => {
  if (!process.env.DATABASE_URL) return;
  try {
    prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }
  const stamp = Date.now();
  const ws = await prisma.workspace.create({ data: { name: "Sales IT", slug: `sales-it-${stamp}` } });
  const other = await prisma.workspace.create({ data: { name: "Other", slug: `sales-it-other-${stamp}` } });
  workspaceId = ws.id;
  otherWorkspaceId = other.id;
  repos = buildSalesRepositories(prisma);
  crm = new SalesCrmService({ repos, audit: { log: async () => {} } });
});

after(async () => {
  if (!dbAvailable) return;
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.workspace.delete({ where: { id: otherWorkspaceId } }).catch(() => {});
  await prisma.$disconnect();
});

// ── Companies ──────────────────────────────────────────────────────────────

itDb("company create → dedupe by normalized domain → 409 on clash", async () => {
  const acme = await crm.createCompany(workspaceId, null, {
    name: "Acme Freight", domain: "https://www.ACME.com/about", tags: ["tier-1"],
    industry: "Logistics", size: "51-200", geography: "Nigeria", techStack: [],
  });
  assert.equal(acme.domain, "acme.com");

  await assert.rejects(
    crm.createCompany(workspaceId, null, { name: "Copy", domain: "acme.com", tags: [], techStack: [] }),
    /already exists/
  );

  const other = await crm.createCompany(otherWorkspaceId, null, { name: "Acme Elsewhere", domain: "acme.com", tags: [], techStack: [] });
  assert.ok(other.id, "same domain legal in another workspace");
});

itDb("company search filters: query, tags, minPriority, hasOpenDeal", async () => {
  const list = await repos.companies.list(workspaceId, { query: "acme", take: 50 });
  assert.ok(list.some((c) => c.domain === "acme.com"));

  const tagged = await repos.companies.list(workspaceId, { tags: ["tier-1"], take: 50 });
  assert.ok(tagged.every((c) => c.tags.includes("tier-1")));

  const acme = (await repos.companies.list(workspaceId, { query: "acme", take: 1 }))[0];
  const highPri = await repos.companies.list(workspaceId, { minPriority: acme.priorityScore, take: 50 });
  assert.ok(highPri.every((c) => c.priorityScore >= acme.priorityScore));

  // Attach an open deal → hasOpenDeal filter flips on
  await prisma.salesDeal.create({
    data: {
      workspaceId, companyId: acme.id, pipelineId: (await repos.pipelines.ensureDefault(workspaceId)).id,
      stageId: (await repos.pipelines.ensureDefault(workspaceId)).stages[0].id,
      title: "Acme Q3", status: "OPEN",
    },
  });
  const withDeal = await repos.companies.list(workspaceId, { hasOpenDeal: true, take: 50 });
  assert.ok(withDeal.some((c) => c.id === acme.id));
  await prisma.salesDeal.deleteMany({ where: { companyId: acme.id, workspaceId } });
});

itDb("scoring: createCompany computes fit/priority with persisted reasons; ICP overlay via rescore", async () => {
  const c = await crm.createCompany(workspaceId, null, {
    name: "Scored Co", domain: "scored.example.com", industry: "Logistics",
    geography: "Nigeria", tags: [], techStack: ["react", "postgres"],
  });
  const row = (await repos.companies.get(workspaceId, c.id))!;
  assert.ok(row.fitScore > 0);
  assert.equal(row.icpFit, null, "no ICP configured → not judged");
  const reasons = row.scoreReasons as { fit: string[]; priority: string[] };
  assert.ok(Array.isArray(reasons.fit) && reasons.fit.length > 0);

  await crm.rescoreCompany(workspaceId, c.id, icpProfileSchema.parse({
    industries: ["logistics"], sizes: [], geographies: ["nigeria"], keywords: [],
    roles: [],
  }));
  const after = (await repos.companies.get(workspaceId, c.id))!;
  assert.ok((after.icpFit ?? 0) >= 90, `icpFit ${after.icpFit}`);
});

itDb("soft delete removes from default lists but other tenant untouched", async () => {
  const mine = await repos.companies.list(workspaceId, { query: "acme", take: 50 });
  assert.ok(mine.some((c) => c.name === "Acme Freight"));
  const target = mine.find((c) => c.name === "Acme Freight")!;
  await crm.deleteCompany(workspaceId, null, target.id);
  const afterList = await repos.companies.list(workspaceId, { query: "acme", take: 50 });
  assert.ok(!afterList.some((c) => c.id === target.id));
  const other = await repos.companies.list(otherWorkspaceId, { query: "acme", take: 50 });
  assert.ok(other.some((c) => c.name === "Acme Elsewhere"));
});

// ── Contacts ───────────────────────────────────────────────────────────────

itDb("contacts: email dedupe cross-tenant isolation + listByCompany + status transitions", async () => {
  const company = (await repos.companies.list(workspaceId, { query: "scored", take: 1 }))[0];
  const ada = await crm.createContact(workspaceId, null, {
    name: "Ada Okafor", companyId: company.id, email: "ADA@Acme.com", title: "VP Ops", source: "MANUAL", tags: [],
  });
  assert.equal(ada.email, "ada@acme.com", "emails normalized lowercase");

  await assert.rejects(
    crm.createContact(workspaceId, null, { name: "Dupe", email: "ada@acme.com", source: "MANUAL", tags: [] }),
    /already exists/
  );
  const other = await crm.createContact(otherWorkspaceId, null, { name: "Ada Elsewhere", email: "ada@acme.com", source: "MANUAL", tags: [] });
  assert.ok(other.id);

  const qualified = await crm.qualifyContact(workspaceId, null, ada.id);
  assert.equal(qualified.status, "QUALIFIED");

  const byCompany = await repos.contacts.listByCompany(workspaceId, company.id);
  assert.ok(byCompany.some((c) => c.id === ada.id));

  await repos.contacts.touch(ada.id, new Date());
  const touched = (await repos.contacts.get(workspaceId, ada.id))!;
  assert.ok(touched.lastTouchedAt !== null);
});

// ── Pipelines & deals ─────────────────────────────────────────────────────

itDb("ensureDefault is idempotent with ordered standard stages", async () => {
  const a = await repos.pipelines.ensureDefault(workspaceId);
  const b = await repos.pipelines.ensureDefault(workspaceId);
  assert.equal(a.id, b.id);
  assert.deepEqual(a.stages.map((s) => s.name), ["Prospecting", "Qualified", "Proposal", "Negotiation"]);
  assert.ok(a.stages.every((s, i) => s.order === i + 1));
});

itDb("deal lifecycle: default pipeline resolution → move → close WON → analytics", async () => {
  const company = (await repos.companies.list(workspaceId, { query: "scored", take: 1 }))[0];
  const deal = await crm.createDeal(workspaceId, null, {
    companyId: company.id, title: "Scored Co expansion", valueUsd: 120_000, currency: "USD",
  });
  const pipeline = await repos.pipelines.ensureDefault(workspaceId);
  assert.equal(deal.stageId, pipeline.stages[0].id);

  const moved = await crm.moveDealStage(workspaceId, null, deal.id, pipeline.stages[2].id);
  assert.equal(moved.stageId, pipeline.stages[2].id);

  const closed = await crm.closeDeal(workspaceId, null, deal.id, "WON");
  assert.equal(closed.status, "WON");
  assert.ok(closed.closedAt !== null);

  await assert.rejects(
    crm.moveDealStage(workspaceId, null, deal.id, pipeline.stages[1].id),
    /closed deals cannot move/
  );

  const roll = await repos.deals.analytics(workspaceId);
  assert.equal(roll.wonCount30d, 1);
  assert.equal(roll.wonValueUsd30d, 120_000);

  await assert.rejects(crm.closeDeal(workspaceId, null, deal.id, "LOST"), /already/);
});

// ── Activities ────────────────────────────────────────────────────────────

itDb("activities attach to entities, complete idempotently, roll up", async () => {
  const company = (await repos.companies.list(workspaceId, { query: "scored", take: 1 }))[0];
  const activity = await crm.logActivity(workspaceId, null, {
    type: "TASK", subject: "Send proposal deck", dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    companyId: company.id,
  });
  const open = await repos.activities.list(workspaceId, { companyId: company.id, openOnly: true });
  assert.ok(open.some((a) => a.id === activity.id));

  await crm.completeActivity(workspaceId, null, activity.id);
  await crm.completeActivity(workspaceId, null, activity.id); // idempotent
  const after = await repos.activities.list(workspaceId, { companyId: company.id, openOnly: true });
  assert.ok(!after.some((a) => a.id === activity.id));

  const roll = await repos.activities.analytics(workspaceId);
  assert.ok(roll.completed30d >= 1);
});

// ── Campaigns + drafts ────────────────────────────────────────────────────

itDb("campaign steps replace, enroll dedupes, due listing + draft cap count", async () => {
  const campaign = await repos.campaigns.create(workspaceId, {
    name: "IT Campaign", status: "ACTIVE", dailyCap: 1, sendWindow: {},
    createdById: null,
  });
  await repos.campaigns.replaceSteps(campaign.id, [
    { order: 1, kind: "DRAFT_EMAIL", subject: "hi", bodyTemplate: "body", delayValue: 1, delayUnit: "DAYS", condition: {} },
    { order: 2, kind: "WAIT", delayValue: 2, delayUnit: "DAYS", condition: {} },
  ]);
  const steps = await repos.campaigns.listSteps(campaign.id);
  assert.equal(steps.length, 2);
  assert.deepEqual(steps.map((s) => s.kind), ["DRAFT_EMAIL", "WAIT"]);

  const contact = (await repos.contacts.list(workspaceId, { query: "ada", take: 1 }))[0];
  const now = new Date();
  const first = await repos.campaigns.enroll(campaign.id, contact.id, contact.companyId, now);
  assert.equal(first.created, true);
  const dupe = await repos.campaigns.enroll(campaign.id, contact.id, contact.companyId, now);
  assert.equal(dupe.created, false);
  assert.equal(dupe.enrollment.id, first.enrollment.id);

  const due = await repos.campaigns.listDueEnrollments(new Date(now.getTime() + 1000));
  assert.ok(due.some((e) => e.id === first.enrollment.id));
  assert.equal(due.find((e) => e.id === first.enrollment.id)?.campaign.name, "IT Campaign");

  await repos.drafts.create(workspaceId, {
    contactId: contact.id, campaignEnrollmentId: first.enrollment.id, channel: "EMAIL",
    body: "Hello Ada — great stuff Acme is doing.", status: "PENDING_REVIEW",
  });
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const count = await repos.campaigns.countDraftsSince(campaign.id, today);
  assert.equal(count, 1, "cap counter sees the today's draft");
});

itDb("draft lifecycle + rollups + approval link", async () => {
  const contact = (await repos.contacts.list(workspaceId, { query: "ada", take: 1 }))[0];
  const approval = await prisma.approval.create({
    data: {
      workspaceId, actionType: "sales.draft.review", requestedTo: "workspace.manager",
      detail: {}, status: "PENDING",
    },
  });
  const draft = await repos.drafts.create(workspaceId, {
    contactId: contact.id, channel: "EMAIL", subject: "s", body: "b".repeat(20),
    status: "PENDING_REVIEW", approvalId: approval.id,
  });
  const linked = await prisma.salesDraft.findUniqueOrThrow({ where: { id: draft.id }, include: { approval: true } });
  assert.equal(linked.approval?.actionType, "sales.draft.review", "draft bridges the Approval table");

  await repos.drafts.setStatus(draft.id, "APPROVED");
  await repos.drafts.setStatus(draft.id, "SCHEDULED", { scheduledAt: new Date() });
  await repos.drafts.setStatus(draft.id, "SENT", { sentAt: new Date(), deliveryStatus: "DELIVERED" });
  const row = (await repos.drafts.get(workspaceId, draft.id))!;
  assert.equal(row.status, "SENT");
  assert.equal(row.deliveryStatus, "DELIVERED");

  const roll = await repos.drafts.analytics(workspaceId);
  assert.ok((roll.byStatus["SENT"] ?? 0) >= 1);
  await prisma.salesDraft.delete({ where: { id: draft.id } });
  await prisma.approval.delete({ where: { id: approval.id } });
});

// ── Saved searches ────────────────────────────────────────────────────────

itDb("saved searches upsert + list + delete", async () => {
  await repos.searches.upsert(workspaceId, "Hot tier-1", "companies", { tags: ["tier-1"], minPriority: 60 }, null);
  await repos.searches.upsert(workspaceId, "Hot tier-1", "companies", { tags: ["tier-1"], minPriority: 70 }, null);
  const list = await repos.searches.list(workspaceId, "companies");
  const named = list.filter((s) => s.name === "Hot tier-1");
  assert.equal(named.length, 1, "upsert not duplicate");
  assert.deepEqual(named[0].filters, { tags: ["tier-1"], minPriority: 70 });
  await repos.searches.delete(workspaceId, named[0].id);
  assert.equal((await repos.searches.list(workspaceId)).filter((s) => s.name === "Hot tier-1").length, 0);
});

// ── Workspace isolation ───────────────────────────────────────────────────

itDb("every repository read is workspace-scoped", async () => {
  const mine = await repos.companies.get(otherWorkspaceId, (await repos.companies.list(workspaceId, { take: 1 }))[0].id);
  assert.equal(mine, null, "cross-tenant get returns null");
  const wonRoll = await repos.deals.analytics(otherWorkspaceId);
  assert.equal(wonRoll.wonCount30d, 0);
});
