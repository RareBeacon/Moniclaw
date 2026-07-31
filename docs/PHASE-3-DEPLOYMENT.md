# Phase 3 — Deployment Report · AI Runtime

**Date:** 2026-07-31 · **Environment:** production · **Status:** ✅ deployed & verified
**URL:** https://moniclaw.vercel.app · **Head commit:** `ea73982` (main)

---

## 1 · What shipped

The **MoniClaw AI Runtime** — the provider-agnostic intelligence layer every
future AI employee will run on. No business logic depends on a single model
vendor; everything goes through the Runtime behind interfaces, wired by a DI
composition root (`lib/ai/runtime.ts`).

| Area | Delivered |
|---|---|
| **Runtime core** `packages/ai-runtime/` | types + error taxonomy; providers (Gemini native adapter incl. `text-embedding-004` embeddings, OpenAI-compatible adapter w/ OpenRouter live + openai/deepseek/mistral registry slots, keyless Ollama); model router (ordered candidates workspace-BYOK → env fallbacks, retries w/ backoff+jitter, automatic failover, per-attempt timeouts, cancellation, usage on success+failure, stream-commits-after-first-token, `ensureConfigured` pre-flight); usage tracker (fail-safe, daily rollup SQL); prompt renderer (strict variables, layered composer); memory service (scopes, pgvector cosine recall re-ranked sim .65/importance .2/recency .15, compression→LONG_TERM, expiry sweep, caps keeping most-important); knowledge (PDF/DOCX/TXT/MD/CSV/JSON/HTML extraction, 450-token chunker w/ overlap, content-hash embedding cache + checksum dedupe, quotas, vector search); tool framework (zod→JSON Schema, registry, executor w/ audit+usage+timeout+validation) + 6 built-ins (calculator, datetime, json_transform, http_request w/ SSRF DNS pinning, knowledge_search, memory_recall); planner (decompose→validate→execute→repair→approval→reflect); workflow executor (9 node types, graph validation, per-node trace) |
| **App glue** `lib/` | AES-256-GCM BYOK vault (`crypto.ts`), AI settings + PrismaProviderConfigSource (lazy-create, health marks), runtime DI container, REST envelope + error mapping, `msk_…` API-key auth (sha256, scopes ≤ Member), 10 new RBAC capabilities, named rate limits (chat 60/h · embed 60/h · upload 20/h · workflow-run 30/h), server actions for every surface |
| **REST API** `/api/ai/*` | chat (buffered + SSE, conversation persistence, fail-fast 409 on no-provider), conversations (+[id]), embeddings, memory (+search, DELETE by rank), knowledge/documents (multipart file **or** `{url}` via SSRF-guarded tool, +[id] chunks/delete, search), providers (+test), workflows (+[id]/execute with persisted run+trace), usage — every route principal-gated, rate-limited where relevant |
| **Cron** | `GET /api/cron/memory-sweep` daily 04:00 UTC via Vercel Cron; refuses 503 when `CRON_SECRET` unset, 401 on wrong credential |
| **Dashboard** | Intelligence nav section: **AI Playground** (SSE streaming, threads, stop, meta footer), **Memory Explorer** (stats, scope filters, write/search/forget), **Prompt Manager** (kind chips, version chain + publish/archive, auto-vars test bench), **Workflow Builder** (JSON-graph editor, starter template, run + trace viewer, recent runs), **AI Providers** (catalog w/ free-first order + reserved vendors, BYOK CRUD w/ health verification before save, test/toggle/delete, workspace defaults + memory/knowledge limits + tool-permission checkboxes); extended **Knowledge** (documents ingest file/URL + status), **Usage** (AI meter: KPIs, daily chart, by-provider/model, top errors), **API Keys** (real issuance — shown once — revoke, security model) |
| **SDK** `packages/ai-runtime/sdk` | `@moniclaw/sdk` 0.3.0 typed client: chat (complete + SSE stream), memory, knowledge (upload/ingestUrl/search), embeddings, providers, workflows, usage |
| **Data layer** | 12 new models (30 total), `vector(768)` on memory/chunks/cache, 3 HNSW cosine indexes, `costMicros` BigInt, approvals relinked to allow plan-derived rows (`runId` optional + `workspaceId`) |

## 2 · Production rollout

1. **Code** — 4 commits ahead of Phase 2 HEAD (`c80d1e6` runtime core · `7a2f233` UI + cron · `13adf4b` test battery + 4 runtime fixes · `ea73982` stream fail-fast + E2E suites). Pushed per-commit to `main`.
2. **Database (Neon)** — `prisma migrate deploy` applied
   `20260731120000_ai_runtime` + `20260731130000_plan_approvals`: **30 tables**,
   `vector 0.8.0` extension enabled in-database, 3 HNSW indexes verified live.
   Non-destructive; no reseed (existing demo data untouched).
