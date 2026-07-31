/**
 * Phase-5 production worker verification against a BYOK demo workspace.
 *
 *   sign-in (real Auth.js surface) → BYOK providers present → research worker
 *   (bounded budget) → promote → dispatch LIVE run → follow to terminal
 *   (auto-handles a human-approval park if a step gates, proving HITL) →
 *   assert lifecycle · planner trace · tool execution · evidence events ·
 *   output report · audit trail · usage accounting (AiUsageEvent requestId) ·
 *   SSE replay → browser-integration posture → cross-tenant isolation probe.
 *
 * The run it creates is LEFT in the demo workspace as inspectable evidence
 * (dashboard link printed at the end). Requires:
 *   BASE_URL  DEMO_EMAIL  DEMO_PASSWORD  DATABASE_URL (prod)
 */
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "https://moniclaw.vercel.app";
const EMAIL = process.env.DEMO_EMAIL ?? "";
const PASSWORD = process.env.DEMO_PASSWORD ?? "";
const DATABASE_URL = process.env.DATABASE_URL;

let failures = 0;
function report(ok: boolean, name: string, detail = "") {
  if (ok) console.log(`  ✓ ${name}${detail ? `  (${detail})` : ""}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? `  (${detail})` : ""}`);
  }
}

function cookieOf(res: Response): string {
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  const list =
    typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : ([res.headers.get("set-cookie")].filter(Boolean) as string[]);
  return list.map((cookie) => cookie.split(";")[0]).join("; ");
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string; message: string };

async function api<T = unknown>(
  cookie: string, method: string, path: string, body?: unknown
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Envelope<T>;
  try { parsed = JSON.parse(text) as Envelope<T>; }
  catch { parsed = { ok: false, error: "non_json", message: text.slice(0, 200) }; }
  return { status: res.status, body: parsed };
}

