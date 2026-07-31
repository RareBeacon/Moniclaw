/**
 * MCUE security battery (engine level):
 *  1 readOnly tier denies interact, allows extraction
 *  2 navigationOnly tier denies input
 *  3 blocked domains rejected at plan time (before any browser runs)
 *  4 uploads/downloads feature gates
 *  5 artifact size caps (uploads / screenshots)
 *  6 cross-workspace repository isolation
 *  7 storage state never leaks plaintext (encrypted profile column)
 *  8 execute_javascript denied by default policy
 *
 *   DATABASE_URL=... tsx scripts/cue-security-test.mts
 */

import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import {
  ActionPlanner, PermissionService, DownloadService, UploadService,
  HeuristicScanner, buildPrismaRepositories, CueError,
} from "../packages/computer-use/index";
import { encryptSecret, decryptSecret } from "../lib/crypto";

async function main() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL required");
  const prisma = new PrismaClient();
  const repos = buildPrismaRepositories(prisma, { seal: encryptSecret, open: decryptSecret });
  const permissions = new PermissionService(repos.policies);
  const planner = new ActionPlanner(permissions);

  const wsA = await prisma.workspace.create({ data: { name: "SEC-A", slug: `sec-a-${Date.now()}` } });
  const wsB = await prisma.workspace.create({ data: { name: "SEC-B", slug: `sec-b-${Date.now()}` } });

  try {
    // ── 1 · readOnly tier ────────────────────────────────────────────────
    const p0 = await repos.policies.getPolicy(wsA.id);
    await repos.policies.savePolicy({ ...p0, readOnly: true }, "test");
    const extraction = await planner.plan(wsA.id, [{ action: "extract_text", args: {} }]);
    assert.equal(extraction.steps.length, 1);
    await assert.rejects(
      planner.plan(wsA.id, [{ action: "click", args: { selector: { strategy: "css", value: "#a" } } }]),
      (err) => err instanceof CueError && err.kind === "policy_denied"
    );
    console.log("PASS 1 readOnly allows extraction, denies interact");

    // ── 2 · navigationOnly tier ──────────────────────────────────────────
    await repos.policies.savePolicy({ ...p0, navigationOnly: true }, "test");
    const nav = await planner.plan(wsA.id, [{ action: "navigate", args: { url: "https://example.com" } }]);
    assert.equal(nav.steps.length, 1);
    await assert.rejects(
      planner.plan(wsA.id, [{ action: "type", args: { selector: { strategy: "css", value: "#a" }, text: "x" } }]),
      (err) => err instanceof CueError && err.kind === "policy_denied"
    );
    console.log("PASS 2 navigationOnly allows navigate, denies input");

    // ── 3 · blocked domain rejected at plan time ─────────────────────────
    await repos.policies.savePolicy({ ...p0, blockedDomains: ["*.evil.com"], defaultAllowed: false, allowedDomains: ["example.com"] }, "test");
    await assert.rejects(
      planner.plan(wsA.id, [{ action: "navigate", args: { url: "https://phish.evil.com/login" } }]),
      (err) => err instanceof CueError && err.kind === "policy_denied"
    );
    await assert.rejects(
      planner.plan(wsA.id, [{ action: "navigate", args: { url: "https://unlisted.io" } }]),
      (err) => err instanceof CueError && err.kind === "policy_denied",
      "default-deny catches unlisted"
    );
    const allowed = await planner.plan(wsA.id, [{ action: "navigate", args: { url: "https://example.com" } }]);
    assert.equal(allowed.gates.length, 0);
    console.log("PASS 3 domain safety: blocked + default-deny both reject at plan time");

    // ── 4 · downloads/uploads gates ──────────────────────────────────────
    await repos.policies.savePolicy({ ...p0, allowDownloads: false, allowUploads: false }, "test");
    await assert.rejects(
      planner.plan(wsA.id, [{ action: "download_file", args: { url: "https://example.com/f.bin" } }]),
      (err) => err instanceof CueError && err.kind === "policy_denied"
    );
    await assert.rejects(
      planner.plan(wsA.id, [{ action: "upload_file", args: { selector: { strategy: "css", value: "input[type=file]" }, uploadIds: ["7b2a5d4f-43e0-4b46-9e26-4bfbfe9c0b12"] } }]),
      (err) => err instanceof CueError && err.kind === "policy_denied"
    );
    console.log("PASS 4 download/upload feature gates deny at plan time");

    // ── 5 · artifact caps ────────────────────────────────────────────────
    const uploads = new UploadService(repos.binaries, repos.uploads, { write: async () => "/tmp/unused" });
    await assert.rejects(
      uploads.store({ workspaceId: wsA.id, filename: "big.bin", mime: "application/octet-stream", data: Buffer.alloc(2 * 1024 * 1024, 7), maxBytes: 1024 * 1024 }),
      (err) => err instanceof CueError && err.kind === "artifact_too_large"
    );
    const downloads = new DownloadService(repos.binaries, repos.downloads, new HeuristicScanner());
    await assert.rejects(
      downloads.ingest({ workspaceId: wsA.id, suggestedFilename: "big.bin", mime: "application/octet-stream", data: Buffer.alloc(2 * 1024 * 1024, 7), maxBytes: 1024 * 1024 }),
      (err) => err instanceof CueError && err.kind === "artifact_too_large"
    );
    // dangerous payload held by scanner
    const held = await downloads.ingest({
      workspaceId: wsA.id, suggestedFilename: "evil.exe", mime: "application/x-msdownload",
      data: Buffer.from("MZ-fake"), maxBytes: 1024 * 1024,
    });
    assert.equal(held.row.scanStatus, "HELD");
    console.log("PASS 5 artifact caps enforced + executable download HELD by scanner");

    // ── 6 · cross-workspace isolation ────────────────────────────────────
    const session = await repos.sessions.create({
      workspaceId: wsA.id, userId: null, profileId: null, browser: "CHROMIUM", mode: "HEADLESS",
      kind: "EPHEMERAL", status: "ACTIVE", endpoint: "local", currentUrl: null, currentTitle: null,
      tabCount: 1, activeTab: 0, lastError: null, idleExpiresAt: null, createdById: null, closedAt: null,
    });
    assert.equal(await repos.sessions.get(session.id, wsB.id), null);
    assert.equal((await repos.downloads.list(wsB.id)).length, 0, "wsB sees none of wsA downloads");
    console.log("PASS 6 cross-workspace rows unreadable");

    // ── 7 · profile storage state encrypted at rest ──────────────────────
    const profile = await repos.profiles.create({
      workspaceId: wsA.id, name: "sec", description: null, browser: "CHROMIUM", userAgent: null, viewport: null, createdById: null,
    });
    await repos.profiles.writeStorageState(profile.id, {
      cookies: [{ name: "auth", value: "SUPER_SECRET_TOKEN", domain: "example.com", path: "/" }],
      origins: [],
    });
    const raw = await prisma.browserProfile.findUnique({ where: { id: profile.id } });
    assert.ok(raw?.storageStateEnc);
    assert.equal(raw.storageStateEnc.includes("SUPER_SECRET_TOKEN"), false);
    const read = await repos.profiles.readStorageState(profile.id);
    assert.equal(read?.cookies[0].value, "SUPER_SECRET_TOKEN");
    console.log("PASS 7 storage state AES-256-GCM at rest, plaintext roundtrip via service");

    // ── 8 · execute_javascript default-denied ────────────────────────────
    await repos.policies.savePolicy({ ...p0 }, "test"); // factory defaults: allowJavascript=false
    await assert.rejects(
      planner.plan(wsA.id, [{ action: "execute_javascript", args: { script: "return 1" } }]),
      (err) => err instanceof CueError && err.kind === "policy_denied"
    );
    console.log("PASS 8 execute_javascript requires explicit policy opt-in");

    console.log("ALL CUE SECURITY TESTS PASSED");
  } finally {
    await prisma.workspace.delete({ where: { id: wsA.id } }).catch(() => {});
    await prisma.workspace.delete({ where: { id: wsB.id } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("CUE SECURITY TEST FAILED:", err);
  process.exit(1);
});
