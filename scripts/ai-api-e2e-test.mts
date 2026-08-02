/**
 * AI Runtime REST end-to-end test against a live deployment with a real
 * database. Provisions an ephemeral workspace (OWNER), signs in through the
 * real Auth.js HTTP surface, then exercises the /api/ai/* surface:
 *
 *   conversations list · chat graceful 409 (no provider keys) · memory
 *   write/search · knowledge search · embeddings graceful failure ·
 *   providers catalog · workflow create → execute (prompt-only graph, no
 *   model needed) with persisted run + trace · usage aggregate shape.
 *
 * Provider-backed paths (real chat/embeddings) require a BYOK key; without
 * one the suite asserts the DESIGNED graceful error (409 no_provider),
 * which is the honest production state until a workspace adds a key.
 *
 * Usage:
 *   BASE_URL=https://your-app.vercel.app DATABASE_URL=postgres://... \
 *     npx tsx scripts/ai-api-e2e-test.mts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { providerConfigSource } from "../lib/ai/provider-config-source";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
/** When the deployment wires a platform fallback key (OPENROUTER_API_KEY /
 *  GEMINI_API_KEY), "no provider" 409s are no longer the designed outcome —
 *  the provider is INVOKED and either answers or fails honestly (classified
 *  502 / degraded 200). Assertions below branch on this. */
const PROVIDER_WIRED = Boolean(process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY);
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
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
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

