import { test, before, after, type TestContext } from "node:test";
import assert from "node:assert/strict";

/**
 * Integration: Email connections service + draft delivery pipeline against
 * REAL Postgres (local dev DB) and a REAL SMTP sink. Exercises encryption at
 * rest, verification stamping, default exclusivity, the atomic send claim,
 * contact-state side effects and unsubscribe enforcement. Skipped when no DB.
 */

import { PrismaClient } from "@prisma/client";
import {
  createConnection,
  deleteConnection,
  listConnections,
  sendDueDrafts,
  sendDraft,
  updateConnection,
  verifyConnection,
} from "../../lib/email/connections";
import { SmtpSink } from "../helpers/smtp-sink";

let dbAvailable = false;
let prisma: PrismaClient;
let workspaceId = "";
let sink: SmtpSink;
let smtpPort = 0;

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
  if (!process.env.DATABASE_URL || !process.env.AUTH_SECRET) return;
  try {
    prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }
  const stamp = Date.now();
  const ws = await prisma.workspace.create({ data: { name: "Email IT", slug: `email-it-${stamp}` } });
  workspaceId = ws.id;
  sink = new SmtpSink();
  smtpPort = await sink.start();
});

after(async () => {
  if (dbAvailable) {
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
  if (sink) await sink.stop();
});

function connInput(over: Record<string, unknown> = {}) {
  return {
    provider: "SMTP" as const,
    label: "Founder mail",
    senderName: "Ada Lovelace",
    senderEmail: `ada-${Date.now()}${Math.random().toString(36).slice(2, 6)}@acme.test`,
    smtpHost: "127.0.0.1",
    smtpPort,
    smtpSecure: false,
    smtpUsername: "ada",
    password: "correct horse battery",
    region: null,
    isDefault: false,
    ...over,
  };
}

async function seedContact(email: string | null, status: "NEW" | "QUALIFIED" = "NEW") {
  const contact = await prisma.salesContact.create({
    data: { workspaceId, name: "Grace Hopper", email, status },
  });
  return contact;
}

async function seedEmailDraft(contactId: string | null, status: "APPROVED" | "SCHEDULED" = "APPROVED", extra: Record<string, unknown> = {}) {
  return prisma.salesDraft.create({
    data: {
      workspaceId,
      contactId,
      channel: "EMAIL",
      subject: "Following up",
      body: "Hi Grace,\n\nChecking in on the dispatch pilot.",
      status,
      scheduledAt: new Date(Date.now() - 60_000),
      ...extra,
    },
  });
}

itDb("create encrypts the password at rest and never returns it; first connection becomes default", async () => {
  const conn = await createConnection(workspaceId, null, connInput());
  assert.equal(conn.status, "UNVERIFIED");
  assert.equal(conn.isDefault, true, "first connection is the default");
  assert.ok(!("passwordEnc" in conn), "passwordEnc not in projection");

  const raw = await prisma.emailConnection.findUniqueOrThrow({ where: { id: conn.id } });
  assert.ok(raw.passwordEnc && raw.passwordEnc.startsWith("v1."), "encrypted at rest (vault format)");
  assert.ok(!raw.passwordEnc.includes("correct horse"), "no plaintext anywhere in the stored secret");

  const listed = await listConnections(workspaceId);
  assert.ok(listed.every((c) => !("passwordEnc" in c)), "list() is credential-free");
});

itDb("duplicate sender email per workspace conflicts (409-class)", async () => {
  const email = `dupe-${Date.now()}@acme.test`;
  await createConnection(workspaceId, null, connInput({ senderEmail: email }));
  await assert.rejects(
    createConnection(workspaceId, null, connInput({ senderEmail: email })),
    /already connected/
  );
});

itDb("verify runs the SMTP handshake (+ optional test mail) and stamps VERIFIED", async () => {
  const conn = await createConnection(workspaceId, null, connInput({ senderEmail: "verify@acme.test" }));
  const before = sink.messages.length;
  const result = await verifyConnection(workspaceId, null, conn.id, { testTo: "boss@acme.test" });
  assert.equal(result.status, "VERIFIED");

  const stamped = await prisma.emailConnection.findUniqueOrThrow({ where: { id: conn.id } });
  assert.equal(stamped.status, "VERIFIED");
  assert.ok(stamped.lastVerifiedAt);
  assert.equal(sink.messages.length - before, 1, "real test email streamed to the sink");
});

itDb("verify failure stamps FAILED + lastError (honest)", async () => {
  const conn = await createConnection(workspaceId, null, connInput({ senderEmail: "bad@acme.test", smtpPort: 1 }));
  const result = await verifyConnection(workspaceId, null, conn.id);
  assert.equal(result.status, "FAILED");
  assert.ok(result.error);
  const stamped = await prisma.emailConnection.findUniqueOrThrow({ where: { id: conn.id } });
  assert.equal(stamped.status, "FAILED");
  assert.ok(stamped.lastError);
});

itDb("transport edits reset verification; default switching is exclusive", async () => {
  const a = await createConnection(workspaceId, null, connInput({ senderEmail: "a@acme.test" }));
  await verifyConnection(workspaceId, null, a.id);
  const b = await createConnection(workspaceId, null, connInput({ senderEmail: "b@acme.test" }));

  const demoted = await updateConnection(workspaceId, null, a.id, { smtpPort: 2526 });
  assert.equal(demoted.status, "UNVERIFIED", "transport change forces re-verify");

  await updateConnection(workspaceId, null, b.id, { isDefault: true });
  const rows = await listConnections(workspaceId);
  assert.equal(rows.filter((r) => r.isDefault).length, 1, "exactly one default");
  assert.equal(rows.find((r) => r.isDefault)!.id, b.id);
});

itDb("sendDraft: approved draft is delivered, claimed once, stamped SENT; contact advances NEW→CONTACTED", async () => {
  await createConnection(workspaceId, null, connInput({ senderEmail: "send@acme.test", isDefault: true }));
  const contact = await seedContact("grace@bigco.test");
  const draft = await seedEmailDraft(contact.id, "SCHEDULED");

  const result = await sendDraft(workspaceId, null, draft.id);
  assert.equal(result.status, "SENT");
  assert.ok(result.messageId);
  const fresh = await prisma.salesDraft.findUniqueOrThrow({ where: { id: draft.id } });
  assert.equal(fresh.status, "SENT");
  assert.ok(fresh.sentAt && fresh.providerMessageId);
  assert.equal(fresh.sendAttempts, 1);

  const touched = await prisma.salesContact.findUniqueOrThrow({ where: { id: contact.id } });
  assert.equal(touched.status, "CONTACTED");
  assert.ok(touched.lastTouchedAt);

  await assert.rejects(sendDraft(workspaceId, null, draft.id), /already sent/);
});

itDb("sendDraft: engaged contacts are touched, never downgraded", async () => {
  const contact = await seedContact("qualified@bigco.test", "QUALIFIED");
  const draft = await seedEmailDraft(contact.id, "SCHEDULED");
  await sendDraft(workspaceId, null, draft.id);
  const fresh = await prisma.salesContact.findUniqueOrThrow({ where: { id: contact.id } });
  assert.equal(fresh.status, "QUALIFIED");
  assert.ok(fresh.lastTouchedAt);
});

itDb("sendDraft: unsubscribed and email-less contacts can never be mailed", async () => {
  const contact = await seedContact("optout@bigco.test");
  const campaign = await prisma.salesCampaign.create({
    data: { workspaceId, name: "Opt-out guard", status: "ACTIVE" },
  });
  await prisma.salesCampaignEnrollment.create({
    data: { campaignId: campaign.id, contactId: contact.id, status: "UNSUBSCRIBED" },
  });
  const draft = await seedEmailDraft(contact.id, "SCHEDULED");
  await assert.rejects(sendDraft(workspaceId, null, draft.id), /opted out/);

  const noEmail = await seedContact(null);
  const orphan = await seedEmailDraft(noEmail.id, "SCHEDULED");
  await assert.rejects(sendDraft(workspaceId, null, orphan.id), /no email address/);
  await prisma.salesDraft.delete({ where: { id: orphan.id } }); // keep the due-queue clean for the tick test
});

itDb("sendDraft: non-EMAIL channels and unapproved drafts are refused", async () => {
  const contact = await seedContact("chan@bigco.test");
  const linkedin = await prisma.salesDraft.create({
    data: { workspaceId, contactId: contact.id, channel: "LINKEDIN", subject: null, body: "hi", status: "APPROVED" },
  });
  await assert.rejects(sendDraft(workspaceId, null, linkedin.id), /Only EMAIL drafts/);

  const unapproved = await seedEmailDraft(contact.id, "APPROVED", { status: "PENDING_REVIEW" });
  await assert.rejects(sendDraft(workspaceId, null, unapproved.id), /must be approved/);
});

itDb("sendDraft: provider failure reschedules honestly; third strike is terminal FAILED", async () => {
  const contact = await seedContact("retry@bigco.test");
  const draft = await seedEmailDraft(contact.id, "SCHEDULED");
  // Point the default connection at a dead port.
  const dead = await createConnection(workspaceId, null, connInput({ senderEmail: "dead@acme.test", smtpPort: 1, isDefault: true }));

  for (let i = 1; i <= 3; i++) {
    const result = await sendDraft(workspaceId, null, draft.id);
    if (i < 3) {
      assert.equal(result.status, "SCHEDULED", `attempt ${i} reschedules`);
    } else {
      assert.equal(result.status, "FAILED", "third attempt is terminal");
      assert.ok(result.error);
    }
  }
  const fresh = await prisma.salesDraft.findUniqueOrThrow({ where: { id: draft.id } });
  assert.equal(fresh.status, "FAILED");
  assert.equal(fresh.sendAttempts, 3);
  assert.ok(fresh.sendError);
  await deleteConnection(workspaceId, null, dead.id);
});

itDb("sendDueDrafts delivers only due SCHEDULED EMAIL drafts (cron semantics)", async () => {
  // Guarantee a VERIFIED default sender regardless of earlier test edits.
  const conn = await createConnection(workspaceId, null, connInput({ senderEmail: "cron-default@acme.test", isDefault: true }));
  await verifyConnection(workspaceId, null, conn.id);

  const contact = await seedContact("cron@bigco.test");
  const future = await seedEmailDraft(contact.id, "SCHEDULED", { scheduledAt: new Date(Date.now() + 3_600_000) });
  const due = await seedEmailDraft(contact.id, "SCHEDULED");

  const summary = await sendDueDrafts();
  assert.ok(summary.processed >= 1);
  assert.ok(summary.sent >= 1);

  assert.equal((await prisma.salesDraft.findUniqueOrThrow({ where: { id: due.id } })).status, "SENT");
  assert.equal((await prisma.salesDraft.findUniqueOrThrow({ where: { id: future.id } })).status, "SCHEDULED", "future draft untouched");
});

itDb("delete removes the connection; audit trail records lifecycle", async () => {
  const conn = await createConnection(workspaceId, null, connInput({ senderEmail: "bye@acme.test" }));
  await deleteConnection(workspaceId, null, conn.id);
  assert.equal(await prisma.emailConnection.findFirst({ where: { id: conn.id } }), null);

  const audits = await prisma.auditLog.findMany({
    where: { workspaceId, targetType: "email_connection", targetId: conn.id },
  });
  const actions = audits.map((a) => a.action).sort();
  assert.deepEqual(actions, ["sales.email.connection.create", "sales.email.connection.delete"]);
});
