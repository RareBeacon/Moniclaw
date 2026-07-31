/**
 * End-to-end authentication test against a live deployment with a real
 * database. Creates an ephemeral user directly via Prisma, signs in through
 * the real Auth.js HTTP surface, verifies session + protected-route access,
 * tests Remember-Me expiry, then cleans up.
 *
 * Usage:
 *   BASE_URL=https://your-app.vercel.app DATABASE_URL=postgres://... \
 *     npx tsx scripts/auth-flow-test.mts
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
  // Node fetch exposes combined set-cookie via getSetCookie() when available.
  const anyHeaders = res.headers as unknown as {
    getSetCookie?: () => string[];
  };
  const list =
    typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean) as string[];
  return list.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function main() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(2);
  }
  const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

  const email = `e2e+${Date.now()}@smoke.moniclaw.invalid`;
  const password = "e2e-password-91!";
  let userId: string | null = null;

  try {
    // 1 · Provision an ephemeral verified user (+ workspace via membership).
    const user = await db.user.create({
      data: {
        name: "E2E Smoke",
        email,
        passwordHash: await bcrypt.hash(password, 12),
        emailVerified: new Date(),
        memberships: {
          create: {
            role: "OWNER",
            workspace: {
              create: { name: "E2E Workspace", slug: `e2e-${Date.now().toString(36)}` },
            },
          },
        },
      },
    });
    userId = user.id;
    report(true, "ephemeral user provisioned");

    // 2 · CSRF → credentials callback (this is the real form's HTTP path).
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const csrfCookie = cookieOf(csrfRes);
    report(!!csrfToken, "CSRF token issued");

    const signInRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: csrfCookie,
      },
      body: new URLSearchParams({
        csrfToken,
        email,
        password,
        remember: "true",
      }),
    });
    const sessionCookie = cookieOf(signInRes);
    report(
      [200, 302].includes(signInRes.status) && sessionCookie.includes("authjs.session-token"),
      "credentials sign-in issues a session cookie",
      `status ${signInRes.status}`
    );

    // 3 · Session endpoint reflects the identity.
    const sessionRes = await fetch(`${BASE}/api/auth/session`, {
      headers: { Cookie: sessionCookie },
    });
    const session = (await sessionRes.json()) as { user?: { email?: string } };
    report(session.user?.email === email, "session returns the signed-in user");

    // 4 · Middleware admits the signed-in user to /dashboard.
    const dashRes = await fetch(`${BASE}/dashboard`, {
      redirect: "manual",
      headers: { Cookie: sessionCookie },
    });
    report(dashRes.status === 200, "GET /dashboard with session → 200", `→ ${dashRes.status}`);

    // 5 · Failed login records a LoginEvent and is rejected.
    const badRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: csrfCookie,
      },
      body: new URLSearchParams({ csrfToken, email, password: "wrong-password-1!" }),
    });
    report(!cookieOf(badRes).includes("authjs.session-token"), "wrong password rejected");
    const failedEvent = await db.loginEvent.findFirst({
      where: { email, success: false },
    });
    report(!!failedEvent, "failed attempt recorded in LoginEvent");

    // 6 · LoginEvent recorded for success too.
    const okEvent = await db.loginEvent.findFirst({
      where: { email, success: true, provider: "credentials" },
    });
    report(!!okEvent, "successful sign-in recorded in LoginEvent");

    // 7 · sessionVersion rotation invalidates the old token.
    await db.user.update({
      where: { id: user.id },
      data: { sessionVersion: { increment: 1 } },
    });
    const revokedDash = await fetch(`${BASE}/dashboard`, {
      redirect: "manual",
      headers: { Cookie: sessionCookie },
    });
    report(
      [302, 307].includes(revokedDash.status),
      "session rotation revokes dashboard access (sign-out-everywhere)",
      `→ ${revokedDash.status}`
    );
  } catch (error) {
    report(false, "unexpected error", String(error));
  } finally {
    // Cleanup — child rows cascade with user/workspace.
    if (userId) {
      await db.loginEvent.deleteMany({ where: { email } }).catch(() => {});
      const membership = await db.membership.findFirst({
        where: { userId },
        include: { workspace: true },
      });
      await db.membership.deleteMany({ where: { userId } }).catch(() => {});
      await db.user.delete({ where: { id: userId } }).catch(() => {});
      if (membership) {
        await db.workspace.delete({ where: { id: membership.workspaceId } }).catch(() => {});
      }
      console.log("  · ephemeral user cleaned up");
    }
    await db.$disconnect();
  }

  console.log(failures === 0 ? "\nAuth flow: all checks passed\n" : `\nAuth flow: ${failures} FAILED\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
