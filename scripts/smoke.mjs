#!/usr/bin/env node
/**
 * HTTP smoke suite — verifies routing, middleware guards, headers, and the
 * auth API surface against a running server.
 *
 * Usage:  BASE_URL=http://localhost:3000 npm run smoke
 *
 * Database note: one check (the invite page) renders from Postgres. When
 * DATABASE_URL is set the script probes that host:port over TCP first; if
 * the database is unreachable the check is reported as SKIPPED instead of
 * failed, because a DB outage would legitimately 500 that page.
 */
import net from "node:net";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let failures = 0;
let passes = 0;

function report(ok, name, detail = "") {
  if (ok) {
    passes++;
    console.log(`  ✓ ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? `  (${detail})` : ""}`);
  }
}

function skip(name, reason) {
  passes++;
  console.log(`  ↷ ${name} — SKIPPED (${reason})`);
}

function probeDatabase(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const raw = process.env.DATABASE_URL;
    if (!raw) return resolve(false);
    let host = "localhost";
    let port = 5432;
    try {
      const url = new URL(raw);
      host = url.hostname || host;
      port = Number(url.port) || port;
    } catch {
      return resolve(false);
    }
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function get(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", ...opts });
  return res;
}

async function expectStatus(name, path, status) {
  try {
    const res = await get(path);
    report(res.status === status, name, `GET ${path} → ${res.status}`);
    return res;
  } catch (error) {
    report(false, name, String(error));
    return null;
  }
}

async function main() {
  console.log(`\nSmoke testing ${BASE}\n`);

  console.log("marketing routes:");
  for (const path of [
    "/",
    "/features",
    "/pricing",
    "/about",
    "/docs",
    "/blog",
    "/blog/the-end-of-swivel-chair-work",
    "/contact",
    "/legal/privacy",
    "/legal/terms",
  ]) {
    await expectStatus(`200 ${path}`, path, 200);
  }

  console.log("\nauth pages:");
  for (const path of ["/login", "/signup", "/forgot-password", "/verify-email"]) {
    await expectStatus(`200 ${path}`, path, 200);
  }
  const dbReachable = await probeDatabase();
  if (dbReachable) {
    await expectStatus("invite page renders for bogus token", "/invite/not-a-real-token", 200);
  } else {
    skip("invite page renders for bogus token", "DATABASE_URL unset or database unreachable");
  }

  console.log("\nmiddleware guards (anonymous):");
  for (const path of ["/dashboard", "/dashboard/agents", "/dashboard/members", "/dashboard/profile"]) {
    const res = await get(path);
    const location = res.headers.get("location") ?? "";
    report(
      (res.status === 302 || res.status === 307) && location.includes("/login"),
      `${path} redirects to login`,
      `${res.status} → ${location.replace(BASE, "")}`
    );
  }

  console.log("\nauth API surface:");
  const providers = await get("/api/auth/providers");
  const providersJson = providers.status === 200 ? await providers.json() : {};
  report(providers.status === 200, "GET /api/auth/providers → 200");
  report("credentials" in providersJson, "credentials provider registered");
  const csrf = await get("/api/auth/csrf");
  const csrfJson = csrf.status === 200 ? await csrf.json() : {};
  report(!!csrfJson.csrfToken, "GET /api/auth/csrf issues a token");

  console.log("\nasset authorization:");
  const asset = await get("/api/assets/00000000-0000-0000-0000-000000000000");
  report(asset.status === 401, "asset route requires authentication", `→ ${asset.status}`);

  console.log("\nAI surfaces — middleware guards (anonymous):");
  for (const path of [
    "/dashboard/playground",
    "/dashboard/memory",
    "/dashboard/prompts",
    "/dashboard/workflows",
    "/dashboard/ai-providers",
  ]) {
    const res = await get(path);
    const location = res.headers.get("location") ?? "";
    report(
      (res.status === 302 || res.status === 307) && location.includes("/login"),
      `${path} redirects to login`,
      `${res.status}`
    );
  }

  console.log("\nAI REST API — unauthenticated rejection:");
  for (const [method, path] of [
    ["POST", "/api/ai/chat"],
    ["GET", "/api/ai/conversations"],
    ["GET", "/api/ai/memory"],
    ["POST", "/api/ai/embeddings"],
    ["GET", "/api/ai/knowledge/documents"],
    ["GET", "/api/ai/providers"],
    ["GET", "/api/ai/workflows"],
    ["GET", "/api/ai/usage"],
    ["GET", "/api/cron/memory-sweep"],
  ]) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "POST" ? { body: "{}" } : {}),
      });
      // 401 (no principal) or 503 (cron without CRON_SECRET) — both are the
      // designed "closed door"; a 200/301/404 here would be a wiring bug.
      const closed = res.status === 401 || (path.includes("cron") && res.status === 503);
      report(closed, `${method} ${path} rejects anonymous`, `→ ${res.status}`);
    } catch (error) {
      report(false, `${method} ${path} rejects anonymous`, String(error));
    }
  }

  console.log("\nComputer Use — dashboard guards (anonymous):");
  for (const path of [
    "/dashboard/browser",
    "/dashboard/browser/live",
    "/dashboard/browser/recordings",
    "/dashboard/browser/history",
    "/dashboard/browser/downloads",
    "/dashboard/browser/uploads",
    "/dashboard/browser/screenshots",
    "/dashboard/browser/permissions",
    "/dashboard/browser/settings",
  ]) {
    const res = await get(path);
    const location = res.headers.get("location") ?? "";
    report(
      (res.status === 302 || res.status === 307) && location.includes("/login"),
      `${path} redirects to login`,
      `${res.status}`
    );
  }

  console.log("\nComputer Use REST API — unauthenticated rejection:");
  for (const [method, path] of [
    ["GET", "/api/browser/health"],
    ["GET", "/api/browser/sessions"],
    ["POST", "/api/browser/sessions"],
    ["GET", "/api/browser/actions"],
    ["POST", "/api/browser/actions"],
    ["GET", "/api/browser/executions"],
    ["POST", "/api/browser/executions"],
    ["GET", "/api/browser/downloads"],
    ["GET", "/api/browser/uploads"],
    ["POST", "/api/browser/uploads"],
    ["GET", "/api/browser/screenshots"],
    ["GET", "/api/browser/logs"],
    ["GET", "/api/browser/permissions"],
    ["PUT", "/api/browser/permissions"],
    ["GET", "/api/browser/settings"],
    ["GET", "/api/browser/profiles"],
    ["POST", "/api/browser/profiles"],
    ["GET", "/api/browser/executions/00000000-0000-0000-0000-000000000000/stream"],
    ["POST", "/api/browser/sessions/sweep"],
  ]) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "POST" || method === "PUT" ? { body: "{}" } : {}),
      });
      // 401 (no principal / no cron secret) is the designed closed door.
      report(res.status === 401, `${method} ${path} rejects anonymous`, `→ ${res.status}`);
    } catch (error) {
      report(false, `${method} ${path} rejects anonymous`, String(error));
    }
  }

  console.log("\nComputer Use REST API — malformed bearer key:");
  const badBrowserKey = await fetch(`${BASE}/api/browser/sessions`, {
    headers: { Authorization: "Bearer msk_not_a_real_key" },
  });
  report(
    badBrowserKey.status === 401,
    "GET /api/browser/sessions rejects unknown msk_ key",
    `→ ${badBrowserKey.status}`
  );

  console.log("\nAI REST API — malformed bearer key:");
  const badKey = await fetch(`${BASE}/api/ai/usage`, {
    headers: { Authorization: "Bearer msk_not_a_real_key" },
  });
  report(badKey.status === 401, "GET /api/ai/usage rejects unknown msk_ key", `→ ${badKey.status}`);

  console.log("\nAI Workers — dashboard guards (anonymous):");
  for (const path of ["/dashboard/agents", "/dashboard/agents/new"]) {
    const res = await get(path);
    const location = res.headers.get("location") ?? "";
    report(
      (res.status === 302 || res.status === 307) && location.includes("/login"),
      `${path} redirects to login`,
      `${res.status}`
    );
  }

  console.log("\nAI Workers REST API — unauthenticated rejection:");
  for (const [method, path] of [
    ["GET", "/api/agents"],
    ["POST", "/api/agents"],
    ["GET", "/api/agents/health"],
    ["GET", "/api/agents/runs"],
    ["POST", "/api/agents/00000000-0000-0000-0000-000000000000/dispatch"],
    ["GET", "/api/agents/runs/00000000-0000-0000-0000-000000000000"],
    ["POST", "/api/agents/runs/00000000-0000-0000-0000-000000000000/cancel"],
    ["POST", "/api/agents/runs/00000000-0000-0000-0000-000000000000/resume"],
    ["GET", "/api/agents/runs/00000000-0000-0000-0000-000000000000/events"],
    ["GET", "/api/agents/runs/00000000-0000-0000-0000-000000000000/stream"],
    ["POST", "/api/agents/tick"],
  ]) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "POST" ? { body: "{}" } : {}),
      });
      // 401 (no principal / no cron secret) is the designed closed door.
      report(res.status === 401, `${method} ${path} rejects anonymous`, `→ ${res.status}`);
    } catch (error) {
      report(false, `${method} ${path} rejects anonymous`, String(error));
    }
  }

  console.log("\n404 handling:");
  await expectStatus("unknown route 404s", "/definitely-not-a-page-9e3f", 404);

  console.log("\nsecurity headers:");
  const home = await get("/");
  report(home.headers.get("x-content-type-options") === "nosniff", "x-content-type-options: nosniff");
  report(home.headers.get("x-frame-options") === "SAMEORIGIN", "x-frame-options: SAMEORIGIN");
  report(
    (home.headers.get("referrer-policy") ?? "").includes("strict-origin"),
    "referrer-policy set"
  );

  console.log(`\n${passes} passed, ${failures} failed\n`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
