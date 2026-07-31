import { test, before, after, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Integration tests for the AI runtime repositories against a REAL
 * Postgres + pgvector database. Skipped per-test when DATABASE_URL is not
 * reachable (e.g. CI without services) — unit suites cover everything else.
 */

import { PrismaClient } from "@prisma/client";
import { MemoryService } from "../../packages/ai-runtime/memory/service";
import { KnowledgeService } from "../../packages/ai-runtime/knowledge/service";
import { UsageTracker } from "../../packages/ai-runtime/usage/tracker";

let dbAvailable = false;
let prisma: PrismaClient;
let memory: MemoryService;
let knowledge: KnowledgeService;
let usage: UsageTracker;
let workspaceId = "";

const LIMITS = { maxDocuments: 5, maxFileBytes: 5 * 1024 * 1024, maxChunksPerDoc: 500 };

function requireDb(t: TestContext): boolean {
  if (!dbAvailable) {
    t.skip("DATABASE_URL not reachable — skipping integration test.");
    return false;
  }
  return true;
}

/** Options bag with the skip guard pre-applied. */
function itDb(name: string, fn: (t: TestContext) => Promise<void>): void {
  test(name, async (t) => {
    if (!requireDb(t)) return;
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
  memory = new MemoryService(prisma);
  knowledge = new KnowledgeService(prisma, () => null); // no embedder → no-embedding paths
  usage = new UsageTracker(prisma);
  const ws = await prisma.workspace.create({
    data: { name: "Runtime Integration Tests", slug: `it-${randomUUID().slice(0, 8)}` },
  });
  workspaceId = ws.id;
});

after(async () => {
  if (!dbAvailable) return;
  await prisma.workspace.delete({ where: { id: workspaceId } }); // cascades
  await prisma.$disconnect();
});

// ── Memory engine ────────────────────────────────────────────────────────

itDb("memory remember + recall (fallback ordering by importance)", async () => {
  await memory.remember({ workspaceId, scope: "WORKSPACE", content: "low priority fact", importance: 10 });
  await memory.remember({ workspaceId, scope: "WORKSPACE", content: "high priority fact", importance: 90 });
  const items = await memory.recall({ workspaceId, scopes: ["WORKSPACE"], limit: 5 });
  assert.equal(items.length >= 2, true);
  assert.equal(items[0]!.content, "high priority fact");
  assert.equal(items[0]!.similarity, 0); // no embedding path
});

itDb("memory semantic recall ranks by vector similarity + weights", async () => {
  const similar = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0));
  const different = Array.from({ length: 768 }, (_, i) => (i === 1 ? 1 : 0));
  await memory.remember({
    workspaceId,
    scope: "LONG_TERM",
    content: "closely related memory",
    importance: 80,
    embedding: similar,
  });
  await memory.remember({
    workspaceId,
    scope: "LONG_TERM",
    content: "orthogonal memory",
    importance: 80,
    embedding: different,
  });

  const items = await memory.recall({
    workspaceId,
    queryEmbedding: similar,
    scopes: ["LONG_TERM"],
    limit: 2,
  });
  assert.equal(items.length >= 2, true);
  assert.equal(items[0]!.content, "closely related memory");
  assert.ok(items[0]!.similarity > items[1]!.similarity);
  assert.ok(items[0]!.score > items[1]!.score);
});

itDb("memory expiration: expired rows are hidden and swept", async () => {
  await memory.remember({
    workspaceId,
    scope: "WORKSPACE",
    content: "already expired",
    expiresAt: new Date(Date.now() - 60_000),
  });
  const items = await memory.recall({ workspaceId, scopes: ["WORKSPACE"], limit: 50 });
  assert.equal(items.some((i) => i.content === "already expired"), false);
  const swept = await memory.sweepExpired(workspaceId);
  assert.ok(swept >= 1);
});

