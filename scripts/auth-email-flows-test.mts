/**
 * End-to-end test of the email-token flows against a live deployment:
 *   register (real signup form, progressive-enhancement server action POST)
 *   → email verification link (GET /verify-email/confirm)
 *   → password reset request (real forgot-password form)
 *   → reset submission (real confirm form)
 *   → sign-in with the new password + dashboard access
 * Asserts database truth at every step (user, verification tokens, the
 * auto-provisioned OWNER workspace, LoginEvents), then cleans up.
 *
 * Without RESEND_API_KEY the app logs email links to the server console;
 * this suite reads those tokens straight from the database — exactly what a
 * recipient would click. Delivery itself is covered separately (vercel logs).
 *
 * Usage:
 *   BASE_URL=https://your-app.vercel.app DATABASE_URL=postgres://... \
 *     npx tsx scripts/auth-email-flows-test.mts
 */
import { PrismaClient } from "@prisma/client";

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

function unescapeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Extract every hidden <input> (name → value) from an HTML page. */
function hiddenFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const inputRe = /<input\b[^>]*type="hidden"[^>]*>/g;
  for (const match of html.matchAll(inputRe)) {
    const tag = match[0];
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    const value = /value="([^"]*)"/.exec(tag)?.[1] ?? "";
    if (name) fields[name] = unescapeHtml(value);
  }
  return fields;
}

async function postForm(
  url: string,
  fields: Record<string, string>
): Promise<Response> {
  // Next.js MPA-mode server actions are detected via multipart/form-data.
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  return fetch(url, { method: "POST", redirect: "manual", body: fd });
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

async function main() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const stamp = Date.now().toString(36);
  const email = `e2e-flows+${stamp}@flows.moniclaw.invalid`;
  const password = "flow-password-17!";
  const newPassword = "flow-password-99!";

  let userId: string | null = null;
  let workspaceId: string | null = null;

  try {
    // ── 1 · Register through the real signup form ──────────────────────
    const signupHtml = await (await fetch(`${BASE}/signup`)).text();
    const signupAction = hiddenFields(signupHtml);
    const registerRes = await postForm(`${BASE}/signup`, {
      ...signupAction,
      name: "E2E Flows",
      email,
      password,
    });
    report(
      registerRes.status === 200,
      "signup form accepts the registration POST",
      `→ ${registerRes.status}`
    );
    if (registerRes.status === 200) await registerRes.arrayBuffer();

    const user = await db.user.findUnique({
      where: { email },
      include: { memberships: { include: { workspace: true } } },
    });
    report(!!user, "user row created by registration");
    report(
      !!user && user.emailVerified === null,
      "account starts unverified"
    );
    const ownerMembership = user?.memberships.find((m) => m.role === "OWNER");
    report(
      !!ownerMembership,
      "registration auto-provisions an OWNER workspace",
      ownerMembership ? ownerMembership.workspace.name : "none"
    );
    userId = user?.id ?? null;
    workspaceId = ownerMembership?.workspace.id ?? null;

    const verifyToken = (
      await db.verificationToken.findFirst({
        where: { identifier: `verify:${email}` },
      })
    )?.token;
    report(!!verifyToken, "verification token issued (the emailed link)");

    // ── 2 · Email verification link ────────────────────────────────────
    const confirmRes = await fetch(
      `${BASE}/verify-email/confirm?email=${encodeURIComponent(email)}&token=${encodeURIComponent(verifyToken ?? "")}`
    );
    const confirmHtml = await confirmRes.text();
    report(
      confirmRes.status === 200 && confirmHtml.includes("Email verified"),
      "verification link confirms the account",
      `→ ${confirmRes.status}`
    );
    const verified = await db.user.findUnique({ where: { email } });
    report(!!verified?.emailVerified, "emailVerified timestamp set in DB");
    const verifyLeft = await db.verificationToken.findFirst({
      where: { identifier: `verify:${email}` },
    });
    report(!verifyLeft, "verification token is single-use (consumed)");

    // ── 3 · Password reset request through the real form ───────────────
    const forgotHtml = await (await fetch(`${BASE}/forgot-password`)).text();
    const forgotAction = hiddenFields(forgotHtml);
    const requestRes = await postForm(`${BASE}/forgot-password`, {
      ...forgotAction,
      email,
    });
    report(
      requestRes.status === 200,
      "forgot-password form accepts the request",
      `→ ${requestRes.status}`
    );
    if (requestRes.status === 200) await requestRes.arrayBuffer();
    const resetRow = await db.verificationToken.findFirst({
      where: { identifier: `reset:${email}` },
    });
    report(!!resetRow, "reset token issued (the emailed link)");

    // ── 4 · Submit a new password through the real confirm form ────────
    const resetPageHtml = await (
      await fetch(
        `${BASE}/forgot-password/confirm?email=${encodeURIComponent(email)}&token=${encodeURIComponent(resetRow?.token ?? "")}`
      )
    ).text();
    const resetAction = hiddenFields(resetPageHtml);
    report(
      resetAction.email === email && resetAction.token === resetRow?.token,
      "confirm form carries email + token as hidden inputs"
    );
    const resetRes = await postForm(`${BASE}/forgot-password/confirm`, {
      ...resetAction,
      password: newPassword,
    });
    const resetLocation = resetRes.headers.get("location") ?? "";
    report(
      resetRes.status === 303 && resetLocation.includes("/login"),
      "successful reset redirects to login",
      `${resetRes.status} → ${resetLocation.replace(BASE, "")}`
    );
    const resetLeft = await db.verificationToken.findFirst({
      where: { identifier: `reset:${email}` },
    });
    report(!resetLeft, "reset token is single-use (consumed)");

    // ── 5 · New password signs in; old password is rejected ────────────
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const signIn = async (pw: string) =>
      fetch(`${BASE}/api/auth/callback/credentials`, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookieOf(csrfRes),
        },
        body: new URLSearchParams({ csrfToken, email, password: pw }),
      });

    const newSignIn = await signIn(newPassword);
    const sessionCookie = cookieOf(newSignIn);
    report(
      sessionCookie.includes("authjs.session-token"),
      "sign-in with the reset password"
    );
    const oldSignIn = await signIn(password);
    report(
      !cookieOf(oldSignIn).includes("authjs.session-token"),
      "old password no longer works"
    );

    // ── 6 · Dashboard renders the auto-created workspace ───────────────
    const dashRes = await fetch(`${BASE}/dashboard`, {
      headers: { Cookie: sessionCookie },
    });
    const dashHtml = await dashRes.text();
    report(
      dashRes.status === 200 && dashHtml.includes("E2E Flows"),
      "dashboard loads for the verified, reset account",
      `→ ${dashRes.status}`
    );

    const loginEvents = await db.loginEvent.count({ where: { email, success: true } });
    report(loginEvents >= 1, "successful sign-ins recorded in LoginEvent");
  } finally {
    if (workspaceId) {
      await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    }
    if (userId) {
      await db.loginEvent.deleteMany({ where: { email } }).catch(() => {});
      await db.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await db.$disconnect();
    console.log("  · ephemeral user + workspace cleaned up");
  }

  if (failures > 0) {
    console.error(`\nEmail flows: ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nEmail flows: all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
