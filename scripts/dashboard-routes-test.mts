/**
 * End-to-end dashboard routing test against a live deployment with a real
 * database. Provisions an ephemeral workspace (OWNER + VIEWER) with one of
 * each core record, signs in through the real Auth.js HTTP surface, then
 * requests every dashboard route. Asserts:
 *   • every route returns 200 for the owner (no compile/runtime errors)
 *   • run detail and knowledge detail resolve their dynamic segments
 *   • RBAC: a VIEWER receives the AccessDenied state on a gated page
 * Then cleans up all provisioned data.
 *
 * Usage:
 *   BASE_URL=https://your-app.vercel.app DATABASE_URL=postgres://... \
 *     npx tsx scripts/dashboard-routes-test.mts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
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
  const anyHeaders = res.headers as unknown as {
    getSetCookie?: () => string[];
  };
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

async function main() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const stamp = Date.now().toString(36);
  const ownerEmail = `e2e-owner+${stamp}@routes.moniclaw.invalid`;
  const viewerEmail = `e2e-viewer+${stamp}@routes.moniclaw.invalid`;
  const password = "e2e-password-91!";
  const passwordHash = await bcrypt.hash(password, 12);

  let workspaceId: string | null = null;
  const userIds: string[] = [];

  try {
    // 1 · Provision workspace with OWNER + VIEWER plus one of each record.
    const workspace = await db.workspace.create({
      data: { name: "E2E Routes", slug: `e2e-routes-${stamp}` },
    });
    workspaceId = workspace.id;

    const owner = await db.user.create({
      data: {
        name: "E2E Owner",
        email: ownerEmail,
        passwordHash,
        emailVerified: new Date(),
        memberships: { create: { role: "OWNER", workspaceId: workspace.id } },
      },
    });
    const viewer = await db.user.create({
      data: {
        name: "E2E Viewer",
        email: viewerEmail,
        passwordHash,
        emailVerified: new Date(),
        memberships: { create: { role: "VIEWER", workspaceId: workspace.id } },
      },
    });
    userIds.push(owner.id, viewer.id);

    const agent = await db.agent.create({
      data: {
        workspaceId: workspace.id,
        name: "E2E Agent",
        slug: `e2e-agent-${stamp}`,
        description: "Provisioned by the dashboard routing test.",
        status: "SUPERVISED",
      },
    });
    const run = await db.agentRun.create({
      data: {
        workspaceId: workspace.id,
        agentId: agent.id,
        status: "SUCCEEDED",
        triggerSource: "e2e",
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
    const entry = await db.knowledgeEntry.create({
      data: {
        workspaceId: workspace.id,
        createdById: owner.id,
        title: "E2E entry",
        body: "Provisioned by the dashboard routing test.",
        tags: ["e2e"],
      },
    });
    const browserSession = await db.browserSession.create({
      data: {
        workspaceId: workspace.id,
        userId: owner.id,
        status: "CLOSED",
        currentUrl: "https://example.com",
        currentTitle: "E2E provisioned session",
        closedAt: new Date(),
      },
    });
    const browserExecution = await db.browserExecution.create({
      data: {
        workspaceId: workspace.id,
        userId: owner.id,
        sessionId: browserSession.id,
        status: "SUCCEEDED",
        plan: { label: "E2E provisioned plan", steps: [] },
        result: { status: "SUCCEEDED", progress: { completed: 0, total: 0 } },
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
    report(true, "ephemeral workspace provisioned", "owner + viewer + records");

    // 2 · Owner session visits every dashboard route.
    const ownerCookie = await signIn(ownerEmail, password);
    report(
      ownerCookie.includes("authjs.session-token"),
      "owner signed in via real auth surface"
    );

    const routes: Array<[string, string]> = [
      ["/dashboard", "Overview"],
      ["/dashboard/agents", "Agents"],
      ["/dashboard/agents/new", "New agent"],
      ["/dashboard/runs", "Runs"],
      [`/dashboard/runs/${run.id}`, "Run detail"],
      ["/dashboard/approvals", "Approvals"],
      ["/dashboard/knowledge", "Knowledge"],
      [`/dashboard/knowledge/${entry.id}`, "Knowledge detail"],
      ["/dashboard/files", "Files"],
      ["/dashboard/usage", "Usage"],
      ["/dashboard/analytics", "Analytics"],
      ["/dashboard/audit-logs", "Audit logs"],
      ["/dashboard/members", "Members"],
      ["/dashboard/billing", "Billing"],
      ["/dashboard/api-keys", "API keys"],
      ["/dashboard/settings", "Settings"],
      ["/dashboard/profile", "Profile"],
      ["/dashboard/playground", "AI Playground"],
      ["/dashboard/memory", "Memory Explorer"],
      ["/dashboard/prompts", "Prompt Manager"],
      ["/dashboard/workflows", "Workflow Builder"],
      ["/dashboard/ai-providers", "AI Providers"],
      ["/dashboard/browser", "Browser Sessions"],
      ["/dashboard/browser/live", "Live Execution"],
      ["/dashboard/browser/recordings", "Recordings"],
      [`/dashboard/browser/recordings/${browserExecution.id}`, "Recording detail"],
      ["/dashboard/browser/history", "Execution History"],
      ["/dashboard/browser/downloads", "Downloads"],
      ["/dashboard/browser/uploads", "Uploads"],
      ["/dashboard/browser/screenshots", "Screenshots"],
      ["/dashboard/browser/permissions", "Browser Policy"],
      ["/dashboard/browser/settings", "Engine Settings"],
    ];

    console.log("\nowner route sweep:");
    for (const [path, label] of routes) {
      const res = await fetch(`${BASE}${path}`, {
        redirect: "manual",
        headers: { Cookie: ownerCookie },
      });
      report(res.status === 200, `${label} (${path})`, `→ ${res.status}`);
      if (res.status === 200) await res.arrayBuffer(); // drain
    }

    // 3 · RBAC negative check: viewer is denied the audit log page content.
    const viewerCookie = await signIn(viewerEmail, password);
    report(
      viewerCookie.includes("authjs.session-token"),
      "viewer signed in via real auth surface"
    );
    const gatedRes = await fetch(`${BASE}/dashboard/audit-logs`, {
      redirect: "manual",
      headers: { Cookie: viewerCookie },
    });
    const gatedHtml = await gatedRes.text();
    report(
      gatedRes.status === 200 && gatedHtml.includes("Restricted by your role"),
      "RBAC: VIEWER sees AccessDenied on /dashboard/audit-logs",
      `status ${gatedRes.status}`
    );

    // 4 · Viewer still gets the overview (a page their rank can read).
    const overviewRes = await fetch(`${BASE}/dashboard`, {
      redirect: "manual",
      headers: { Cookie: viewerCookie },
    });
    report(
      overviewRes.status === 200,
      "RBAC: VIEWER can read the overview",
      `→ ${overviewRes.status}`
    );
    if (overviewRes.status === 200) await overviewRes.arrayBuffer();
  } finally {
    // Provisioned data is removed in dependency order; workspaces cascade.
    if (workspaceId) {
      await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    }
    for (const id of userIds) {
      await db.user.delete({ where: { id } }).catch(() => {});
    }
    await db.$disconnect();
    console.log("  · ephemeral workspace cleaned up");
  }

  if (failures > 0) {
    console.error(`\nDashboard routing: ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nDashboard routing: all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