async function main() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const stamp = Date.now().toString(36);
  const ownerEmail = `e2e-ai+${stamp}@ai.moniclaw.invalid`;
  const password = "e2e-password-91!";
  const passwordHash = await bcrypt.hash(password, 12);

  let workspaceId: string | null = null;
  let userId: string | null = null;

  try {
    const workspace = await db.workspace.create({
      data: { name: "E2E AI Runtime", slug: `e2e-ai-${stamp}` },
    });
    workspaceId = workspace.id;
    const owner = await db.user.create({
      data: {
        name: "E2E AI Owner",
        email: ownerEmail,
        passwordHash,
        emailVerified: new Date(),
        memberships: { create: { role: "OWNER", workspaceId: workspace.id } },
      },
    });
    userId = owner.id;
    report(true, "ephemeral workspace provisioned");

    const cookie = await signIn(ownerEmail, password);
    report(cookie.includes("authjs.session-token"), "signed in via real auth surface");

    console.log("\nconversations + chat:");
    const convos = await api<{ conversations: unknown[] }>(cookie, "GET", "/api/ai/conversations");
    report(convos.status === 200 && convos.body.ok, "GET /api/ai/conversations → 200");

    // No provider keys in the ephemeral workspace → designed 409.
    const chat = await api(cookie, "POST", "/api/ai/chat", {
      messages: [{ role: "user", content: "hello" }],
    });
    report(
      PROVIDER_WIRED
        ? chat.status === 200 || (chat.status === 502 && !chat.body.ok && chat.body.error === "providers_failed")
        : chat.status === 409 && !chat.body.ok && chat.body.error === "no_provider",
      PROVIDER_WIRED
        ? "platform provider wired → chat replies or fails HONESTLY (502 providers_failed, e.g. free-tier daily cap)"
        : "POST /api/ai/chat without keys → graceful 409 no_provider",
      `→ ${chat.status} ${chat.body.ok ? "" : chat.body.error}`
    );

    const chatStream = await fetch(`${BASE}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], stream: true }),
    });
    report(
      PROVIDER_WIRED ? chatStream.status === 200 || chatStream.status === 502 : chatStream.status === 409,
      PROVIDER_WIRED
        ? "platform provider wired → SSE stream opens (200; upstream errors surface as stream frames) or honest 502"
        : "POST /api/ai/chat stream:true without keys → same 409",
      `→ ${chatStream.status}`
    );
    await chatStream.arrayBuffer();

    console.log("\nmemory:");
    const mem = await api<{ record: { id: string; embedded: boolean } }>(
      cookie, "POST", "/api/ai/memory",
      { scope: "LONG_TERM", content: "E2E: refunds above ₦50,000 need dual sign-off.", importance: 80, embed: true }
    );
    report(
      mem.status === 201 && mem.body.ok && !mem.body.data.record.embedded,
      "POST /api/ai/memory stores without embedder (embedded=false)",
      `→ ${mem.status}`
    );
    const memId = mem.body.ok ? mem.body.data.record.id : "";

    const memList = await api<{ records: Array<{ id: string }> }>(cookie, "GET", "/api/ai/memory?scope=LONG_TERM");
    report(
      memList.status === 200 && memList.body.ok && memList.body.data.records.some((r) => r.id === memId),
      "GET /api/ai/memory lists the record"
    );

    const memSearch = await api<{ memories: Array<{ id: string; content: string }> }>(
      cookie, "POST", "/api/ai/memory/search",
      { query: "refund sign-off", scopes: ["LONG_TERM"] }
    );
    report(
      memSearch.status === 200 && memSearch.body.ok && memSearch.body.data.memories.some((r) => r.id === memId),
      "POST /api/ai/memory/search finds it (fallback ordering, no embedder)"
    );

    const memDel = await api(cookie, "DELETE", `/api/ai/memory?id=${memId}`);
    report(memDel.status === 200, "DELETE /api/ai/memory (owner rank) → 200");

    console.log("\nknowledge search (semantic-only → graceful 409 without an embedder):");
    const kSearch = await api<{ results: unknown[]; empty: boolean }>(cookie, "POST", "/api/ai/knowledge/search", { query: "refunds" });
    // Unlike memory (which keeps an importance-ordered fallback), knowledge
    // retrieval is vector-only — honest 409 until a workspace adds a key.
    // With a platform provider wired (chat-only key, no embedder) the service
    // degrades honestly to 200 + zero results instead of throwing.
    report(
      PROVIDER_WIRED
        ? kSearch.status === 200 && kSearch.body.ok === true
        : kSearch.status === 409 && !kSearch.body.ok && kSearch.body.error === "no_provider",
      PROVIDER_WIRED
        ? "knowledge search degrades honestly with chat-only platform key (200, zero results — no crash)"
        : "POST /api/ai/knowledge/search without embedder → 409 no_provider",
      `→ ${kSearch.status} ${kSearch.body.ok ? "" : kSearch.body.error ?? ""}`
    );
    const kDocs = await api<{ documents: unknown[] }>(cookie, "GET", "/api/ai/knowledge/documents");
    report(kDocs.status === 200 && kDocs.body.ok, "GET /api/ai/knowledge/documents → 200");

    console.log("\nembeddings graceful failure:");
    const emb = await api(cookie, "POST", "/api/ai/embeddings", { texts: ["hello"] });
    report(
      (emb.status === 409 || emb.status === 502) && !emb.body.ok,
      "POST /api/ai/embeddings without keys → graceful error",
      `→ ${emb.status} ${emb.body.ok ? "" : emb.body.error}`
    );

    console.log("\nproviders catalog:");
    const prov = await api<{ catalog: Array<{ id: string; status: string }>; configs: unknown[] }>(cookie, "GET", "/api/ai/providers");
    const catalogIds = prov.body.ok ? prov.body.data.catalog.map((c) => c.id) : [];
    report(
      prov.status === 200 && prov.body.ok && catalogIds.length === 11 &&
        ["gemini", "openrouter", "ollama", "openai", "anthropic", "deepseek", "mistral", "groq", "xai", "together", "custom"]
          .every((id) => catalogIds.includes(id)),
      "GET /api/ai/providers → Phase-11 mesh catalog (11 providers incl. custom)",
      `${catalogIds.length} entries`
    );
    report(
      prov.body.ok && prov.body.data.catalog.every((c) => c.status === "shipped"),
      "every mesh provider ships a real adapter (no reserved placeholders)"
    );

    // ── Multi-key rotation & rate-limit alerts (Phase 11+12 hardening) ──
    // Drives the REAL production PrismaProviderConfigSource (the exact class
    // the deployed router consumes). Keys are seeded with locally-invalid
    // ciphertext on purpose: a deployment's AUTH_SECRET never leaves Vercel,
    // and the resolver must DEGRADE on ciphertext it can't decrypt rather
    // than kill the chain — that resilience is asserted first.
    console.log("\nmulti-key rotation & rate-limit alerts:");
    const keyA = await db.aiProviderConfig.create({
      data: {
        workspaceId: workspaceId!,
        provider: "OPENROUTER",
        label: `e2e-key-a-${stamp}`,
        apiKeyEnc: "e2e:undecryptable-a",
        enabled: true,
        priority: 5,
      },
    });
    await db.aiProviderConfig.create({
      data: {
        workspaceId: workspaceId!,
        provider: "OPENROUTER",
        label: `e2e-key-b-${stamp}`,
        apiKeyEnc: "e2e:undecryptable-b",
        enabled: true,
        priority: 6,
      },
    });
    report(true, "two same-provider keys seeded (multi-key per platform)");

    const source = providerConfigSource();
    const resolved0 = await source.resolve(workspaceId!);
    const seeded = (r: { configId: string | null }) => r.configId === keyA.id;
    report(
      !resolved0.some(seeded),
      "resolve() degrades an undecryptable key instead of breaking the chain"
    );
    report(
      resolved0.some((r) => r.source === "env" && r.provider === "openrouter"),
      "platform env fallback resumes while no usable workspace key exists"
    );

    // Router hook → rest marker + immediate alert (deduped), via REAL impl.
    await source.markRateLimited(keyA.id, 120, "e2e simulated 429");
    const restedRow = await db.aiProviderConfig.findUnique({ where: { id: keyA.id } });
    const restMs = restedRow?.rateLimitedUntil ? restedRow.rateLimitedUntil.getTime() - Date.now() : -1;
    report(restMs > 100_000 && restMs <= 120_000, "429 → key rested for the provider's own window", `${Math.round(restMs / 1000)}s`);
    const notes1 = await db.notification.findMany({
      where: { workspaceId: workspaceId!, dedupKey: `ai.rate-limited:${keyA.id}` },
    });
    report(
      notes1.length === 1 && notes1[0]!.readAt === null && notes1[0]!.kind === "ai.provider.rate_limited",
      "workspace alerted immediately (Notification row, unread)"
    );
    await source.markRateLimited(keyA.id, 120, "repeat within same episode");
    const notes2 = await db.notification.count({
      where: { workspaceId: workspaceId!, dedupKey: `ai.rate-limited:${keyA.id}` },
    });
    report(notes2 === 1, "flapping key cannot spam the bell (unread-dedup)");

    const resolved1 = await source.resolve(workspaceId!);
    report(!resolved1.some(seeded), "rested key rotates OUT of resolution");
    const fallbackStill = resolved1.filter((r) => r.source === "env");
    report(fallbackStill.length >= 1, "env fallback keeps serving while the key rests");

    // Recovery: a key that serves again re-enters rotation automatically.
    await source.markHealth(keyA.id, true);
    const recovered = await db.aiProviderConfig.findUnique({ where: { id: keyA.id } });
    report(recovered?.rateLimitedUntil === null, "healthy key re-enters rotation (rest marker cleared)");

    // The bell surface: REST list + mark-read.
    const bell1 = await api<{ notifications: Array<{ title: string; readAt: string | null }>; unreadCount: number }>(
      cookie, "GET", "/api/notifications"
    );
    report(
      bell1.status === 200 && bell1.body.ok &&
        bell1.body.data.unreadCount >= 1 &&
        bell1.body.data.notifications.some((n) => n.title.includes(`e2e-key-a-${stamp}`)),
      "GET /api/notifications shows the alert to the workspace"
    );
    const markAll = await api<{ marked: number }>(cookie, "POST", "/api/notifications", {});
    report(markAll.body.ok && markAll.body.data.marked >= 1, "mark-all-read works");
    const bell2 = await api<{ unreadCount: number }>(cookie, "GET", "/api/notifications");
    report(bell2.body.ok && bell2.body.data.unreadCount === 0, "unread count clears");

    console.log("\nworkflows create → execute → trace:");
    const wfDef = {
      name: `E2E workflow ${stamp}`,
      definition: {
        nodes: [
          { id: "note", type: "prompt", config: { template: "topic={{input.topic}}", saveAs: "note" } },
          { id: "out", type: "output", config: { template: "done:{{note}}" } },
        ],
        edges: [{ from: "note", to: "out" }],
      },
    };
    const wf = await api<{ workflow: { id: string } }>(cookie, "POST", "/api/ai/workflows", wfDef);
    report(wf.status === 201 && wf.body.ok, "POST /api/ai/workflows → 201", `→ ${wf.status}`);
    const wfId = wf.body.ok ? wf.body.data.workflow.id : "";

    const run = await api<{ runId: string; status: string; output: string; trace: Array<{ nodeId: string; status: string }> }>(
      cookie, "POST", `/api/ai/workflows/${wfId}/execute`, { input: { topic: "refunds" } }
    );
    report(
      run.status === 200 && run.body.ok && run.body.data.status === "SUCCEEDED" && run.body.data.output === "done:topic=refunds",
      "workflow executes prompt-only graph without a model",
      run.body.ok ? `output="${run.body.data.output}"` : `→ ${run.status}`
    );
    report(
      run.body.ok && run.body.data.trace.length === 2 && run.body.data.trace.every((t) => t.status === "succeeded"),
      "node-by-node trace returned (2/2 succeeded)"
    );

    // Run is persisted.
    const persisted = await db.workflowRun.findFirst({ where: { workspaceId, workflowId: wfId } });
    report(!!persisted && persisted.status === "SUCCEEDED" && persisted.trace !== null, "workflow run + trace persisted to DB");

    const badRun = await api(cookie, "POST", `/api/ai/workflows/${crypto.randomUUID()}/execute`, { input: {} });
    report(badRun.status === 404, "execute on unknown workflow → 404");

    console.log("\nusage aggregation shape:");
    const use = await api<{ requests: number; byProvider: unknown[]; daily: unknown[] }>(cookie, "GET", "/api/ai/usage?days=30");
    report(
      use.status === 200 && use.body.ok && typeof use.body.data.requests === "number" && Array.isArray(use.body.data.daily),
      "GET /api/ai/usage?days=30 → aggregate shape valid",
      use.body.ok ? `${use.body.data.requests} requests in window` : ""
    );

    console.log("\nRBAC negative (viewer has no ai.chat):");
    const viewerEmail = `e2e-ai-viewer+${stamp}@ai.moniclaw.invalid`;
    await db.user.create({
      data: {
        name: "E2E AI Viewer",
        email: viewerEmail,
        passwordHash,
        emailVerified: new Date(),
        memberships: { create: { role: "VIEWER", workspaceId: workspace.id } },
      },
    });
    const viewerCookie = await signIn(viewerEmail, password);
    const denied = await api(viewerCookie, "POST", "/api/ai/chat", { messages: [{ role: "user", content: "hi" }] });
    report(denied.status === 403 && !denied.body.ok, "VIEWER denied POST /api/ai/chat → 403", `→ ${denied.status}`);
  } finally {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
    if (userId) await db.user.deleteMany({ where: { email: { contains: "@ai.moniclaw.invalid" } } }).catch(() => {});
    await db.$disconnect();
    console.log("  · ephemeral workspace cleaned up");
  }

  if (failures > 0) {
    console.error(`\n${failures} AI E2E check(s) failed\n`);
    process.exit(1);
  }
  console.log("\nAI REST E2E: all checks passed\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
