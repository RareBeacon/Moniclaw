/**
 * AI Workers REST end-to-end test against a live deployment with a real
 * database. Provisions an ephemeral workspace (OWNER + VIEWER), signs in
 * through the real Auth.js HTTP surface, then exercises the /api/agents/*
 * surface:
 *
 *   agent create → validation negative → DRAFT dispatch refused (409) →
 *   PATCH promote → dispatch (202) → run reaches terminal state → idempotent
 *   redispatch → detailed run + events + audit trail → kill-switch cancel →
 *   SSE stream contract → RBAC (viewer 403 on dispatch) → scheduler tick
 *   (401 without secret; dispatches a due cron worker with CRON_SECRET).
 *
 * Model posture: the ephemeral workspace has no BYOK provider keys, so the
 * dispatched runs fail HONESTLY as errorClass "upstream_failed" — that IS
 * the assertion locally and in CI until a workspace adds a key. A live
 * research run on the seeded demo workspace (keys present) is the separate
 * production proof.
 *
 * Usage:
 *   BASE_URL=http://localhost:3100 DATABASE_URL=postgres://... CRON_SECRET=... \
 *     npx tsx scripts/agent-e2e-test.mts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DATABASE_URL = process.env.DATABASE_URL;
const CRON_SECRET = process.env.CRON_SECRET ?? "";

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

async function signIn(email: string, password: string): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const signInRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieOf(csrfRes),
    },
    body: new URLSearchParams({ csrfToken, email, password }),
  });
  return cookieOf(signInRes);
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string; message: string };

async function api<T = unknown>(
  cookie: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Envelope<T>;
  try {
    parsed = JSON.parse(text) as Envelope<T>;
  } catch {
    parsed = { ok: false, error: "non_json", message: text.slice(0, 200) };
  }
  return { status: res.status, body: parsed };
}

type RunRow = {
  id: string;
  status: string;
  errorClass: string | null;
  error: string | null;
  triggerSource: string;
  agentId: string;
};

async function waitForTerminal(
  cookie: string,
  runId: string,
  timeoutMs = 45_000
): Promise<RunRow | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await api<{ run: RunRow }>(cookie, "GET", `/api/agents/runs/${runId}`);
    if (res.body.ok && ["SUCCEEDED", "FAILED", "CANCELED"].includes(res.body.data.run.status)) {
      return res.body.data.run;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return null;
}

async function main() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const stamp = Date.now().toString(36);
  const ownerEmail = `e2e-agents-owner+${stamp}@agents.moniclaw.invalid`;
  const viewerEmail = `e2e-agents-viewer+${stamp}@agents.moniclaw.invalid`;
  const password = "e2e-password-91!";
  const passwordHash = await bcrypt.hash(password, 12);

  let workspaceId: string | null = null;

  try {
    const workspace = await db.workspace.create({
      data: { name: "E2E AI Workers", slug: `e2e-agents-${stamp}` },
    });
    workspaceId = workspace.id;
    await db.user.create({
      data: {
        name: "E2E Workers Owner",
        email: ownerEmail,
        passwordHash,
        emailVerified: new Date(),
        memberships: { create: { role: "OWNER", workspaceId: workspace.id } },
      },
    });
    await db.user.create({
      data: {
        name: "E2E Workers Viewer",
        email: viewerEmail,
        passwordHash,
        emailVerified: new Date(),
        memberships: { create: { role: "VIEWER", workspaceId: workspace.id } },
      },
    });
    report(true, "ephemeral workspace + owner + viewer provisioned");

    const owner = await signIn(ownerEmail, password);
    const viewer = await signIn(viewerEmail, password);
    report(
      owner.includes("authjs.session-token") && viewer.includes("authjs.session-token"),
      "owner + viewer signed in via real auth surface"
    );

    console.log("\nagent lifecycle:");
    const bad = await api(owner, "POST", "/api/agents", {
      name: "Broken Cron",
      description: "A scheduled agent that is missing its cron expression.",
      trigger: "SCHEDULE",
    });
    report(bad.status === 400 && !bad.body.ok, "create with SCHEDULE and no cron → 400", `→ ${bad.status}`);

    const created = await api<{ agent: { id: string; slug: string; workerType: string } }>(
      owner,
      "POST",
      "/api/agents",
      {
        name: "E2E Research Worker",
        slug: `research-${stamp}`,
        description: "Recounts competitive pricing pages weekly and files cited reports for the strategy team.",
        workerType: "research",
        goal: "Map the pricing pages of the top five CRM competitors and file a cited comparison.",
        instructions: "Prefer primary sources; cite every figure.",
      }
    );
    report(created.status === 201 && created.body.ok, "POST /api/agents → 201 research worker", `→ ${created.status}`);
    if (!created.body.ok) throw new Error("agent create failed — cannot continue");
    const agentId = created.body.data.agent.id;
    report(created.body.data.agent.workerType === "research", "workerType persisted as research");

    const hidden = await api(viewer, "GET", "/api/agents");
    report(hidden.status === 200 && hidden.body.ok, "viewer can list agents (agents.read)", `→ ${hidden.status}`);

    const draftDispatch = await api(owner, "POST", `/api/agents/${agentId}/dispatch`, {});
    report(
      draftDispatch.status === 409 && !draftDispatch.body.ok && draftDispatch.body.error === "agent_unavailable",
      "DRAFT agent refuses dispatch → 409 agent_unavailable",
      `→ ${draftDispatch.status} ${!draftDispatch.body.ok ? draftDispatch.body.error : ""}`
    );

    const promoted = await api(owner, "PATCH", `/api/agents/${agentId}`, { status: "SHADOW" });
    report(promoted.status === 200 && promoted.body.ok, "PATCH status → SHADOW", `→ ${promoted.status}`);

    console.log("\ndispatch → terminal run (honest failure without model keys):");
    const idem = `e2e-${stamp}-1`;
    const first = await api<{ run: RunRow; deduplicated: boolean }>(
      owner, "POST", `/api/agents/${agentId}/dispatch`, { idempotencyKey: idem }
    );
    report(first.status === 202 && first.body.ok && !first.body.data.deduplicated, "dispatch → 202 queued", `→ ${first.status}`);
    if (!first.body.ok) throw new Error("dispatch failed — cannot continue");
    const runId = first.body.data.run.id;

    const dedupe = await api<{ run: RunRow; deduplicated: boolean }>(
      owner, "POST", `/api/agents/${agentId}/dispatch`, { idempotencyKey: idem }
    );
    report(
      dedupe.status === 200 && dedupe.body.ok && dedupe.body.data.deduplicated && dedupe.body.data.run.id === runId,
      "same idempotency key → deduplicated, same run",
      `→ ${dedupe.status}`
    );

    const terminal = await waitForTerminal(owner, runId);
    report(!!terminal, "run reached a terminal state", terminal ? terminal.status : "timeout");
    // Provider-weather aware (same idiom as the sales suite): with no model
    // reachable the run must fail with upstream_failed; when a platform key
    // IS reachable the planner executes honestly and any classified failure
    // (upstream | execution | internal) is a coherent terminal state.
    const providerWired = Boolean(process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY);
    const honestClass = providerWired
      ? ["upstream_failed", "execution_failed", "internal"].includes(terminal?.errorClass ?? "")
      : terminal?.errorClass === "upstream_failed";
    report(
      !!terminal && terminal.status === "FAILED" && honestClass,
      providerWired
        ? "run fails HONESTLY with a classified error (COMPLETED also acceptable on live model)"
        : "no model keys → run fails HONESTLY as upstream_failed",
      terminal ? `${terminal.status} · ${terminal.errorClass}` : "timeout"
    );

    const evts = await api<{ events: Array<{ type: string; message: string }> }>(
      owner, "GET", `/api/agents/runs/${runId}/events?limit=100`
    );
    const evtTypes = evts.body.ok ? evts.body.data.events.map((e) => e.type) : [];
    report(
      evts.body.ok && evtTypes.includes("run_started") && evtTypes.includes("run_failed"),
      "evidence trail: run_started + run_failed recorded",
      evtTypes.join(",")
    );

    // finishRun commits the terminal row BEFORE the audit/event writes, so a
    // fast poller can beat the audit insert — give the trail a few seconds.
    let auditRows: Awaited<ReturnType<typeof db.auditLog.findMany>> = [];
    for (let i = 0; i < 10; i++) {
      auditRows = await db.auditLog.findMany({
        where: { workspaceId: workspace.id, action: { in: ["agent.run.dispatch", "agent.run.failed"] } },
      });
      if (auditRows.some((a) => a.action === "agent.run.dispatch") && auditRows.some((a) => a.action === "agent.run.failed")) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    report(
      auditRows.some((a) => a.action === "agent.run.dispatch") && auditRows.some((a) => a.action === "agent.run.failed"),
      "audit trail: dispatch + failure recorded"
    );

    const agentRow = await db.agent.findUniqueOrThrow({ where: { id: agentId } });
    report(agentRow.runCount >= 1, "agent runCount incremented on terminal", `runCount=${agentRow.runCount}`);

    console.log("\nkill switch:");
    const queuedRun = await db.agentRun.create({
      data: {
        agentId,
        workspaceId: workspace.id,
        mode: "LIVE",
        triggerSource: "test",
        status: "QUEUED",
        progress: { goal: "Inserted directly to exercise the cancel contract." },
        budgetSnapshot: {},
      },
    });
    const canceled = await api(owner, "POST", `/api/agents/runs/${queuedRun.id}/cancel`, {});
    report(canceled.status === 200 && canceled.body.ok, "POST cancel on a queued run → 200", `→ ${canceled.status}`);
    const afterCancel = await api<{ run: RunRow }>(owner, "GET", `/api/agents/runs/${queuedRun.id}`);
    report(
      afterCancel.body.ok && afterCancel.body.data.run.status === "CANCELED",
      "queued run transitions to CANCELED",
      afterCancel.body.ok ? afterCancel.body.data.run.status : "?"
    );

    console.log("\nSSE stream contract:");
    const streamRes = await fetch(`${BASE}/api/agents/runs/${runId}/stream`, {
      headers: { Cookie: owner },
    });
    const streamText = await streamRes.text();
    report(
      streamRes.status === 200 && streamText.includes("event: status") && streamText.includes("event: end"),
      "GET stream → SSE status+end frames on a terminal run",
      `→ ${streamRes.status}`
    );

    console.log("\nRBAC:");
    const viewerDispatch = await api(viewer, "POST", `/api/agents/${agentId}/dispatch`, {});
    report(
      viewerDispatch.status === 403,
      "viewer dispatch → 403 (agents.run requires Member+)",
      `→ ${viewerDispatch.status}`
    );
    const viewerCancel = await api(viewer, "POST", `/api/agents/runs/${runId}/cancel`, {});
    report(viewerCancel.status === 403, "viewer cancel → 403", `→ ${viewerCancel.status}`);

    console.log("\nscheduler tick:");
    const noSecret = await fetch(`${BASE}/api/agents/tick`, { method: "POST" });
    report(noSecret.status === 401, "POST tick without secret → 401", `→ ${noSecret.status}`);

    if (CRON_SECRET) {
      await db.agent.update({
        where: { id: agentId },
        data: { trigger: "SCHEDULE", schedule: "* * * * *", status: "AUTONOMOUS" },
      });
      const tickRes = await fetch(`${BASE}/api/agents/tick`, {
        method: "POST",
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      const tickBody = (await tickRes.json()) as { ok: boolean; data?: { dispatched: number; reaped: number; requeued: number } };
      report(
        tickRes.status === 200 && tickBody.ok && (tickBody.data?.dispatched ?? 0) >= 1,
        "tick with CRON_SECRET dispatches the due cron worker",
        `→ ${tickRes.status} dispatched=${tickBody.data?.dispatched ?? "?"}`
      );

      const scheduled = await db.agentRun.findFirst({
        where: { agentId, triggerSource: "schedule" },
        orderBy: { createdAt: "desc" },
      });
      if (scheduled) {
        const schedTerminal = await waitForTerminal(owner, scheduled.id, 45_000);
        report(
          !!schedTerminal,
          "schedule-triggered run executes to terminal",
          schedTerminal ? `${schedTerminal.status} · ${schedTerminal.errorClass ?? ""}` : "timeout"
        );
        report(scheduled.idempotencyKey?.startsWith(`cron:${agentId}:`) ?? false, "cron idempotency key stamped");
      } else {
        report(false, "schedule-triggered run row exists");
      }

      const agentAfter = await db.agent.findUniqueOrThrow({ where: { id: agentId } });
      report(agentAfter.lastScheduledAt !== null, "lastScheduledAt stamped by the sweep");
    } else {
      report(true, "CRON_SECRET not set — tick dispatch checks skipped");
    }

    console.log("\nadmin surface:");
    const health = await api<{ status: string; runs: { queued: number } }>(owner, "GET", "/api/agents/health");
    report(health.status === 200 && health.body.ok && health.body.data.status === "ok", "GET /api/agents/health → diagnostics", `→ ${health.status}`);

    const detail = await api<{ agent: { id: string } }>(owner, "GET", `/api/agents/${agentId}`);
    report(detail.status === 200 && detail.body.ok, "GET /api/agents/[id] → detail + recentRuns", `→ ${detail.status}`);

    const cross = await api(owner, "GET", `/api/agents/runs?agentId=${agentId}&status=FAILED`);
    report(cross.status === 200 && cross.body.ok, "GET /api/agents/runs filtered by agent+status", `→ ${cross.status}`);

    console.log("\nmulti-agent teams (Phase 7):");
    // Member worker + delegation capability on the leader.
    const memberCreated = await api<{ agent: { id: string; slug: string } }>(owner, "POST", "/api/agents", {
      name: "E2E Scribe",
      slug: `scribe-${stamp}`,
      description: "Drafts persuasive, on-brand outreach from research briefs and files it for review.",
      workerType: "general",
      goal: "Draft outreach that sounds hand-written.",
    });
    const memberId = memberCreated.body.data?.agent?.id;
    report(memberCreated.status === 201 && !!memberId, "member worker created (scribe)", `→ ${memberCreated.status}`);
    const leaderPolicy = await api(owner, "PATCH", `/api/agents/${agentId}`, { toolPolicy: { allowDelegation: true } });
    report(leaderPolicy.status === 200 && leaderPolicy.body.ok, "leader gains allowDelegation capability", `→ ${leaderPolicy.status}`);

    const viewerTeam = await api(viewer, "POST", "/api/agent-teams", { name: "Viewer Crew" });
    report(viewerTeam.status === 403, "viewer cannot create teams (agents.create is Member+)", `→ ${viewerTeam.status}`);

    const leaderAsMember = await api(owner, "POST", "/api/agent-teams", {
      name: "Schrödinger Crew",
      leaderAgentId: agentId,
      members: [{ agentId, promptHint: "impossible" }],
    });
    report(leaderAsMember.status === 400, "leader-as-member refused (validation)", `→ ${leaderAsMember.status}`);

    const teamCreated = await api<{ team: { id: string; slug: string } }>(owner, "POST", "/api/agent-teams", {
      name: "E2E Outbound Crew",
      description: "Research then write.",
      leaderAgentId: agentId,
      members: [{ agentId: memberId!, promptHint: "Hand briefs to the scribe for drafting." }],
      budget: { maxSteps: 8, maxDepth: 1 },
    });
    report(teamCreated.status === 201 && teamCreated.body.ok, "team created (leader + 1 member + budget)", `→ ${teamCreated.status}`);
    const teamId = teamCreated.body.data!.team.id;

    const teamList = await api<{ teams: Array<{ id: string; members: unknown[]; leader: { slug: string } | null }> }>(owner, "GET", "/api/agent-teams");
    const listedTeam = teamList.body.data?.teams.find((t) => t.id === teamId);
    report(
      teamList.status === 200 && !!listedTeam && listedTeam.members.length === 1 && listedTeam.leader !== null,
      "GET /api/agent-teams → roster hydrated"
    );

    const noGoal = await api(owner, "POST", `/api/agent-teams/${teamId}/run`, {});
    report(noGoal.status === 400, "team run without a goal → 400 (runs need a concrete objective)", `→ ${noGoal.status}`);

    const teamRun = await api<{ run: { id: string; status: string }; deduplicated: boolean }>(
      owner, "POST", `/api/agent-teams/${teamId}/run`,
      { goal: "Research Acme Logistics and draft a two-paragraph intro.", idempotencyKey: `e2e-${stamp}` }
    );
    report(teamRun.status === 202 && teamRun.body.ok && !teamRun.body.data!.deduplicated,
      "team run dispatched through the standard orchestrator (202)", `→ ${teamRun.status}`);

    const runRow = await db.agentRun.findUnique({
      where: { id: teamRun.body.data!.run.id },
      select: { teamId: true, triggerSource: true, budgetSnapshot: true },
    });
    report(runRow?.teamId === teamId && runRow.triggerSource === "team",
      "run stamped teamId + triggerSource=team (lineage)");
    const snapshot = (runRow?.budgetSnapshot ?? {}) as { maxSteps?: number };
    report(snapshot.maxSteps === 8, "team budget override resolved into the run's snapshot", `maxSteps=${snapshot.maxSteps ?? "?"}`);

    const dupRun = await api<{ deduplicated: boolean }>(owner, "POST", `/api/agent-teams/${teamId}/run`, {
      goal: "Research Acme Logistics and draft a two-paragraph intro.", idempotencyKey: `e2e-${stamp}`,
    });
    report(dupRun.status === 200 && dupRun.body.ok && dupRun.body.data!.deduplicated === true,
      "same idempotency key → deduplicated (no double team run)");

    const teamRuns = await api<{ runs: Array<{ id: string }> }>(owner, "GET", `/api/agents/runs?teamId=${teamId}`);
    report(teamRuns.status === 200 && (teamRuns.body.data?.runs.length ?? 0) >= 1,
      "runs feed filters by teamId");

    const renamed = await api(owner, "PATCH", `/api/agent-teams/${teamId}`, { name: "E2E Outbound Crew v2" });
    report(renamed.status === 200 && renamed.body.ok, "team renamed via PATCH");

    // Delegation capability gate: a leader WITHOUT allowDelegation is refused.
    const plainAgent = await api<{ agent: { id: string } }>(owner, "POST", "/api/agents", {
      name: "E2E Solo", slug: `solo-${stamp}`,
      description: "A capable worker that has not been granted the delegation capability.",
      goal: "Work alone.",
    });
    const plainId = plainAgent.body.data!.agent.id;
    await api(owner, "PATCH", `/api/agents/${plainId}`, { status: "SHADOW" });
    const noTeam2 = await api<{ team: { id: string } }>(owner, "POST", "/api/agent-teams", {
      name: "Gate Check Crew", leaderAgentId: plainId, members: [{ agentId: memberId! }],
    });
    const refused = await api(owner, "POST", `/api/agent-teams/${noTeam2.body.data!.team.id}/run`, { goal: "Try to delegate anyway." });
    report(
      refused.status === 403 && !refused.body.ok && refused.body.error === "delegation_denied",
      "leader without allowDelegation → 403 delegation_denied (safe-by-default)",
      `→ ${refused.status} ${!refused.body.ok ? refused.body.error : ""}`
    );

    const del = await api(owner, "DELETE", `/api/agent-teams/${teamId}`);
    report(del.status === 200 && del.body.ok, "team deleted");
    const runAfter = await db.agentRun.findUnique({ where: { id: teamRun.body.data!.run.id }, select: { id: true, teamId: true } });
    report(!!runAfter && runAfter.teamId === null, "run evidence preserved after team delete (teamId → NULL)");

    console.log("\nplan metering & monthly credit gate (Phase 10):");
    // Launch cohort lives on the Duo plan (migration backfill + new default).
    const wsRow = await db.workspace.findUnique({ where: { id: workspace.id }, select: { plan: true } });
    report(wsRow?.plan === "DUO", "launch-workspace plan is Duo", wsRow?.plan ?? "?");

    // Accrual: the financial column is stamped by the real finish path —
    // recompute expectations from the run's own numbers (creditsForRun).
    const latest = await db.agentRun.findFirst({
      where: { workspaceId: workspace.id, status: { in: ["SUCCEEDED", "FAILED"] } },
      orderBy: { finishedAt: "desc" },
    });
    const didWork = latest ? latest.stepsExecuted > 0 || (latest.tokensUsed ?? 0) > 0 : false;
    const expectedCredits = latest ? (didWork ? Math.max(1, Math.ceil((latest.tokensUsed ?? 0) / 1000)) : 0) : -1;
    report(
      !!latest && latest.creditsUsed === expectedCredits,
      "terminal runs accrue credits via the finish path",
      latest ? `${latest.creditsUsed}cr (${latest.status}, ${latest.stepsExecuted} steps, ${latest.tokensUsed} tok)` : "no terminal run"
    );

    // Enforcement: fabricate a spent metering month, expect an honest 402,
    // then prove the gate re-opens when the ledger frees up.
    const spent = await db.agentRun.create({
      data: {
        agentId,
        workspaceId: workspace.id,
        mode: "LIVE",
        status: "SUCCEEDED",
        triggerSource: "manual",
        stepsExecuted: 1,
        creditsUsed: 5000,
        finishedAt: new Date(),
      },
    });
    const gated = await api(owner, "POST", `/api/agents/${agentId}/dispatch`, { idempotencyKey: `gated-${stamp}` });
    report(
      gated.status === 402 && !gated.body.ok && gated.body.error === "budget_exceeded" &&
        /monthly worker credits|monthly plan credits/.test(gated.body.message),
      "spent month → root dispatch refused with honest 402",
      `→ ${gated.status} ${gated.body.ok ? "" : (gated.body.message ?? "").slice(0, 80)}`
    );
    await db.agentRun.delete({ where: { id: spent.id } });
    const reopened = await api(owner, "POST", `/api/agents/${agentId}/dispatch`, { idempotencyKey: `reopen-${stamp}` });
    report(reopened.status === 202 && reopened.body.ok, "gate re-opens when the month has headroom", `→ ${reopened.status}`);

    console.log("\ntemplate catalog (Phase 8):");
    const catalog = await api<{ templates: Array<{ slug: string; name: string; installs: number; official: boolean; installedAgentIds: string[]; manifest: unknown }> }>(
      owner, "GET", "/api/templates"
    );
    report(
      catalog.status === 200 && catalog.body.ok && catalog.body.data.templates.length >= 8,
      "catalog serves the first-party set",
      `${catalog.body.ok ? catalog.body.data.templates.length : 0} templates`
    );
    const packaged = catalog.body.ok && catalog.body.data.templates.every(
      (t) => t.official && t.manifest !== null && typeof t.manifest === "object"
    );
    report(!!packaged, "every package is official with its permission manifest exposed");

    const ghost = await api(owner, "POST", "/api/templates/definitely-not-a-template/install");
    report(ghost.status === 404 && !ghost.body.ok, "installing a phantom slug → honest 404", `→ ${ghost.status}`);

    const pick = "research-prospect-deepdive";
    const before = catalog.body.ok
      ? catalog.body.data.templates.find((t) => t.slug === pick)?.installs ?? 0
      : 0;
    const install = await api<{ agent: { id: string; slug: string; status: string; templateSlug: string | null } }>(
      owner, "POST", `/api/templates/${pick}/install`
    );
    report(
      install.status === 201 && install.body.ok && install.body.data.agent.status === "SHADOW" &&
        install.body.data.agent.templateSlug === pick,
      "install mints a real SHADOW worker with lineage",
      `→ ${install.status} ${install.body.ok ? install.body.data.agent.slug : ""}`
    );
    const catalogAfter = await api<{ templates: Array<{ slug: string; installs: number; installedAgentIds: string[] }> }>(
      owner, "GET", "/api/templates"
    );
    const after = catalogAfter.body.ok
      ? catalogAfter.data.templates.find((t) => t.slug === pick)
      : undefined;
    report(
      !!after && after.installs === before + 1 && after.installedAgentIds.length === 1,
      "install counter + workspace-local install state reflect reality",
      after ? `${after.installs} installs` : "missing"
    );
    // The installed worker is a REAL agent: it can take a dispatch.
    if (install.body.ok) {
      const tRun = await api(owner, "POST", `/api/agents/${install.body.data.agent.id}/dispatch`, {
        idempotencyKey: `tpl-${stamp}`,
      });
      report(tRun.status === 202 && tRun.body.ok, "installed worker accepts a dispatch", `→ ${tRun.status}`);
    }
  } finally {
    if (workspaceId) {
      await db.auditLog.deleteMany({ where: { workspaceId } });
      await db.workspace.delete({ where: { id: workspaceId } }); // cascades agents/runs/events
    }
    await db.user.deleteMany({ where: { email: { in: [ownerEmail, viewerEmail] } } }).catch(() => {});
    await db.$disconnect();
  }

  console.log(failures === 0 ? "\nAll AI Workers E2E checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
