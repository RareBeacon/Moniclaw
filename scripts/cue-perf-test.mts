/**
 * MCUE performance benchmark (real Chromium):
 *  • pool process reuse latency (second acquire must be instant)
 *  • context creation + first navigation timing
 *  • end-to-end action loop budgets (navigate/extract/screenshot cycles)
 *
 *   PLAYWRIGHT_BROWSERS_PATH=/home/user/.browsers DATABASE_URL=... tsx scripts/cue-perf-test.mts
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

function ms(t0: bigint) {
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

async function main() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL required");
  const fixture = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><title>Perf</title><h1>perf page</h1><p>${"lorem ipsum ".repeat(200)}</p>`);
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(fixture.address() as { port: number }).port}`;

  const prisma = new PrismaClient();
  const repos = buildPrismaRepositories(prisma, { seal: encryptSecret, open: decryptSecret });
  const pool = new BrowserPool(new PlaywrightDriver(), { maxProcesses: 2, sweepIntervalMs: 0 });
  const permissions = new PermissionService(repos.policies);
  const sessions = new SessionManager({ pool, sessions: repos.sessions, profiles: repos.profiles, settings: repos.settings, audit: null });
  const emitter = new InProcessExecutionEmitter();
  const executions = new ExecutionManager({
    sessions, executions: repos.executions, events: repos.events, planner: new ActionPlanner(permissions),
    recovery: new RecoveryService(), permissions,
    screenshots: new ScreenshotService(repos.binaries, repos.screenshots),
    recording: new RecordingService(repos.recordings),
    downloads: new DownloadService(repos.binaries, repos.downloads, new HeuristicScanner()),
    uploads: new UploadService(repos.binaries, repos.uploads, { write: async () => "/tmp/unused" }),
    emitter, approvals: null, audit: null,
  });
  const queue = new InProcessExecutionQueue((id) => executions.run(id), 2);
  executions.attachQueue(queue);

  const ws = await prisma.workspace.create({ data: { name: "CUE Perf", slug: `cue-perf-${Date.now()}` } });

  try {
    // Cold acquire (process launch) vs warm acquire (pool reuse).
    let t = process.hrtime.bigint();
    const lease1 = await pool.acquire({ browser: "CHROMIUM", headless: true });
    const coldMs = ms(t);
    t = process.hrtime.bigint();
    const lease2 = await pool.acquire({ browser: "CHROMIUM", headless: true });
    const warmMs = ms(t);
    assert.ok(lease2.entryKey === lease1.entryKey, "same pool entry reused");
    assert.ok(warmMs < 500, `warm acquire ${warmMs.toFixed(1)}ms should be < 500ms`);
    console.log(`PASS pool reuse  cold=${coldMs.toFixed(0)}ms warm=${warmMs.toFixed(1)}ms`);

    // Context creation.
    t = process.hrtime.bigint();
    const ctx = await lease1.createContext({});
    const ctxMs = ms(t);
    assert.ok(ctxMs < 3000, `context create ${ctxMs.toFixed(0)}ms`);
    console.log(`PASS context create ${ctxMs.toFixed(0)}ms`);
    lease1.releaseContext(); lease2.releaseContext();
    await ctx.close();

    // Session + pipeline loop.
    const sess = await sessions.create({ workspaceId: ws.id, kind: "EPHEMERAL" });
    const timings: number[] = [];
    for (let i = 0; i < 5; i++) {
      t = process.hrtime.bigint();
      const row = await executions.runInline({
        workspaceId: ws.id, sessionId: sess.id,
        steps: [{ action: "navigate", args: { url: base } }],
      });
      assert.equal(row.status, "SUCCEEDED");
      timings.push(ms(t));
    }
    const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
    console.log(`PASS navigate loop avg=${avg.toFixed(0)}ms over 5 runs (${timings.map((x) => x.toFixed(0)).join(",")})`);
    assert.ok(avg < 5000, `avg navigate ${avg.toFixed(0)}ms should stay < 5s incl. DB writes`);

    // Screenshot budget.
    t = process.hrtime.bigint();
    const shot = await executions.runInline({
      workspaceId: ws.id, sessionId: sess.id,
      steps: [{ action: "take_screenshot", args: { fullPage: false } }],
    });
    assert.equal(shot.status, "SUCCEEDED");
    const shotMs = ms(t);
    console.log(`PASS screenshot capture+persist ${shotMs.toFixed(0)}ms`);
    assert.ok(shotMs < 5000);

    // Extract budget.
    t = process.hrtime.bigint();
    const ext = await executions.runInline({
      workspaceId: ws.id, sessionId: sess.id,
      steps: [{ action: "extract_text", args: {} }],
    });
    assert.equal(ext.status, "SUCCEEDED");
    const extMs = ms(t);
    console.log(`PASS extract_text ${extMs.toFixed(0)}ms`);
    assert.ok(extMs < 3000);

    await sessions.close(sess.id, ws.id);
    console.log("ALL CUE PERF BENCHMARKS PASSED");
  } finally {
    await pool.destroyAll().catch(() => {});
    await prisma.workspace.delete({ where: { id: ws.id } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
    fixture.close();
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("CUE PERF TEST FAILED:", err);
  process.exit(1);
});
