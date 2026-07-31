import { test, before, after, type TestContext } from "node:test";
import assert from "node:assert/strict";

/**
 * Integration tests for the MCUE Prisma repositories against a REAL
 * Postgres database. Skipped per-test when DATABASE_URL is unreachable.
 *
 * Covers: settings/policy upserts, session lifecycle rows, execution +
 * action-event trail, content-addressed binaries, download/upload dedupe,
 * screenshot rows, profile roundtrip with ENCRYPTED storage state.
 */

import { PrismaClient } from "@prisma/client";
import { buildPrismaRepositories, type PrismaRepositories } from "../../packages/computer-use/repositories/prisma";
import type { StorageState } from "../../packages/computer-use/types";

let dbAvailable = false;
let prisma: PrismaClient;
let repos: PrismaRepositories;
let workspaceId = "";

/** Deterministic test cipher (format-compatible envelope, not secret-grade). */
const testBox = {
  seal: (plaintext: string) => `test-v1.${Buffer.from(plaintext, "utf8").toString("base64")}`,
  open: (box: string) => Buffer.from(box.replace(/^test-v1\./, ""), "base64").toString("utf8"),
};

function requireDb(t: TestContext): boolean {
  if (!dbAvailable) {
    t.skip("DATABASE_URL not reachable — skipping integration test.");
    return false;
  }
  return true;
}

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
  const slug = `cue-it-${Date.now()}`;
  const ws = await prisma.workspace.create({ data: { name: "CUE IT", slug } });
  workspaceId = ws.id;
  repos = buildPrismaRepositories(prisma, testBox);
});

after(async () => {
  if (!dbAvailable) return;
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
});

itDb("settings: upsert defaults then save overrides", async () => {
  const defaults = await repos.settings.getSettings(workspaceId);
  assert.equal(defaults.defaultBrowser, "CHROMIUM");
  assert.equal(defaults.maxArtifactMB, 25);
  await repos.settings.saveSettings({ ...defaults, actionTimeoutMs: 42_000, maxArtifactMB: 10 }, "tester");
  const updated = await repos.settings.getSettings(workspaceId);
  assert.equal(updated.actionTimeoutMs, 42_000);
  assert.equal(updated.maxArtifactMB, 10);
});

itDb("policy: defaults then persist domain lists", async () => {
  const defaults = await repos.policies.getPolicy(workspaceId);
  assert.equal(defaults.defaultAllowed, true);
  await repos.policies.savePolicy({ ...defaults, blockedDomains: ["*.evil.com"], confirmationDomains: ["bank.example.com"], allowJavascript: true }, "tester");
  const updated = await repos.policies.getPolicy(workspaceId);
  assert.deepEqual(updated.blockedDomains, ["*.evil.com"]);
  assert.deepEqual(updated.confirmationDomains, ["bank.example.com"]);
  assert.equal(updated.allowJavascript, true);
});

let sessionId = "";

itDb("sessions: create → heartbeat → update → close; idle sweep query", async () => {
  const row = await repos.sessions.create({
    workspaceId, userId: null, profileId: null,
    browser: "CHROMIUM", mode: "HEADLESS", kind: "EPHEMERAL", status: "STARTING",
    endpoint: null, currentUrl: null, currentTitle: null, tabCount: 1, activeTab: 0,
    lastError: null, idleExpiresAt: new Date(Date.now() + 60_000), createdById: null, closedAt: null,
  });
  sessionId = row.id;
  assert.ok(row.id.length > 8);
  await repos.sessions.heartbeat(row.id);
  const active = await repos.sessions.countActive(workspaceId);
  assert.equal(active, 1);
  await repos.sessions.update(row.id, { status: "ACTIVE", currentUrl: "https://example.com", tabCount: 2 });
  const found = await repos.sessions.get(row.id, workspaceId);
  assert.equal(found?.currentUrl, "https://example.com");
  assert.equal(found?.tabCount, 2);
  // Cross-workspace isolation.
  assert.equal(await repos.sessions.get(row.id, "other-ws"), null);
  // Idle sweep finds nothing fresh.
  assert.equal((await repos.sessions.findIdleExpired(new Date(), 10)).length, 0);
  await repos.sessions.close(row.id, { status: "CLOSED" });
  assert.equal(await repos.sessions.countActive(workspaceId), 0);
});

let executionId = "";

itDb("executions: create/update/getUnscoped + action events trail", async () => {
  const row = await repos.executions.create({
    workspaceId, sessionId, goal: "integration run",
    plan: [{ seq: 1, action: "navigate", args: { url: "https://example.com" } }],
    stepCount: 1,
  });
  executionId = row.id;
  assert.equal(row.status, "QUEUED");
  await repos.executions.update(row.id, { status: "RUNNING", startedAt: new Date(), attempts: 1 });
  const event = await repos.events.append({
    executionId: row.id, workspaceId, seq: 1, action: "navigate",
    selector: null, args: { url: "https://example.com" } as never,
    status: "RUNNING", attempt: 1, durationMs: null, error: null,
    screenshotId: null, healedFrom: null, metadata: null,
  });
  await repos.events.update(event.id, { status: "SUCCEEDED", durationMs: 812 });
  const trail = await repos.events.listForExecution(row.id);
  assert.equal(trail.length, 1);
  assert.equal(trail[0].status, "SUCCEEDED");
  assert.equal(trail[0].durationMs, 812);
  const unscoped = await repos.executions.getUnscoped(row.id);
  assert.equal(unscoped?.status, "RUNNING");
  await repos.executions.update(row.id, { status: "SUCCEEDED", result: { outputs: { "1": { url: "https://example.com" } } }, finishedAt: new Date() });
  const final = await repos.executions.get(row.id, workspaceId);
  assert.equal(final?.status, "SUCCEEDED");
  assert.equal((final?.result as { outputs: Record<string, { url: string }> }).outputs["1"].url, "https://example.com");
});