3. **Vercel env** — `CRON_SECRET` added (Sensitive, Production). Note: env binds
   at deploy — a redeploy followed the env change before verification.
   **No provider keys** were provisioned (no secrets available); `GEMINI_API_KEY`
   / `OPENROUTER_API_KEY` / `OLLAMA_BASE_URL` remain the documented optional
   env-fallbacks — workspaces bring their own keys via AI Providers UI (AES-256-GCM at rest).
4. **Deploys** — build `moniclaw-mp8ugo0iq` (+ env-refresh redeploy) → aliased to
   https://moniclaw.vercel.app. `vercel.json` registers the daily cron.

## 3 · Verification (all against production)

| Suite | Result |
|---|---|
| `npm run smoke` (extended) | **42/42** — marketing/auth/middleware/headers + 5 AI pages guarded + 9 AI routes reject anonymous + bogus `msk_` rejected + cron closed |
| `npm run test:auth` | ✅ real sign-in, wrong-password, audit events, session rotation |
| `npm run test:routes` (extended) | ✅ all dashboard routes incl. Playground / Memory / Prompts / Workflows / AI Providers 200 + RBAC negatives |
| `npm run test:flows` | ✅ verification + reset email flows, single-use tokens |
| `npm run test:ai` (new) | ✅ full authenticated REST battery: conversations, chat 409 grace (buffered **and** streaming), memory write/list/search/delete, knowledge docs+search grace, embeddings grace, providers catalog (7 entries), workflow create→execute→trace persisted (prompt-only graph runs with **zero** model dependency), unknown→404, usage shape, VIEWER 403 |
| `npm test` (unit) | **82/82** — crypto vault round-trip/tamper, expression parser, chunker, prompt renderer, router failover/retry/cancel/pin/stream-accounting, tool executor policy (default-disabled mutating, timeout, validation), workflow schema+condition+loop+failure+memory nodes, planner approval/repair/reflection, usage math |
| `npm run test:integration` | **9/9** vs prod+fresh local pg/pgvector: remember/recall fallback, semantic ranking, expiry sweep, compression, cap purge, knowledge ingest/chunk/dedupe/quota, usage round-trip |
| `npm run test:perf` | **5/5** — chunker 100KB, 30-node graph, 10k renders/evals, heavy templating |
| `npx tsc --noEmit` · `next lint` · `next build` · `prisma validate` | ✅ clean (strict TS) |
| Cron happy path | ✅ `Authorization: Bearer $CRON_SECRET` → `{"ok":true,…workspaces:N,failures:[]}`; bad/absent secret → 401 |

## 4 · Bugs the battery caught (fixed pre-deploy)

1. **Workflow condition `=` mangling** — naive `=→==` rewrite corrupted
   `>=`/`<=` conditions; replaced with a lookaround-safe rewrite.
2. **Loop off-by-one** — the exit-arm iteration overwrote the loop variable,
   printing "done at N+1"; exit arm no longer clobbers state.
3. **Memory purge inverted ordering** — cap purge deleted the *most* important
   records; now keeps importance-desc/recency-desc top-N.
4. **Streaming chat swallowed no-provider as mid-stream SSE error** — added
   `router.ensureConfigured()` pre-flight so configuration errors are HTTP-level
   (409) while true mid-stream failures still surface in-band.
5. Test-side mismatches (`memories` vs `results` envelope fields) corrected; DI
   adapter factories added for hermetic provider/unit tests.

## 5 · Honest state notes

- **No live model calls are possible in production yet** — no provider API keys
  exist (workspace or env). Every AI path returns the designed **409
  `no_provider`** (chat, streaming, embeddings, knowledge/semantic search,
  planner/AI-workflow nodes); all provider-independent paths (memory CRUD +
  fallback search, prompt-only workflows, prompt templates, usage ledger,
  API keys) work end-to-end and are E2E-verified. Adding a key is a one-minute
  AI Providers UI operation (health-checked before save) or an env var.
- Cost accounting records `costMicros=0` for current adapters (free tiers
  report no pricing); the column + rollups are live for paid adapters.
- `prompt` template nodes render server-side (no model) — the workflow
  foundation is fully runnable today; `ai` nodes activate with the first key.

## 6 · Known limitations / next-phase hooks

- Workflow builder is the JSON-graph foundation by design (spec); visual canvas
  is a later milestone. Loops require an explicit entry node (schema-validated).
- Knowledge search is vector-only (no keyword fallback) — 409 until an
  embedder exists; memory search already degrades to importance ordering.
- Long-stream cancellations rely on client `AbortSignal`; server-side max
  duration is 120s on chat/workflow execute.
- Billing page remains the documented Phase 2 placeholder (usage metering is
  real and feeds it later).

## 7 · ⛔ Stop line

Per the mission: **browser automation and autonomous agents were NOT started.**
Phase 3 delivered the runtime brain only. Awaiting explicit Phase 4 approval.
