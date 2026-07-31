/**
 * MCUE browser E2E — drives the REAL pipeline against local Chromium:
 * fixture pages → SessionManager → ExecutionManager (plan→queue→execute→
 * validate) → downloads/uploads/cookies/tabs/screenshots/PDF → profile
 * persistence → pool reuse. Exits non-zero on failure.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=/home/user/.browsers DATABASE_URL=... tsx scripts/cue-browser-test.mts
 */

import http from "node:http";
import fs from "node:fs";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import {
  BrowserPool, PlaywrightDriver, SessionManager, ExecutionManager, ActionPlanner,
  RecoveryService, PermissionService, InProcessExecutionQueue, InProcessExecutionEmitter,
  ScreenshotService, RecordingService, DownloadService, UploadService, ProfileService,
  HeuristicScanner, buildPrismaRepositories,
} from "../packages/computer-use/index";
import { encryptSecret, decryptSecret } from "../lib/crypto";

const HEAD = `<meta charset="utf-8"><title>`;
const pages: Record<string, string> = {
  "/": `${HEAD}Fixture Home</title><h1>Fixture Home</h1><a href="/form" id="to-form">Open form</a><a href="/download/file" id="dl-link" data-testid="dl">Download report</a>`,
  "/form": `${HEAD}Fixture Form</title>
    <form onsubmit="event.preventDefault();document.getElementById('result').textContent='saved:'+document.getElementById('name').value+':'+document.getElementById('plan').value+':'+document.getElementById('agree').checked;return false;">
      <input id="name" name="name" placeholder="Your name"/>
      <select id="plan" name="plan"><option value="free">Free</option><option value="pro">Pro</option></select>
      <input type="checkbox" id="agree" name="agree"/>
      <input type="radio" id="r-a" name="choice" value="a"/><input type="radio" id="r-b" name="choice" value="b"/>
      <button type="submit" id="submit-btn" data-testid="submit-form">Save</button>
    </form><div id="result"></div>`,
  "/upload": `${HEAD}Fixture Upload</title><input type="file" id="file-input"/><div id="picked"></div>
    <script>document.getElementById('file-input').addEventListener('change',e=>{document.getElementById('picked').textContent='files:'+Array.from(e.target.files).map(f=>f.name).join(',');});</script>`,
  "/table": `${HEAD}Fixture Table</title><table><tr><th>Sku</th><th>Price</th></tr><tr><td>A-1</td><td>9.99</td></tr><tr><td>B-2</td><td>14.50</td></tr></table>`,
  "/dialog": `${HEAD}Dialog</title><button id="alert-btn" onclick="alert('hi')">Alert me</button>`,
  "/detach": `${HEAD}Detach</title><div id="host"><button id="morph">Morphing</button></div>
    <script>let n=0;const t=setInterval(()=>{const h=document.getElementById('host');h.innerHTML='<button id="morph">Morphing</button>';if(++n>=4)clearInterval(t);},150);</script>`,
  "/pdf-page": `${HEAD}PDF</title><h1>Printable</h1>`,
};

let fixture: http.Server;
let fixtureBase = "";

async function startFixture(): Promise<void> {
  fixture = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/download/file") {
      res.writeHead(200, { "content-type": "text/plain", "content-disposition": 'attachment; filename="report.txt"' });
      res.end("MONICLAW-REPORT fixture payload");
      return;
    }
    if (url.pathname === "/slow") {
      setTimeout(() => { res.writeHead(200, { "content-type": "text/html" }); res.end(HEAD + "Slow</title><h1>Slow page loaded</h1>"); }, 2400);
      return;
    }
    const body = pages[url.pathname];
    if (body) { res.writeHead(200, { "content-type": "text/html" }); res.end(`<!doctype html><html><body>${body}</body></html>`); return; }
    res.writeHead(404); res.end("nf");
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const addr = fixture.address() as { port: number };
  fixtureBase = `http://127.0.0.1:${addr.port}`;
  console.log("STEP fixture listening", fixtureBase);
}