itDb("recording: upsert timeline for the execution", async () => {
  const saved = await repos.recordings.upsert({
    executionId, workspaceId, steps: 1, screenshots: 0, errors: 0, retries: 0, durationMs: 812,
    timeline: [{ seq: 1, action: "navigate", status: "SUCCEEDED", attempt: 1, at: new Date().toISOString(), durationMs: 812, screenshotId: null }],
  });
  assert.equal(saved.steps, 1);
  const again = await repos.recordings.upsert({
    executionId, workspaceId, steps: 2, screenshots: 1, errors: 0, retries: 0, durationMs: 900, timeline: [],
  });
  assert.equal(again.id, saved.id, "upsert keyed on executionId");
  assert.equal(again.steps, 2);
});

itDb("binaries: content-addressed put dedupes identical payloads", async () => {
  const data = Buffer.from(`mcue-binary-${Date.now()}`);
  const a = await repos.binaries.put({ workspaceId, data, mime: "application/octet-stream" });
  const b = await repos.binaries.put({ workspaceId, data, mime: "application/octet-stream" });
  assert.equal(a.id, b.id, "same sha256 → same row");
  const round = await repos.binaries.get(a.id, workspaceId);
  assert.ok(round);
  assert.equal(Buffer.compare(round.data, data), 0);
});

itDb("downloads: ingest-style create, scan update, hash dedupe lookup, delete", async () => {
  const data = Buffer.from(`mcue-dl-${Date.now()}`);
  const binary = await repos.binaries.put({ workspaceId, data, mime: "text/plain" });
  const { createHash } = await import("node:crypto");
  const sha = createHash("sha256").update(data).digest("hex");
  const row = await repos.downloads.create({
    workspaceId, sessionId, executionId: null,
    filename: "note.txt", suggestedName: "note.txt", mime: "text/plain",
    sizeBytes: data.length, sha256: sha, binaryId: binary.id, scanStatus: "PENDING", scanDetail: null,
  });
  await repos.downloads.updateScan(row.id, "CLEAN", "heuristic: ok");
  const byHash = await repos.downloads.findByHash(workspaceId, sha);
  assert.equal(byHash?.id, row.id);
  assert.equal(byHash?.scanStatus, "CLEAN");
  assert.equal(await repos.downloads.delete(row.id, "other-ws"), false);
  assert.equal(await repos.downloads.delete(row.id, workspaceId), true);
});

itDb("uploads: create + incrementUsed + soft delete", async () => {
  const data = Buffer.from(`mcue-up-${Date.now()}`);
  const binary = await repos.binaries.put({ workspaceId, data, mime: "text/plain" });
  const { createHash } = await import("node:crypto");
  const sha = createHash("sha256").update(data).digest("hex");
  const row = await repos.uploads.create({
    workspaceId, uploaderId: null, filename: "attach.txt", mime: "text/plain",
    sizeBytes: data.length, sha256: sha, binaryId: binary.id,
  });
  await repos.uploads.incrementUsed([row.id]);
  await repos.uploads.incrementUsed([row.id]);
  const reloaded = await repos.uploads.get(row.id, workspaceId);
  assert.equal(reloaded?.usedCount, 2);
  assert.equal(await repos.uploads.delete(row.id, workspaceId), true);
  const afterDelete = await repos.uploads.list(workspaceId);
  assert.equal(afterDelete.find((u) => u.id === row.id), undefined, "soft-deleted hidden from list");
});

itDb("profiles: CRUD + encrypted storageState roundtrip (engine sees plaintext only)", async () => {
  const profile = await repos.profiles.create({
    workspaceId, name: "it-profile", description: null, browser: "CHROMIUM",
    userAgent: null, viewport: { width: 1280, height: 800 }, createdById: null,
  });
  const state: StorageState = {
    cookies: [{ name: "session", value: "topsecret", domain: "example.com", path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }],
    origins: [{ origin: "https://example.com", localStorage: [{ name: "token", value: "abc" }] }],
  };
  await repos.profiles.writeStorageState(profile.id, state);
  // Raw column must be ciphertext (not readable JSON).
  const raw = await prisma.browserProfile.findUnique({ where: { id: profile.id } });
  assert.ok(raw, "profile row must exist");
  const enc = raw.storageStateEnc;
  assert.ok(enc, "storageStateEnc must be present after write");
  assert.ok(enc.startsWith("test-v1."), "stored encrypted");
  assert.equal(enc.includes("topsecret"), false, "plaintext must not leak");
  const read = await repos.profiles.readStorageState(profile.id);
  assert.deepEqual(read, state);
  await repos.profiles.clearStorageState(profile.id);
  assert.equal(await repos.profiles.readStorageState(profile.id), null);
  assert.equal(await repos.profiles.softDelete(profile.id, workspaceId), true);
  assert.equal(await repos.profiles.get(profile.id, workspaceId), null, "soft-deleted hidden");
});

itDb("screenshots: row + binary link + delete", async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  const binary = await repos.binaries.put({ workspaceId, data: png, mime: "image/png" });
  const shot = await repos.screenshots.create({
    workspaceId, sessionId, executionId, kind: "STEP", binaryId: binary.id, width: 800, height: 600,
  });
  const listed = await repos.screenshots.list(workspaceId, { executionId });
  assert.ok(listed.some((s) => s.id === shot.id));
  assert.equal(await repos.screenshots.delete(shot.id, workspaceId), true);
});