async function main() {
  if (!EMAIL || !PASSWORD || !DATABASE_URL) {
    console.error("DEMO_EMAIL, DEMO_PASSWORD and DATABASE_URL are required.");
    process.exit(1);
  }
  const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

  console.log("auth + workspace:");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const signInRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieOf(csrfRes) },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD }),
  });
  const cookie = cookieOf(signInRes);
  report(cookie.includes("authjs.session-token"), "demo sign-in via real auth surface");

  const demo = await db.user.findUniqueOrThrow({ where: { email: EMAIL }, include: { memberships: true } });
  const workspaceId = demo.memberships[0].workspaceId;
  report(true, "demo workspace resolved", workspaceId.slice(0, 8));

  console.log("\nBYOK posture:");
  const provs = await api<{ configs: Array<{ provider: string; enabled: boolean }> }>(cookie, "GET", "/api/ai/providers");
  const configured = provs.body.ok ? provs.body.data.configs.filter((c) => c.enabled).length : 0;
  report(provs.body.ok && configured > 0, "BYOK provider key(s) configured on workspace", `enabled=${configured}`);

  console.log("\nresearch worker (bounded budget):");
  const stamp = Date.now().toString(36);
  // Idempotent: reuse a previously created verification worker, else create.
  const existing = await db.agent.findFirst({ where: { workspaceId, name: "Prod Verification Researcher", deletedAt: null } });
  let agentId: string;
  if (existing) {
    agentId = existing.id;
    report(true, "verification worker reused from a prior pass");
    await api(cookie, "PATCH", `/api/agents/${agentId}`, {
      budget: { maxSteps: 10, maxTokens: 200_000, maxCostMicros: 1_000_000, maxDurationMs: 240_000, maxConcurrentRuns: 1, maxDepth: 0 },
      status: "SUPERVISED",
    });
  } else {
    const created = await api<{ agent: { id: string } }>(cookie, "POST", "/api/agents", {
      name: "Prod Verification Researcher",
      slug: `prod-verify-researcher-${stamp}`,
      description: "Verifies the Phase-5 research worker pipeline end to end against live data sources.",
      workerType: "research",
      goal: "Fetch a public pricing page over HTTP and file a short cited pricing summary for the sales team.",
      instructions: "Prefer http_request for fetches; cite every source URL; keep reports under 400 words.",
      budget: { maxSteps: 10, maxTokens: 200_000, maxCostMicros: 1_000_000, maxDurationMs: 240_000, maxConcurrentRuns: 1, maxDepth: 0 },
    });
    report(created.status === 201, "worker created", `→ ${created.status}`);
    if (!created.body.ok) throw new Error("cannot continue without the worker");
    agentId = created.body.data.agent.id;
  }

  const promoted = await api(cookie, "PATCH", `/api/agents/${agentId}`, { status: "SUPERVISED" });
  report(promoted.status === 200, "promoted to SUPERVISED");

  const goal =
    "Use the http_request tool to GET https://moniclaw.vercel.app/pricing (HTML). " +
    "Extract the plan names and headline prices, then file a concise pricing digest " +
    "with the page URL cited. If any fetch fails, say so explicitly in the report.";
  const dispatched = await api<{ run: { id: string } }>(cookie, "POST", `/api/agents/${agentId}/dispatch`, {
    goal, mode: "LIVE", idempotencyKey: `prod-verify-${stamp}`,
  });
  report(dispatched.status === 202, "dispatch → 202", `→ ${dispatched.status}`);
  if (!dispatched.body.ok) throw new Error("dispatch failed");
  const runId = dispatched.body.data.run.id;
  console.log(`  · run ${runId}`);

  console.log("\nrun lifecycle (poll → terminal, approval-aware):");
  const deadline = Date.now() + 270_000;
  let run: { id: string; status: string; errorClass: string | null; tokensUsed: number; stepsExecuted: number; creditsUsed: number } | null = null;
  let parkedSeen = false;
  while (Date.now() < deadline) {
    const res = await api<{ run: typeof run }>(cookie, "GET", `/api/agents/runs/${runId}`);
    if (res.body.ok) {
      run = res.body.data.run;
      if (run && run.status === "NEEDS_APPROVAL") {
        parkedSeen = true;
        // Human-in-the-loop proof: decide the parked approval, then resume.
        const approval = await db.approval.findFirst({
          where: { runId, status: "PENDING" }, orderBy: { createdAt: "desc" },
        });
        if (approval) {
          await db.approval.update({ where: { id: approval.id }, data: { status: "APPROVED", decidedBy: { connect: { id: demo.id } }, decidedAt: new Date() } });
          const resumed = await api(cookie, "POST", `/api/agents/runs/${runId}/resume`, {});
          report(resumed.status === 200, "approval granted → resume accepted", `→ ${resumed.status}`);
        }
      }
      if (run && ["SUCCEEDED", "FAILED", "CANCELED"].includes(run.status)) break;
    }
    await new Promise((r) => setTimeout(r, 2_500));
  }
  report(!!run && run.status === "SUCCEEDED", "run terminal", run ? `${run.status} · ${run.errorClass ?? "clean"}` : "timeout");
  if (parkedSeen) report(true, "HITL approval park observed + resolved");
  report(!!run && run.stepsExecuted > 0, "planner steps executed", `steps=${run?.stepsExecuted ?? "?"}`);
  report(!!run && run.tokensUsed > 0, "tokens metered", `tokens=${run?.tokensUsed ?? "?"}`);

  console.log("\nevidence + output:");
  const detail = await api<{
    run: { output: { report?: { title: string; markdown: string; citations: Array<{ url: string }> } | null; reflection?: string; steps?: Array<{ status: string }> | null } | null };
    agent: { workerType: string } | null;
    children: unknown[];
  }>(cookie, "GET", `/api/agents/runs/${runId}`);
  const output = detail.body.ok ? detail.body.data.run.output : null;
  report(!!output?.report?.title, "research report synthesized", output?.report?.title?.slice(0, 60));
  report(!!output?.report?.markdown && output.report.markdown.length > 100, "report markdown substantive", `${output?.report?.markdown.length ?? 0} chars`);
  report((output?.report?.citations?.length ?? 0) > 0 || !output?.report, "citations present (or report fallback)", `citations=${output?.report?.citations?.length ?? 0}`);
  report((output?.steps?.length ?? 0) > 0, "step digest present", `steps=${output?.steps?.length ?? 0}`);
  report(detail.body.ok && detail.body.data.agent?.workerType === "research", "run linked to research archetype");

  const evts = await api<{ events: Array<{ type: string }> }>(cookie, "GET", `/api/agents/runs/${runId}/events?limit=200`);
  const types = evts.body.ok ? evts.body.data.events.map((e) => e.type) : [];
  const lifecycle = ["run_queued", "run_started"].every((t) => types.includes(t)) &&
    (types.includes("run_succeeded") || types.includes("run_failed"));
  report(lifecycle, "lifecycle events complete (queued → started → terminal)", types.join(","));

  console.log("\nreplay (SSE) + audit + usage accounting:");
  const streamRes = await fetch(`${BASE}/api/agents/runs/${runId}/stream`, { headers: { Cookie: cookie } });
  const streamText = await streamRes.text();
  report(
    streamText.includes("event: status") && streamText.includes("event: event") && streamText.includes("event: end"),
    "SSE replay emits status + event trail + end"
  );

  const auditRows = await db.auditLog.findMany({
    where: { workspaceId, action: { in: ["agent.run.dispatch", "agent.run.failed", "agent.run.canceled"] } },
    orderBy: { createdAt: "desc" }, take: 5,
  });
  report(auditRows.some((a) => a.action === "agent.run.dispatch"), "audit trail records the dispatch");

  const usageRows = await db.aiUsageEvent.findMany({ where: { workspaceId, requestId: `run:${runId}` } });
  const tokens = usageRows.reduce((s, r) => s + r.totalTokens, 0);
  report(usageRows.length > 0 && tokens > 0, "usage events attributed to the run (requestId)", `${usageRows.length} events · ${tokens} tokens`);
  report(!!run && run.tokensUsed >= tokens - 5, "metered tokens consistent with usage ledger", `meter=${run?.tokensUsed} ledger=${tokens}`);

  const agentAfter = await db.agent.findUniqueOrThrow({ where: { id: agentId } });
  report(agentAfter.runCount >= 1, "runCount incremented", `runCount=${agentAfter.runCount}`);

  console.log("\ncross-tenant isolation probe:");
  const stranger = await db.workspace.create({ data: { name: "Isolation Probe", slug: `probe-${stamp}` } });
  const probeAgent = await db.agent.create({
    data: { workspaceId: stranger.id, name: "Probe", slug: "probe", description: "Isolation probe agent for the cross-tenant check." },
  });
  const probeRun = await db.agentRun.create({
    data: {
      agentId: probeAgent.id, workspaceId: stranger.id, mode: "LIVE", triggerSource: "probe",
      status: "QUEUED", progress: { goal: "probe" }, budgetSnapshot: {},
    },
  });
  const crossRead = await api(cookie, "GET", `/api/agents/runs/${probeRun.id}`);
  report(crossRead.status === 404, "demo user cannot read another workspace's run (404)", `→ ${crossRead.status}`);
  await db.workspace.delete({ where: { id: stranger.id } }); // cascades probe agent + run

  await db.$disconnect();

  console.log("\nbrowser integration posture (Phase-4 known limitation on Vercel):");
  const health = await api<{ status: string }>(cookie, "GET", "/api/browser/health");
  report(health.status === 200, "browser engine health endpoint reachable", `→ ${health.status}`);

  console.log(`\nEvidence run: ${BASE}/dashboard/runs/${runId}`);
  console.log(failures === 0 ? "\nAll production worker checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
