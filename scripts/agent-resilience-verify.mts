/**
 * Phase-5 resilience + rate-limit verification (production-safe).
 *
 *   rate limits      — 65 dispatch calls against a DRAFT agent consume the
 *                      agentsRun quota and eventually answer 429 (each 409
 *                      agent_unavailable still counts — rate gate runs first)
 *   failure recovery — inject a zombie RUNNING row + a lost QUEUED row
 *                      (ephemeral workspace), fire the real tick, assert the
 *                      reaper fails the zombie and the rescue requeues +
 *                      executes the lost dispatch
 *
 * Provisions and deletes its own ephemeral workspace. Requires:
 *   BASE_URL  DATABASE_URL  CRON_SECRET
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = process.env.BASE_URL ?? "https://moniclaw.vercel.app";
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

async function main() {
  if (!DATABASE_URL || !CRON_SECRET) {
    console.error("DATABASE_URL and CRON_SECRET are required.");
    process.exit(1);
  }
  const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const stamp = Date.now().toString(36);
  const email = `e2e-resilience+${stamp}@agents.moniclaw.invalid`;
  const password = "e2e-password-91!";
  let workspaceId: string | null = null;

  try {
    const workspace = await db.workspace.create({ data: { name: "E2E Resilience", slug: `e2e-resilience-${stamp}` } });
    workspaceId = workspace.id;
    await db.user.create({
      data: {
        name: "Resilience Owner", email, passwordHash: await bcrypt.hash(password, 12),
        emailVerified: new Date(),
        memberships: { create: { role: "OWNER", workspaceId: workspace.id } },
      },
    });
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const signInRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST", redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieOf(csrfRes) },
      body: new URLSearchParams({ csrfToken, email, password }),
    });
    const cookie = cookieOf(signInRes);

    const agent = await db.agent.create({
      data: {
        workspaceId: workspace.id, name: "Resilience Probe", slug: `probe-${stamp}`,
        description: "Ephemeral probe agent for the rate-limit and recovery battery.",
        status: "DRAFT", workerType: "general",
      },
    });

    console.log("\nrate limit (agentsRun, 60/hour):");
    let first429At = -1;
    let saw409 = false;
    for (let i = 1; i <= 70; i++) {
      const res = await fetch(`${BASE}/api/agents/${agent.id}/dispatch`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{}",
      });
      if (res.status === 409) saw409 = true;
      if (res.status === 429 && first429At === -1) { first429At = i; break; }
      await res.arrayBuffer();
    }
    report(saw409, "DRAFT dispatch returns 409 agent_unavailable while quota lasts");
    report(first429At > 0 && first429At <= 65, "quota enforced → 429 once exhausted", `429 at call #${first429At}`);

    console.log("\nfailure recovery via the production tick:");
    const now = Date.now();
    const zombie = await db.agentRun.create({
      data: {
        agentId: agent.id, workspaceId: workspace.id, mode: "LIVE", triggerSource: "probe",
        status: "RUNNING", startedAt: new Date(now - 20 * 60_000), budgetSnapshot: { maxDurationMs: 60_000 },
        progress: { goal: "zombie" }, stepsExecuted: 3,
      },
    });
    const lost = await db.agentRun.create({
      data: {
        agentId: agent.id, workspaceId: workspace.id, mode: "LIVE", triggerSource: "probe",
        status: "QUEUED", createdAt: new Date(now - 5 * 60_000), budgetSnapshot: {},
        progress: { goal: "Rescued run — planner will fail honestly without keys." },
      },
    });

    const tickRes = await fetch(`${BASE}/api/agents/tick`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    const tickBody = (await tickRes.json()) as { ok: boolean; data?: { reaped: number; requeued: number } };
    report(
      tickRes.status === 200 && tickBody.ok && (tickBody.data?.reaped ?? 0) >= 1,
      "tick reaps the zombie RUNNING row",
      `reaped=${tickBody.data?.reaped ?? "?"}`
    );
    report(
      tickRes.status === 200 && tickBody.ok && (tickBody.data?.requeued ?? 0) >= 1,
      "tick rescues the lost QUEUED row",
      `requeued=${tickBody.data?.requeued ?? "?"}`
    );

    const zombieAfter = await db.agentRun.findUniqueOrThrow({ where: { id: zombie.id } });
    report(
      zombieAfter.status === "FAILED" && zombieAfter.errorClass === "budget_exceeded",
      "zombie terminates FAILED / budget_exceeded with evidence",
      `${zombieAfter.status} · ${zombieAfter.errorClass}`
    );

    // The rescued row gets a fresh job: QUEUED → RUNNING → terminal.
    const deadline = Date.now() + 90_000;
    let rescued = await db.agentRun.findUniqueOrThrow({ where: { id: lost.id } });
    while (Date.now() < deadline && !["SUCCEEDED", "FAILED", "CANCELED"].includes(rescued.status)) {
      await new Promise((r) => setTimeout(r, 1_500));
      rescued = await db.agentRun.findUniqueOrThrow({ where: { id: lost.id } });
    }
    report(
      ["SUCCEEDED", "FAILED"].includes(rescued.status),
      "rescued row executes to terminal (at-most-once via transition guard)",
      `${rescued.status} · ${rescued.errorClass ?? "clean"}`
    );
    const events = await db.runEvent.count({ where: { runId: lost.id } });
    report(events > 0, "rescued run carries its evidence trail", `events=${events}`);
  } finally {
    if (workspaceId) {
      await db.auditLog.deleteMany({ where: { workspaceId } });
      await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    }
    await db.user.deleteMany({ where: { email } }).catch(() => {});
    await db.$disconnect();
  }

  console.log(failures === 0 ? "\nAll resilience checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