itDb("memory compression folds conversation records into long-term", async () => {
  const key = "thread-it-1";
  for (const [i, text] of ["first note", "second note", "third note"].entries()) {
    await memory.remember({
      workspaceId,
      scope: "CONVERSATION",
      content: `${text} ${i}`,
      conversationKey: key,
    });
  }
  const promoted = await memory.compress({
    workspaceId,
    conversationKey: key,
    summary: "folded conversation summary",
    keepRecent: 1,
  });
  assert.equal(promoted.scope, "LONG_TERM");
  const remaining = await memory.recall({
    workspaceId,
    scopes: ["CONVERSATION"],
    conversationKey: key,
    limit: 10,
  });
  assert.equal(remaining.length, 1);
  assert.match(remaining[0]!.content, /third note/);
});

itDb("memory cap purge trims lowest-importance records first", async () => {
  const beforeCount = (await memory.recall({ workspaceId, limit: 100 })).length;
  assert.ok(beforeCount >= 2);
  const purged = await memory.purgeBeyondLimit(workspaceId, 2);
  assert.ok(purged >= 1);
  const afterItems = await memory.recall({ workspaceId, limit: 100 });
  assert.equal(afterItems.length, 2);
  // The most important memory survives the purge.
  assert.equal(afterItems[0]!.content, "high priority fact");
});

// ── Knowledge base ───────────────────────────────────────────────────────

itDb("knowledge ingestFile extracts, chunks, and dedupes by checksum", async () => {
  const md = [
    "# Refund Policy",
    "",
    "Refunds above the manager threshold require dual sign-off from finance.",
    "",
    "Standard refunds clear within five business days through the original rail.",
    "",
    "Chargebacks must be answered inside 72 hours with the full dispute bundle.",
  ].join("\n");
  const buffer = Buffer.from(md, "utf8");

  const doc = await knowledge.ingestFile({
    workspaceId,
    filename: "refund-policy.md",
    buffer,
    limits: LIMITS,
  });
  assert.equal(doc.status, "READY");
  assert.ok(doc.chunkCount >= 1);

  const dup = await knowledge.ingestFile({
    workspaceId,
    filename: "refund-policy-copy.md",
    buffer,
    limits: LIMITS,
  });
  assert.equal(dup.id, doc.id); // content checksum dedupe

  const chunks = await knowledge.getChunks(doc.id, workspaceId);
  assert.equal(chunks.length, doc.chunkCount);
  assert.ok(chunks.some((c) => c.content.includes("dual sign-off")));
});

itDb("knowledge ingest honors quotas and file size limits", async () => {
  await assert.rejects(
    () =>
      knowledge.ingestFile({
        workspaceId,
        filename: "too-big.txt",
        buffer: Buffer.alloc(64),
        limits: { ...LIMITS, maxFileBytes: 8 },
      }),
    /limit/
  );
});

itDb("knowledge search without an embedder returns empty, not an error", async () => {
  const hits = await knowledge.search({ workspaceId, query: "refunds" });
  assert.deepEqual(hits, []);
});

// ── Usage tracking ───────────────────────────────────────────────────────

itDb("usage record + summarize round-trip in the database", async () => {
  await usage.record({
    workspaceId,
    kind: "CHAT",
    status: "OK",
    provider: "gemini",
    model: "gemini-2.5-flash",
    usage: { promptTokens: 11, completionTokens: 7, totalTokens: 18, latencyMs: 42, costMicros: 0 },
  });
  await usage.record({
    workspaceId,
    kind: "CHAT",
    status: "ERROR",
    provider: "openrouter",
    model: "free-model",
    errorCode: "rate_limit",
  });
  const summary = await usage.summarize(workspaceId, 1);
  assert.equal(summary.requests >= 2, true);
  assert.equal(summary.totalTokens >= 18, true);
  assert.ok(summary.byProvider.some((p) => p.provider === "gemini"));
  assert.deepEqual(summary.topErrors.some((e) => e.code === "rate_limit"), true);
});