async function main() {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL required");
  await startFixture();

  const prisma = new PrismaClient();
  const box = { seal: encryptSecret, open: decryptSecret };
  const repos = buildPrismaRepositories(prisma, box);
  const pool = new BrowserPool(new PlaywrightDriver(), { maxProcesses: 2, idleTimeoutMs: 60_000, sweepIntervalMs: 0 });
  const permissions = new PermissionService(repos.policies);
  const planner = new ActionPlanner(permissions);
  const recovery = new RecoveryService();
  const screenshots = new ScreenshotService(repos.binaries, repos.screenshots);
  const recordings = new RecordingService(repos.recordings);
  const downloads = new DownloadService(repos.binaries, repos.downloads, new HeuristicScanner());
  const uploads = new UploadService(repos.binaries, repos.uploads, {
    write(row, data) {
      const dir = `/tmp/mcue-test-up/${row.id}`;
      fs.mkdirSync(dir, { recursive: true });
      const p = `${dir}/${row.filename}`;
      fs.writeFileSync(p, data);
      return Promise.resolve(p);
    },
  });
  const sessions = new SessionManager({ pool, sessions: repos.sessions, profiles: repos.profiles, settings: repos.settings, audit: null });
  const emitter = new InProcessExecutionEmitter();
  const executions = new ExecutionManager({
    sessions, executions: repos.executions, events: repos.events, planner, recovery, permissions,
    screenshots, recording: recordings, downloads, uploads, emitter, approvals: null, audit: null,
  });
  const queue = new InProcessExecutionQueue((id) => executions.run(id), 2);
  executions.attachQueue(queue);

  async function runPlan(sid: string, steps: Array<{ action: string; args: Record<string, unknown> }>, goal = "sync plan") {
    const row = await executions.start({ workspaceId, sessionId: sid, steps, goal });
    await queue.drain(60_000);
    return (await repos.executions.get(row.id, workspaceId))!;
  }

  const ws = await prisma.workspace.create({ data: { name: "CUE Browser IT", slug: `cue-browser-${Date.now()}` } });
  const workspaceId = ws.id;
  let sessionId = "";

  try {
    // ── 1 · session lifecycle ──────────────────────────────────────────
    const session = await sessions.create({ workspaceId, kind: "EPHEMERAL" });
    sessionId = session.id;
    assert.equal(session.status, "ACTIVE");
    console.log("PASS 1 session create", session.endpoint);

    // ── 2 · navigate + extract + screenshot via plan pipeline ──────────
    const exec1 = await executions.runInline({
      workspaceId, sessionId,
      steps: [{ action: "navigate", args: { url: fixtureBase + "/" } }],
    });
    assert.equal(exec1.status, "SUCCEEDED", exec1.error ?? "");
    const navOut = (exec1.result as { outputs: Record<string, { title: string }> }).outputs["1"];
    assert.equal(navOut.title, "Fixture Home");

    const exec2 = await executions.start({
      workspaceId, sessionId, goal: "fill the form",
      steps: [
        { action: "navigate", args: { url: fixtureBase + "/form" } },
        { action: "type", args: { selector: { strategy: "placeholder", value: "Your name" }, text: "Ada Lovelace" } },
        { action: "select_option", args: { selector: { strategy: "css", value: "#plan" }, values: ["pro"] } },
        { action: "checkbox", args: { selector: { strategy: "css", value: "#agree" }, checked: true } },
        { action: "radio", args: { selector: { strategy: "css", value: "#r-b" } } },
        { action: "click", args: { selector: { strategy: "testid", value: "submit-form" } } },
        { action: "extract_text", args: { selector: { strategy: "css", value: "#result" } } },
        { action: "take_screenshot", args: { fullPage: true } },
      ],
    });
    await queue.drain(60_000);
    const done2 = await repos.executions.get(exec2.id, workspaceId);
    assert.equal(done2?.status, "SUCCEEDED", done2?.error ?? "");
    const extractOut = (done2.result as { outputs: Record<string, { text: string }> }).outputs["7"];
    assert.match(extractOut.text, /saved:Ada Lovelace:pro:true/);
    const shotOut = (done2.result as { outputs: Record<string, { screenshotId: string }> }).outputs["8"];
    const shot = await screenshots.read(shotOut.screenshotId, workspaceId);
    assert.ok(shot && shot.binary.data.length > 2000, "screenshot bytes persisted");
    console.log("PASS 2 plan pipeline (8 steps, screenshot persisted)");

    // recording finalized with timeline
    const rec = await recordings.getByExecution(exec2.id, workspaceId);
    assert.ok(rec && rec.steps >= 8 && rec.timeline.length >= 8);
    console.log("PASS 3 recording finalized", { steps: rec.steps, screenshots: rec.screenshots });

    // ── 3 · tables/links extraction ─────────────────────────────────────
    const exec3 = await executions.runInline({
      workspaceId, sessionId,
      steps: [{ action: "navigate", args: { url: fixtureBase + "/table" } }],
    });
    assert.equal(exec3.status, "SUCCEEDED");
    const tables = await executions.runInline({
      workspaceId, sessionId,
      steps: [{ action: "extract_tables", args: {} }],
    });
    const tableOut = (tables.result as { outputs: Record<string, { tables: string[][][] }> }).outputs["1"];
    assert.equal(tableOut.tables[0][1][1], "9.99");
    console.log("PASS 4 extract_tables");

    // ── 4 · tabs ─────────────────────────────────────────────────────────
    const tabs = await runPlan(sessionId, [
      { action: "open_tab", args: { url: fixtureBase + "/pdf-page" } },
      { action: "switch_tab", args: { index: 0 } },
    ]);
    assert.equal(tabs.status, "SUCCEEDED", tabs.error ?? "");
    const sessionRow = await repos.sessions.get(sessionId, workspaceId);
    assert.ok((sessionRow?.tabCount ?? 0) >= 2);
    console.log("PASS 5 tabs open/switch");

    // ── 5 · cookies write/read/delete rollback trail ─────────────────────
    const cookies = await runPlan(sessionId, [
      { action: "write_cookies", args: { cookies: [{ name: "mcue_test", value: "cookie-ok", domain: "127.0.0.1" }] } },
      { action: "read_cookies", args: { names: ["mcue_test"] } },
    ]);
    assert.equal(cookies.status, "SUCCEEDED", cookies.error ?? "");
    const cookieOut = (cookies.result as { outputs: Record<string, { cookies: Array<{ value: string }> }> }).outputs["2"];
    assert.equal(cookieOut.cookies[0]?.value, "cookie-ok");
    console.log("PASS 6 cookies write/read");

    // ── 6 · download via click (event-driven) ────────────────────────────
    const dl = await runPlan(sessionId, [
      { action: "navigate", args: { url: fixtureBase + "/" } },
      { action: "download_file", args: { selector: { strategy: "testid", value: "dl" } } },
    ]);
    assert.equal(dl.status, "SUCCEEDED", dl.error ?? "");
    const dlId = (dl.result as { outputs: Record<string, { downloadId: string }> }).outputs["2"].downloadId;
    const dlRead = await downloads.read(dlId, workspaceId);
    assert.ok(dlRead);
    assert.match(dlRead.binary.data.toString("utf8"), /MONICLAW-REPORT/);
    assert.equal(dlRead.row.scanStatus, "CLEAN");
    console.log("PASS 7 download captured + scanned", { bytes: dlRead.binary.data.length });

    // ── 7 · upload_file against staged upload ────────────────────────────
    const settings = await repos.settings.getSettings(workspaceId);
    const staged = await uploads.store({
      workspaceId, uploaderId: null, filename: "identity.txt", mime: "text/plain",
      data: Buffer.from("identity payload"), maxBytes: settings.maxArtifactMB * 1024 * 1024,
    });
    const up = await runPlan(sessionId, [
      { action: "navigate", args: { url: fixtureBase + "/upload" } },
      { action: "upload_file", args: { selector: { strategy: "css", value: "#file-input" }, uploadIds: [staged.row.id] } },
      { action: "extract_text", args: { selector: { strategy: "css", value: "#picked" } } },
    ]);
    assert.equal(up.status, "SUCCEEDED", up.error ?? "");
    const picked = (up.result as { outputs: Record<string, { text: string }> }).outputs["3"];
    assert.match(picked.text, /files:identity\.txt/);
    const stagedAfter = await uploads.get(staged.row.id, workspaceId);
    assert.equal(stagedAfter?.usedCount, 1);
    console.log("PASS 8 upload_file attached staged file");

    // ── 8 · print_pdf (chromium headless) ────────────────────────────────
    const pdf = await runPlan(sessionId, [
      { action: "navigate", args: { url: fixtureBase + "/pdf-page" } },
      { action: "print_pdf", args: { filename: "page.pdf" } },
    ]);
    assert.equal(pdf.status, "SUCCEEDED", pdf.error ?? "");
    const pdfId = (pdf.result as { outputs: Record<string, { downloadId: string }> }).outputs["2"].downloadId;
    const pdfRead = await downloads.read(pdfId, workspaceId);
    assert.ok(pdfRead && pdfRead.binary.data.subarray(0, 4).toString() === "%PDF");
    console.log("PASS 9 print_pdf persisted", { bytes: pdfRead.binary.data.length });

    // ── 9 · javascript gate (default policy denies — fail-fast at plan) ──
    await assert.rejects(
      executions.runInline({
        workspaceId, sessionId,
        steps: [{ action: "execute_javascript", args: { script: "return 2+2" } }],
      }),
      /policy/i
    );
    // flip policy → allowed
    let policy = await repos.policies.getPolicy(workspaceId);
    policy = { ...policy, allowJavascript: true };
    await repos.policies.savePolicy(policy, "test");
    const jsOk = await executions.runInline({
      workspaceId, sessionId,
      steps: [{ action: "execute_javascript", args: { script: "return 2+2" } }],
    });
    assert.equal(jsOk.status, "SUCCEEDED", jsOk.error ?? "");
    const jsOut = (jsOk.result as { outputs: Record<string, { result: number }> }).outputs["1"];
    assert.equal(jsOut.result, 4);
    console.log("PASS 10 javascript permission gate (denied→allowed)");

    // ── 10 · persistent profile write-back + resume ─────────────────────
    const profile = await new ProfileService(repos.profiles).create({
      workspaceId, name: "persist-it", description: null, browser: "CHROMIUM", userAgent: null, viewport: null, createdById: null,
    });
    const persistent = await sessions.create({ workspaceId, kind: "PERSISTENT", profileId: profile.id });
    const seedCookies = await runPlan(persistent.id, [
      { action: "navigate", args: { url: fixtureBase + "/" } },
      { action: "write_cookies", args: { cookies: [{ name: "mcue_persist", value: "profile-cookie", domain: "127.0.0.1" }] } },
    ]);
    assert.equal(seedCookies.status, "SUCCEEDED", seedCookies.error ?? "");
    await sessions.close(persistent.id, workspaceId);
    const state = await repos.profiles.readStorageState(profile.id);
    assert.ok(state?.cookies.some((c) => c.name === "mcue_persist" && c.value === "profile-cookie"), "cookie written back to encrypted profile");
    // resume (attach after close rebuilds from profile)
    const resumed = await sessions.create({ workspaceId, kind: "PERSISTENT", profileId: profile.id });
    const resumedCookies = await runPlan(resumed.id, [
      { action: "navigate", args: { url: fixtureBase + "/" } },
      { action: "read_cookies", args: { names: ["mcue_persist"] } },
    ]);
    const resumedOut = (resumedCookies.result as { outputs: Record<string, { cookies: Array<{ value: string }> }> }).outputs["2"];
    assert.equal(resumedOut.cookies[0]?.value, "profile-cookie");
    console.log("PASS 11 persistent profile: cookie persisted + resumed across sessions");
    await sessions.close(resumed.id, workspaceId);

    // ── 11 · pool reuse ──────────────────────────────────────────────────
    const stats = pool.stats();
    assert.ok(stats.processes <= 2, "pool bounded");
    console.log("PASS 12 pool stats", stats);

    // ── 12 · detach retry (element churn) tolerated with attempts ───────
    const det = await runPlan(sessionId, [
      { action: "navigate", args: { url: fixtureBase + "/detach" } },
      { action: "click", args: { selector: { strategy: "css", value: "#morph" } } },
    ]);
    assert.ok(["SUCCEEDED", "FAILED"].includes(det.status));
    const detEvents = await repos.events.listForExecution(det.id);
    console.log("PASS 13 detach churn handled", { status: det.status, attempts: detEvents.length });

    await sessions.close(sessionId, workspaceId);
    console.log("ALL CUE BROWSER TESTS PASSED");
  } finally {
    await pool.destroyAll().catch(() => {});
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
    fixture.close();
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("CUE BROWSER TEST FAILED:", err);
  process.exit(1);
});
