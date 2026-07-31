/**
 * MCUE recovery battery — real-Chromium scenarios:
 *  1 self-healing selectors (id rot → testid discovery)
 *  2 slow-network timeout chain (retry → refresh_retry → fail)
 *  3 JS dialogs (dismiss + accept policies)
 *  4 content-appears-after-refresh (refresh_retry recovers)
 *  5 confirmation-domain approval gate (park → approve → resume)
 *
 *   PLAYWRIGHT_BROWSERS_PATH=/home/user/.browsers DATABASE_URL=... tsx scripts/cue-recovery-test.mts
 */

import http from "node:http";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import {
  BrowserPool, PlaywrightDriver, SessionManager, ExecutionManager, ActionPlanner,
  RecoveryService, PermissionService, InProcessExecutionQueue, InProcessExecutionEmitter,
  ScreenshotService, RecordingService, DownloadService, UploadService,
  HeuristicScanner, buildPrismaRepositories,
} from "../packages/computer-use/index";
import { encryptSecret, decryptSecret } from "../lib/crypto";

let fixture: http.Server;
let fixtureBase = "";
let mutateHits = 0;

async function startFixture(): Promise<void> {
  fixture = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const page = (title: string, body: string) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`);
    };
    if (url.pathname === "/v1") return page("v1", `<button id="save-btn">Save now</button>`);
    // v2: id rotted away, semantics preserved via testid — healing discovers it.
    if (url.pathname === "/v2") return page("v2", `<button id="submit-2" data-testid="save-btn">Save now</button>`);
    if (url.pathname === "/slow") {
      setTimeout(() => page("Slow", `<h1>eventually</h1>`), 2400);
      return;
    }
    if (url.pathname === "/dialog") return page("Dialog", `<button id="alert-btn" onclick="alert('confirm?')">Alert</button>`);
    if (url.pathname === "/mutate") {
      mutateHits++;
      // First load: target absent. After the recovery refresh: present.
      return page("Mutate", mutateHits <= 1 ? `<p>loading…</p>` : `<input id="target-field" placeholder="Now I exist"/>`);
    }
    res.writeHead(404); res.end("nf");
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  fixtureBase = `http://127.0.0.1:${(fixture.address() as { port: number }).port}`;
}

