/**
 * Phase 9 end-to-end governance battery against a live deployment.
 *
 * Proves, on production infrastructure:
 *   1. Settings → Access & launch seats renders real platform counts + cap.
 *   2. GET /api/audit-logs/export streams valid NDJSON (audited itself).
 *   3. The DURABLE rate limiter trips deterministically across serverless
 *      instances: 12 successful exports (shared bucket, one Postgres row),
 *      the 13th is a hard 429 — sequential requests spread across instances
 *      would never trip a per-instance limiter.
 *
 * Usage:
 *   BASE_URL=https://your-app.vercel.app DATABASE_URL=postgres://... \
 *     npx tsx scripts/governance-e2e-test.mts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DATABASE_URL = process.env.DATABASE_URL;
const EXPORT_LIMIT = 12; // RATE_LIMITS.export

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
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(2);
  }
  const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

  const email = `gov+${Date.now()}@smoke.moniclaw.invalid`;
  const password = "gov-password-91!";
  let userId: string | null = null;
  let workspaceId: string | null = null;

  try {
    console.log("\n— Phase 9 · Governance E2E —\n");

    // 0 · Ephemeral principal (OWNER → audit.read capable).
    const user = await db.user.create({
      data: {
        name: "Governance E2E",
        email,
        passwordHash: await bcrypt.hash(password, 12),
        emailVerified: new Date(),
        memberships: {
          create: {
            role: "OWNER",
            workspace: {
              create: { name: "Governance E2E WS", slug: `gov-${Date.now().toString(36)}` },
            },
          },
        },
      },
      include: { memberships: true },
    });
    userId = user.id;
    workspaceId = user.memberships[0]!.workspaceId;
    report(true, "ephemeral owner + workspace provisioned");

    // 1 · Sign in through the real Auth.js HTTP surface.
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const csrfCookie = cookieOf(csrfRes);
    const signInRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookie },
      body: new URLSearchParams({ csrfToken, email, password }),
    });
    const sessionCookie = cookieOf(signInRes);
    report(
      [200, 302].includes(signInRes.status) && sessionCookie.includes("authjs.session-token"),
      "signed in via Auth.js credentials",
      `status ${signInRes.status}`
    );

    // 2 · Settings page surfaces the launch-seat meter.
    const settingsRes = await fetch(`${BASE}/dashboard/settings`, {
      headers: { Cookie: sessionCookie },
    });
    const settingsHtml = await settingsRes.text();
    // React splits interpolated text nodes with <!-- --> markers — strip
    // them before asserting on rendered copy.
    const settingsText = settingsHtml.replace(/<!-- -->/g, "");
    report(settingsRes.status === 200, "GET /dashboard/settings → 200", `→ ${settingsRes.status}`);
    report(/Access (&amp;|&) launch seats/.test(settingsHtml), "seats card renders");
    const capMatch = settingsText.match(/of (\d+) launch seats remain/);
    report(!!capMatch, "seat cap displayed", capMatch ? `cap ${capMatch[1]}` : "cap line missing");
    report(/launch seats remain/.test(settingsHtml) && /progressbar/.test(settingsHtml), "seat progress meter present");

    // 3 · Audit export: valid NDJSON, self-audited.
    const exportRes = await fetch(`${BASE}/api/audit-logs/export`, {
      headers: { Cookie: sessionCookie },
    });
    report(exportRes.status === 200, "audit export → 200", `→ ${exportRes.status}`);
    const ctype = exportRes.headers.get("content-type") ?? "";
    report(ctype.includes("application/x-ndjson"), "NDJSON content type", ctype.split(";")[0]!);
    const body = await exportRes.text();
    const lines = body.trim().split("\n").filter(Boolean);
    let allParsed = true;
    let sawSelfAudit = false;
    for (const line of lines) {
      try {
        const evt = JSON.parse(line) as { action?: string; id?: string };
        if (!evt.action && !evt.type) allParsed = false;
        if (evt.action === "audit.export") sawSelfAudit = true;
      } catch {
        allParsed = false;
      }
    }
    report(allParsed && lines.length >= 1, "every line parses as JSON", `${lines.length} event(s)`);
    report(sawSelfAudit, "export is itself audited (audit.export in stream)");

    // 4 · Durable rate limiter: EXPORT_LIMIT passes, the next one is a hard 429.
    let successes = 0;
    let blocked: { status: number; error: string; message: string } | null = null;
    for (let i = 0; i < EXPORT_LIMIT + 3; i++) {
      const res = await fetch(`${BASE}/api/audit-logs/export`, {
        headers: { Cookie: sessionCookie },
      });
      if (res.status === 429) {
        const payload = (await res.json()) as { error?: string; message?: string };
        blocked = { status: 429, error: payload.error ?? "", message: payload.message ?? "" };
        break;
      }
      if (res.status === 200) {
        successes++;
        await res.text(); // drain the stream
      } else {
        report(false, `export call ${i + 1} unexpected status`, `→ ${res.status}`);
        break;
      }
    }
    // Step 3's export already consumed one slot in the same fresh window, so
    // the loop must see exactly EXPORT_LIMIT - 1 more successes before 429.
    report(
      successes === EXPORT_LIMIT - 1 && blocked !== null,
      `durable bucket: exactly ${EXPORT_LIMIT} allowed in the window, then blocked`,
      `successes=${successes + 1} total${blocked ? " then 429" : " (never blocked!)"}`
    );
    if (blocked) {
      report(blocked.error === "rate_limited" && /retry in \d+s/.test(blocked.message), "429 envelope is honest", blocked.message);
    }

    // 5 · Authz: unauthenticated export is refused.
    const anonRes = await fetch(`${BASE}/api/audit-logs/export`);
    report(anonRes.status === 401, "anonymous export → 401", `→ ${anonRes.status}`);
  } catch (err) {
    failures++;
    console.error("FATAL", err);
  } finally {
    // Cleanup: workspace cascades (audits, memberships); rate-limit bucket
    // rows keyed by this workspace are reaped by the daily cron.
    if (workspaceId) {
      await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    }
    if (userId) {
      await db.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await db.$disconnect();
  }

  console.log(failures === 0 ? "\nAll governance checks passed.\n" : `\n${failures} governance check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