async function main() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL required");
  await startFixture();

  const prisma = new PrismaClient();
  const repos = buildPrismaRepositories(prisma, { seal: encryptSecret, open: decryptSecret });
  const pool = new BrowserPool(new PlaywrightDriver(), { maxProcesses: 2, sweepIntervalMs: 0 });
  const permissions = new PermissionService(repos.policies);
  const planner = new ActionPlanner(permissions);
  const screenshots = new ScreenshotService(repos.binaries, repos.screenshots);
  const recordings = new RecordingService(repos.recordings);
  const downloads = new DownloadService(repos.binaries, repos.downloads, new HeuristicScanner());
  const uploads = new UploadService(repos.binaries, repos.uploads, { write: async () => "/tmp/unused" });
  const sessions = new SessionManager({ pool, sessions: repos.sessions, profiles: repos.profiles, settings: repos.settings, audit: null });
  const emitter = new InProcessExecutionEmitter();
  const executions = new ExecutionManager({
    sessions, executions: repos.executions, events: repos.events, planner,
    recovery: new RecoveryService(), permissions, screenshots, recording: recordings,
    downloads, uploads, emitter,
    approvals: {
      async request({ workspaceId, executionId, reason, detail, actionType }) {
        const approval = await prisma.approval.create({
          data: { workspaceId, actionType, requestedTo: "workspace.manager", detail: { ...detail, executionId, reason } as object, status: "PENDING" },
        });
        return { approvalId: approval.id };
      },
    },
    audit: null,
  });
  const queue = new InProcessExecutionQueue((id) => executions.run(id), 2);
  executions.attachQueue(queue);

  const ws = await prisma.workspace.create({ data: { name: "CUE Recovery IT", slug: `cue-recovery-${Date.now()}` } });
  const workspaceId = ws.id;

  async function runPlan(sessionId: string, steps: Array<{ action: string; args: Record<string, unknown> }>, goal = "recovery test") {
    const row = await executions.start({ workspaceId, sessionId, steps, goal });
    await queue.drain(90_000);
    return (await repos.executions.get(row.id, workspaceId))!;
  }

  try {
    // Fixture host → confirmation rules for scenario 5.
    const fixtureHost = new URL(fixtureBase).hostname;
    const settings = await repos.settings.getSettings(workspaceId);

    // ── 1 · self-healing selector after id rot ───────────────────────────
    const session = await sessions.create({ workspaceId, kind: "EPHEMERAL" });
    const healed = await runPlan(session.id, [
      { action: "navigate", args: { url: fixtureBase + "/v1" } },
      { action: "click", args: { selector: { strategy: "css", value: "#save-btn" } } },
      { action: "navigate", args: { url: fixtureBase + "/v2" } },
      { action: "click", args: { selector: { strategy: "css", value: "#save-btn" } } },
    ], "heal me");
    assert.equal(healed.status, "SUCCEEDED", healed.error ?? "");
    const healEvents = await repos.events.listForExecution(healed.id);
    const healedRow = healEvents.find((e) => e.seq === 4 && e.status === "RECOVERED");
    assert.ok(healedRow, "expected a RECOVERED row for step 4 (healing trail)");
    assert.ok(healedRow.healedFrom, "healedFrom records the rotted selector");
    const healedSpec = (JSON.parse(JSON.stringify(healedRow.args)) as { selector: { primary: { strategy: string } } }).selector;
    assert.equal(healedSpec.primary.strategy, "testid", "healed to the discovered testid spec");
    console.log("PASS 1 selector self-healing (css id rot → testid discovery, RECOVERED)");

    // ── 2 · slow network: retry → refresh_retry → timeout failure ───────
    await repos.settings.saveSettings({ ...settings, actionTimeoutMs: 900 }, "test");
    const timeouts = await runPlan(session.id, [
      { action: "navigate", args: { url: fixtureBase + "/slow", timeoutMs: 900 } },
    ], "slow nav");
    assert.equal(timeouts.status, "FAILED");
    assert.match(timeouts.error ?? "", /timeout/i);
    const timeoutEvents = await repos.events.listForExecution(timeouts.id);
    assert.equal(timeoutEvents.length, 3, "3 attempts expected");
    const strategies = timeoutEvents.map((e) => (e.metadata as { recovery?: string } | null)?.recovery).filter(Boolean);
    assert.ok(strategies.includes("retry") && strategies.includes("refresh_retry"), `recovery trail ${strategies.join(",")}`);
    await repos.settings.saveSettings({ ...settings }, "test"); // restore
    console.log("PASS 2 slow-network timeout chain (retry→refresh_retry→fail, 3 attempts logged)");

    // ── 3 · dialogs: dismiss policy auto-handles alert ──────────────────
    const dialog = await runPlan(session.id, [
      { action: "navigate", args: { url: fixtureBase + "/dialog" } },
      { action: "click", args: { selector: { strategy: "css", value: "#alert-btn" } } },
    ], "dialog dismiss");
    assert.equal(dialog.status, "SUCCEEDED", dialog.error ?? "");
    // accept policy likewise succeeds.
    await repos.settings.saveSettings({ ...settings, dialogPolicy: "accept" }, "test");
    await sessions.close(session.id, workspaceId);
    const session2 = await sessions.create({ workspaceId, kind: "EPHEMERAL" });
    const dialog2 = await runPlan(session2.id, [
      { action: "navigate", args: { url: fixtureBase + "/dialog" } },
      { action: "click", args: { selector: { strategy: "css", value: "#alert-btn" } } },
    ], "dialog accept");
    assert.equal(dialog2.status, "SUCCEEDED", dialog2.error ?? "");
    console.log("PASS 3 dialogs auto-handled under dismiss + accept policies");

    // ── 4 · content appears after refresh (refresh_retry heals state) ────
    mutateHits = 0;
    const mutated = await runPlan(session2.id, [
      { action: "navigate", args: { url: fixtureBase + "/mutate" } },
      { action: "wait_for_selector", args: { selector: { strategy: "css", value: "#target-field" }, timeoutMs: 1500 } },
      { action: "type", args: { selector: { strategy: "css", value: "#target-field" }, text: "recovered" } },
    ], "refresh heals");
    assert.equal(mutated.status, "SUCCEEDED", mutated.error ?? "");
    const mutatedEvents = await repos.events.listForExecution(mutated.id);
    const recoveredWait = mutatedEvents.find((e) => e.seq === 2 && (e.status === "RECOVERED" || e.status === "SUCCEEDED" && e.attempt > 1));
    assert.ok(recoveredWait, "wait_for_selector recovered after refresh_retry");
    console.log("PASS 4 refresh_retry recovered changed-DOM wait");

    // ── 5 · confirmation-domain approval gate (park → approve → resume) ──
    const policy = await repos.policies.getPolicy(workspaceId);
    await repos.policies.savePolicy({ ...policy, confirmationDomains: [fixtureHost] }, "test");
    const gated = await runPlan(session2.id, [
      { action: "navigate", args: { url: fixtureBase + "/v1" } },
      { action: "extract_text", args: { selector: { strategy: "css", value: "button" } } },
    ], "gated nav");
    assert.equal(gated.status, "AWAITING_APPROVAL", gated.error ?? "");
    assert.ok(gated.approvalId, "approval row linked");
    const approval = await prisma.approval.findUnique({ where: { id: gated.approvalId! } });
    assert.ok(approval && approval.status === "PENDING");
    console.log("PASS 5a confirmation domain parked execution for approval");
    await prisma.approval.update({ where: { id: approval.id }, data: { status: "APPROVED", decidedAt: new Date() } });
    await executions.resume(gated.id, workspaceId);
    await queue.drain(60_000);
    const resumed = await repos.executions.get(gated.id, workspaceId);
    assert.equal(resumed?.status, "SUCCEEDED", resumed?.error ?? "");
    const resumedOut = (resumed.result as { outputs: Record<string, { text: string }> }).outputs["2"];
    assert.match(resumedOut.text, /Save now/);
    console.log("PASS 5b approved gate resumed to success", { status: resumed.status });

    // ── 6 · quota: concurrent session cap enforced ───────────────────────
    await repos.settings.saveSettings({ ...settings, maxConcurrentSessions: 1 }, "test");
    await assert.rejects(
      sessions.create({ workspaceId, kind: "EPHEMERAL" }),
      /Concurrent session cap/
    );
    console.log("PASS 6 concurrent-session quota enforced");

    await sessions.close(session2.id, workspaceId);
    console.log("ALL CUE RECOVERY TESTS PASSED");
  } finally {
    await pool.destroyAll().catch(() => {});
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
    fixture.close();
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("CUE RECOVERY TEST FAILED:", err);
  process.exit(1);
});
