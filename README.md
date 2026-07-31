# MoniClaw

**The AI Workforce Operating System.** MoniClaw lets teams hire, supervise, and
audit AI employees that operate real software — browsers, APIs, inboxes, CRMs —
with human-grade controls: approvals, audit trails, and evidence for every
action.

Built with Next.js 14 (App Router) · React 18 · TypeScript 5 · Tailwind CSS 3 ·
shadcn/ui-style primitives · Framer Motion · PostgreSQL + Prisma 6 · Auth.js v5.

---

## What's inside

### Public site (Phase 1 — complete)

Marketing site with home, features, pricing, about, docs, blog (MDX-style
static posts), contact, and legal pages — dark/light mode, animated sections,
fully responsive.

### Platform (Phase 2 — complete)

- **Authentication** — credentials (bcrypt 12), Google & GitHub OAuth (enabled
  automatically when env keys are present), email verification, password
  reset, Remember Me (24 h vs 30 d sessions), session rotation
  ("sign out everywhere" via per-user `sessionVersion`), route protection via
  edge middleware, role + workspace authorization.
- **User system** — profile (photo via DB-stored assets, name, email change
  with re-verification, password change), connected accounts (link/unlink with
  last-method guard), session management, login history, audited account
  deletion with anonymization.
- **Workspace system** — name/slug, brand color, invitations (7-day signed
  tokens, email delivery, revoke), five-role membership, settings, danger-zone
  deletion (slug confirmation, owner-only), usage tracking foundation.
- **Dashboard** — Overview, Agents (+ create), Runs (+ detail with evidence
  timeline), Approvals, Knowledge (CRUD), Files (audited CSV usage exports),
  Usage, Analytics, Members, Settings, Billing (honest placeholder), API Keys
  (honest placeholder), Audit Logs, Profile. Every page is role-gated.
- **Security** — sliding-window rate limiting on all sensitive endpoints, zod
  validation on every input, Prisma-parameterized queries (no SQL injection
  surface), secure cookies (Auth.js defaults: `__Secure-`, `HttpOnly`,
  `SameSite=Lax`), CSRF via Auth.js + server-action origin checks, security
  headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`), full audit log (23 action types, IP + user agent).
- **Email** — Resend HTTP API; without `RESEND_API_KEY` every message degrades
  to a printed dev-console link so all flows stay testable. Templates:
  verification, password reset, workspace invitation, magic link (ready).

### AI Runtime (Phase 3 — complete)

The intelligence layer every future AI employee runs on. Provider-agnostic:
business logic never depends on one model vendor — everything goes through
the Runtime (`packages/ai-runtime/`), behind interfaces with dependency
injection.

- **Model router** — ordered candidate chain (workspace BYOK keys first, then
  env fallbacks; free-first default order **Gemini → OpenRouter free →
  Ollama**), per-attempt timeouts, bounded retries with backoff+jitter for
  transient errors, automatic failover on the rest, caller cancellation, and
  usage accounting on success AND failure paths. Streaming commits to a
  provider only after the first token (no blind restarts of partial output).
- **Providers** — OpenAI-compatible adapter (OpenRouter live; OpenAI,
  DeepSeek, Mistral registry-reserved), Gemini native adapter (chat + tools +
  JSON mode + `text-embedding-004` batch embeddings, 768-dim), Ollama
  (keyless, NDJSON). Health probes before a BYOK key is saved.
- **Memory engine** — conversation / workspace / agent / long-term scopes,
  semantic recall (pgvector cosine, re-ranked sim 0.65 · importance 0.2 ·
  recency 0.15), compression into long-term, expiration sweeps
  (`/api/cron/memory-sweep` daily), per-workspace caps (keeps the most
  important records).
- **Knowledge base** — PDF/DOCX/TXT/MD/CSV/JSON/HTML + web pages (SSRF-guarded
  fetch) → extract → chunk (450-token target, overlap, hard-split) → embed
  (content-hash cache in `embedding_cache`, duplicate documents detected by
  checksum) → store → `knowledge_search` retrieval.
- **Universal tool framework** — name/description/zod-schema/metadata
  (mutating tools default-DISABLED), executor with timeout + audit + usage +
  input validation. Built-ins: calculator (safe shunting-yard parser, no
  `eval`), datetime, json_transform, http_request (DNS-pinned SSRF guard),
  knowledge_search, memory_recall.
- **Planner** — goal → JSON-mode decomposition (zod-validated, tool
  allowlist) → step execution → validation → one model-driven repair →
  human-approval pause (bridged to the Approval table) → reflection.
- **Workflows** — 9 node types (prompt / ai / tool / http / condition / loop /
  wait / memory / output), graph validation (duplicate ids, unknown edges,
  exactly-one output, cycle-safe reachability), `{{node.path}}` templating,
  node-by-node trace persisted per run.
- **Prompt system** — versioned templates with typed `{{variables}}` (strict
  required-missing errors, unused-value warnings), publish/archives rollback
  chain, per-workspace editor with a live test bench.
- **Usage tracking** — one `AiUsageEvent` per billable call (tokens, latency,
  cost-micros, tool calls, errors), 30-day dashboard aggregation; never
  throws into the request path.
- **REST API** `/api/ai/*` — chat (buffered + SSE streaming, conversation
  persistence), conversations, memory (+search), knowledge documents (+search),
  embeddings, providers (+test), workflows (+execute with trace), usage.
  Session or `msk_…` API-key auth (read/write scopes, Manager-level ceiling),
  per-workspace rate limits.
- **SDK** — `@moniclaw/sdk` typed client over the REST surface (chat incl.
  streaming, memory, knowledge, workflows, usage).
- **Dashboard** — AI Playground (streaming chat, threads, stop), Memory
  Explorer (write/search/forget + stats), Prompt Manager, Workflow Builder
  (JSON-graph editor, run + trace viewer), AI Providers (BYOK CRUD, health,
  tool permissions), Knowledge documents section, AI usage section, API Keys
  (create-once-show, revoke).

### Computer Use Engine (Phase 4 — complete)

The MoniClaw Computer Use Engine (**MCUE**, `packages/computer-use/`) is a
complete Computer Use Runtime — not browser automation glue. It gives AI
workers a governed, observable, recoverable browser. Everything runs through
interfaces (ports) with dependency injection; the engine never imports Next.js
and the AI Runtime is a *consumer*, not a dependency.

- **Browser engine** — Playwright driver over a process pool (Chromium /
  Chrome / Edge / Firefox, headless or headed), local or remote
  (`packages/browser-worker`, token-gated WebSocket, Dockerfile included);
  per-session isolation with ephemeral or persistent encrypted profiles.
- **38 universal actions** (`navigate` → `wait_for_navigation`, incl. tabs,
  mouse, keyboard, scroll, DOM extraction, screenshots, PDF, cookies, files,
  gated `execute_javascript`) — each declares its permission tier, risk class,
  zod arg schema, `execute()` and where meaningful `rollback()`.
- **Selector engine** — 8 strategies (testid, aria, role+name, label,
  placeholder, text, css, xpath) scored by stability; **self-healing**: when a
  selector dies the engine probes the page, ranks candidates and retries with
  the best match (`healedFrom` trail persisted).
- **Recovery** — decision table per failure class: bounded retry →
  refresh-and-retry → dialog auto-handling (dismiss/accept per policy) →
  browser relaunch on crash/detach → approval parking for confirmation
  domains → clean failure. RECOVERED is a first-class execution outcome.
- **Workspace policy** — readOnly / navigationOnly tiers, blocked /
  confirmation / allowed domain lists (default-deny capable), JavaScript
  execution, download (heuristic scanner HELDs executables and scriptable
  docs) and upload gates, per-artifact caps, concurrent-session quota.
  Confirmation domains park executions `AWAITING_APPROVAL` and bridge into
  the workspace Approval table.
- **Execution pipeline** — goal → zod-validated plan (fail-fast on policy
  violations) → FIFO queue (bounded concurrency) → per-step execution with
  event trail → post-validation → status. Every step emits a
  `BrowserActionEvent` (the replay source of truth); recordings stitch steps
  + screenshots into a timeline.
- **Observability** — ring-buffer event log, per-execution SSE stream
  (`/api/browser/executions/[id]/stream`), replay API, 17 `browser.*` audit
  actions, engine health endpoint (pool/queue/capabilities).
- **Vision baseline** — layout maps from the accessibility/DOM probe and
  pixel-diff (pixelmatch) with a 10×10 change heat grid; OCR and multimodal
  model seams exist as ports for Phase 5 wiring.
- **AI Runtime integration** — the engine is a Tool Provider
  (`browser_session_create/close/status/execute/extract/screenshot`)
  registered alongside knowledge/memory tools, decoupled behind interfaces.
- **REST API** `/api/browser/*` — sessions, actions, executions (+cancel,
  +resume, events, stream, replay), downloads (+file, quarantined content
  refused), uploads (staging), screenshots (+image), logs, permissions,
  settings, profiles, health; session or `msk_…` key auth
  (`browser.read` / `browser.execute` scopes), per-workspace rate limits
  (40 sessions / 150 executions / 30 uploads per hour).
- **Dashboard** — Computer Use section: Sessions, Live Execution console
  (quick actions + plan runner + live SSE stream), Recordings (+replay page),
  History, Downloads, Uploads, Screenshots, Policy editor, Engine Settings.

### Agent Runtime — AI Workers (Phase 5 — complete)

The Agent Runtime (`packages/agent-runtime/`) turns an Agent into an
autonomous **worker**: given a goal it plans, executes with tools (incl. the
MCUE browser), respects budgets and human gates, and files replayable
evidence. It builds **on** the Phase-2 data model and the Phase-3 planner /
tool executor — the migration is strictly additive (`workerType`, `goal`,
`instructions`, `toolPolicy`, `budget` on Agent; `plan`, `progress`,
`budgetSnapshot`, `idempotencyKey`, `output`, `errorClass`, `parentRunId`,
`depth`, `tokensUsed`, `stepsExecuted` on AgentRun; `requestId` on
AiUsageEvent). Everything sits behind ports (`packages/agent-runtime/ports.ts`)
with Prisma adapters in `repositories/prisma.ts` — no planner, SDK or SQL
imports in the orchestrator.

- **Worker orchestration core** (`orchestrator.ts`) — dispatch (202,
  idempotency key, per-agent concurrency cap, forced-SHADOW for shadow
  agents) → queue → hydrate → Phase-3 planner run with per-step budget
  metering and kill-switch polling → optional approval parking → resume from
  the persisted plan snapshot → output synthesis → finish. Aborted runs map
  to typed error classes (`agent_unavailable`, `budget_exceeded`,
  `cancelled`, `upstream_failed`, …) with an HTTP status table.
- **Trigger engine** (`cron.ts`) — manual, webhook/event seams, and POSIX
  5-field crons (dom/dow OR rule, dow 7→0). `GET|POST /api/agents/tick`
  (CRON_SECRET bearer; Vercel Cron daily 04:45 UTC on Hobby — finer cadences
  via any external scheduler, the route is idempotent) dispatches due workers with
  per-minute idempotency keys, reaps zombie RUNNING rows past their own
  wall-clock budget (serverless freeze safety — runs always terminate), and
  rescues QUEUED rows whose dispatch was lost (at-most-once via the status
  transition guard).
- **Serverless survival** — the in-process queue registers its drain with
  Vercel `waitUntil`, so background runs outlive the HTTP response (bounded
  by the route `maxDuration`; anything longer is checkpointed and reaped /
  requeued by the tick sweeps). A distributed queue (BullMQ/SQS) plugs into
  the same `AgentQueuePort`.
- **Worker archetypes** (`research.ts`, `policy.ts`) — research workers
  browse → extract → search knowledge → file a structured **cited report**
  (`ResearchSynthesizer`, non-fatal fallback to the planner reflection);
  ops/general archetypes carry their own preambles and default tool
  allowlists. The `PolicyToolRegistry` layers per-worker allow/deny/delegation
  policy UNDER the workspace tool permissions — deny always wins.
- **Human-in-the-loop** — steps park on the workspace Approval table
  (`agent.step.approval`, run-linked) and resume after decision; MCUE
  confirmation domains reuse the same gates; per-run step/token/cost/wall-clock
  budgets cap every execution; the promote ladder (DRAFT → SHADOW →
  SUPERVISED → AUTONOMOUS) stays operator-controlled.
- **Multi-agent seams** (`delegation.ts`) — the `agent_delegate` capability
  tool delegates through the `DelegationHandle` interface only: depth cap,
  cycle guard, per-child 50% budget share, parent/child lineage (`SET NULL`
  on delete) and `delegatedRuns` in the parent output. No hardwired topology.
- **Honest failure** — a workspace without model keys sees runs terminate
  `FAILED / upstream_failed` (never `internal`, never stuck): the local E2E
  asserts exactly this posture; a provider-backed workspace gets real reports.
- **REST API** `/api/agents/*` — agents CRUD, dispatch, runs (+cancel,
  +resume, +events cursor, +SSE stream), tick, health. Envelope/guard/rate
  idioms mirror the browser surface.
- **Dashboard** — agent detail page (run form with goal override,
  budget/tool-policy/trigger config editor, recent runs), run detail page
  (token/step/depth facts, cited report + reflection + step digest +
  delegation links, **kill switch** and resume-after-decision controls),
  worker fields in the new-agent form.

### Permission model (rank-based RBAC)

`VIEWER < MEMBER < MANAGER < ADMIN < OWNER` — each capability declares a
minimum rank; owner-only operations are enforced separately so rank logic can
never grant them.

| Capability | Minimum role |
|---|---|
| agents.read · approvals.read · knowledge.read · files.read · usage.read · analytics.read · members.read | Viewer |
| agents.create · agents.run · knowledge.write · files.export · ai.chat · ai.prompts.manage · ai.memory.read/write · ai.workflows.manage/run | Member |
| browser.read (sessions, recordings, screenshots, health) | Viewer |
| browser.execute (sessions, actions, executions) · browser.profiles.manage | Member |
| browser.downloads.manage (delete/quarantine release) | Manager |
| browser.settings.manage · browser.policy.manage | Admin |
| agents.promote · agents.archive · approvals.decide · knowledge.delete · files.delete · audit.read · ai.memory.delete | Manager |
| members.invite · members.role · members.remove · settings.edit · apikeys.manage · ai.providers.manage · ai.settings.manage | Admin |

API keys (`msk_…`) authenticate to `/api/ai/*` with read/write scopes and are
never more powerful than a Member, regardless of the creating Admin.
| billing.manage | Owner |
| workspace.delete | **Owner only** (never rank-derived) |

### Session & rate-limit model

| Concern | Policy |
|---|---|
| Session | JWT; 24 h default, 30 d with Remember Me; per-token `exp` enforced at decode |
| Revocation | `sessionVersion` rotation — password/email change or "sign out everywhere" kills every live token |
| Login | 5 attempts / 5 min per IP+email |
| Registration | 3 accounts / hour per IP |
| Password reset / verify resend | 5 emails / hour per IP+email |
| Invitations | 20 / hour per workspace |
| Uploads / exports | 30 / hour per user · 12 / hour per workspace |

---

## Quickstart

```bash
# 1 · prerequisites: Node 20+, a PostgreSQL database
npm install

# 2 · configure environment
cp .env.example .env.local    # fill in DATABASE_URL + AUTH_SECRET at minimum

# 3 · database
npm run db:migrate:deploy     # apply migrations
npm run db:seed               # demo data (demo@moniclaw.dev / password123 — dev only)

# 4 · run
npm run dev                   # http://localhost:3000
```

## Environment variables

See `.env.example` for the annotated template. Names only — never commit
values:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | ✓ | Canonical app URL (links in emails) |
| `DATABASE_URL` | ✓ | PostgreSQL connection string |
| `AUTH_SECRET` | ✓ | Auth.js JWT signing secret (`openssl rand -base64 32`) |
| `AUTH_TRUST_HOST` | ✓* | `true` outside Vercel; required for local prod builds/Docker/VPS |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | — | Enables Google OAuth when both set |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | — | Enables GitHub OAuth when both set |
| `RESEND_API_KEY` | — | Enables real email delivery (console fallback otherwise) |
| `EMAIL_FROM` | — | Sender identity, default `MoniClaw <no-reply@moniclaw.com>` |
| `GEMINI_API_KEY` | — | Env-fallback chat + embeddings provider (workspaces prefer their own BYOK keys) |
| `OPENROUTER_API_KEY` | — | First failover provider (`:free` models keep it at $0) |
| `OLLAMA_BASE_URL` | — | Self-hosted keyless last-resort provider |
| `CRON_SECRET` | — | Guards `GET /api/cron/memory-sweep` and `POST /api/browser/sessions/sweep` (routes refuse when unset) |
| `DATABASE_URL_UNPOOLED` | ✓† | Direct endpoint for Prisma CLI migrations (Neon integration injects both) |
| `BROWSER_WS_ENDPOINT` | — | Remote browser worker (`wss://host:4310`); without it sessions run on the local Chromium |
| `BROWSER_WORKER_TOKEN` | —* | Shared token for the remote browser worker (required by the worker; client side when `BROWSER_WS_ENDPOINT` is set) |
| `PLAYWRIGHT_BROWSERS_PATH` | — | Chromium install path for local sessions (default `~/.cache/ms-playwright`) |
| `MCUE_SERVERLESS_CHROMIUM` | — | `1` switches local launches to `@sparticuz/chromium` (AWS Lambda-style hosts; **not** Vercel — use a browser worker there) |
| `MCUE_POOL_MAX_PROCESSES` | — | Browser process pool size (default 4) |
| `MCUE_POOL_IDLE_MS` | — | Idle process TTL before reaping (default 120000) |
| `AGENT_QUEUE_CONCURRENCY` | — | Concurrent worker runs per process (default 2) |

\* On Vercel, host trust is automatic; set it anyway for preview/prod parity if
you run the same build elsewhere.
† The schema declares `directUrl` — Prisma CLI needs both DB vars exported
(in separate shell statements).

## Testing

```bash
npm run typecheck    # TypeScript
npm run lint         # ESLint (also enforced during `next build`)
npx prisma validate  # schema check

npm test             # unit: platform + crypto vault, safe-expression parser,
                     # chunker, prompt renderer, model-router failover/retry/cancel,
                     # tool executor policy, workflow graphs (incl. loop/condition),
                     # planner, usage math, MCUE domain policy, selector scoring,
                     # action catalog contract, plan gating, recovery decisions,
                     # worker cron parser, budget meter, tool policy, orchestrator
                     # lifecycle (dispatch→park→resume→reap), error taxonomy
npm run test:integration  # runtime + MCUE + agent repositories vs real
                          # Postgres+pgvector (skips cleanly without DATABASE_URL)
npm run test:cue          # live-Chromium engine suites: 13 scenario tests
                          # (session→plan→recording→files→profiles→pool) +
                          # 7 recovery tests (self-heal, retries, dialogs,
                          # approval parking, session quotas)
npm run test:cue:security # policy tiers, domain gates, artifact caps,
                          # cross-workspace isolation, encryption at rest
# scripts/cue-perf-test.mts — engine latency budgets (pool reuse, navigation,
# screenshot, extraction)
npm run test:perf         # hot-path fences: chunker 100KB, 30-node workflow,
                          # 10k renders/evals

# end-to-end (need a running server; the two DB suites also need DATABASE_URL)
npm run smoke        # HTTP checks: routes, middleware guards, headers, auth API,
                     # AI + browser + agents anon-401 surfaces
npm run test:auth    # real sign-in, wrong-password, audit events, session rotation
npm run test:routes  # all dashboard routes + dynamic details + RBAC negative
npm run test:flows   # email flows (verification/reset, console-fallback aware)
npm run test:agents  # AI Workers REST: create→promote→dispatch→terminal,
                     # idempotency, kill switch, SSE, RBAC, scheduler tick
                     # (27 checks; honest upstream_failed without model keys)
```

The smoke suite is database-aware: without a reachable `DATABASE_URL` its
DB-rendered checks report SKIPPED rather than failing.

## Project structure

```
app/
  (marketing)/          public site + auth pages (login, signup, verify, reset, invite)
  (dashboard)/dashboard/ authenticated app: overview, agents, runs, approvals,
                         knowledge (+ AI documents), files, usage (+ AI meter),
                         analytics, members, settings, billing, api-keys,
                         audit-logs, profile — the Intelligence section:
                         playground, memory, prompts, workflows, ai-providers —
                         and the Computer Use section: browser sessions, live
                         console, recordings (+replay), history, downloads,
                         uploads, screenshots, policy, engine settings
  api/auth/[...nextauth]/ Auth.js handler
  api/assets/[id]/        authorized asset streaming (avatars, exports, evidence)
  api/ai/                 Phase 3 REST surface (chat, conversations, memory,
                          knowledge, embeddings, providers, workflows, usage)
  api/browser/            Phase 4 REST surface (sessions, actions, executions,
                          downloads, uploads, screenshots, logs, replay,
                          permissions, settings, profiles, health, SSE stream)
  api/agents/             Phase 5 REST surface (agents CRUD, dispatch, runs
                          +cancel/+resume/+events/SSE stream, tick, health)
  api/cron/               memory-sweep (Vercel Cron, CRON_SECRET-guarded)
packages/computer-use/  the Computer Use Runtime (no Next.js imports):
  browser-engine/       driver contract, playwright driver, process pool
  browser-tools/        Action contract + 38-action catalog + AI tool provider
  selectors/            strategy scoring, resolution, self-healing discovery
  permissions/          domain lists, workspace policy evaluation, gates
  recovery/             per-failure decision table + strategies
  execution/            planner, FIFO queue, per-step manager with parking
  sessions/ recording/ downloads/ uploads/ cookies/ profiles/ vision/ audit/
  repositories/         Prisma adapters behind repository interfaces
packages/browser-worker/ remote-browser sidecar (token-gated WS + Dockerfile)
packages/agent-runtime/ the AI Worker orchestrator (no Next.js imports):
                        ports, orchestrator, cron, budgets, tool policy,
                        research archetypes, delegation seam, Prisma adapters
packages/ai-runtime/    the provider-agnostic brain (no Next.js imports):
  providers/            ChatProvider/EmbeddingProvider contracts + gemini,
                        openai-compatible (OpenRouter…), ollama adapters
  model-router/         ordered candidates, retries/backoff, failover,
                        streaming, cancellation, usage on both paths
  memory/               scoped records, pgvector recall, compression, sweeps
  knowledge/            extract (pdf/docx/…) → chunk → embed (cached) → search
  tools/                framework (+ registry, executor) and 6 built-ins
  planner/              goal → plan → execute → repair → approve → reflect
  prompts/              strict {{variable}} renderer, layered system composer
  workflows/            9-node-type graph executor with per-node trace
  usage/                fail-safe AiUsageEvent tracker + dashboard rollups
  sdk/                  @moniclaw/sdk typed REST client
components/             ui/ primitives, layout, marketing, dashboard, auth forms,
                        dashboard/ai/ intelligence surfaces
lib/
  actions/              server actions (+ ai.ts: providers, settings, prompts,
                        memory, knowledge, workflows, api keys; + browser.ts:
                        sessions, quick actions, plans, policy, uploads)
  ai/                   runtime glue: settings (BYOK source), getRuntime() DI
                        container, REST envelope/error mapping
  browser/              MCUE glue: getBrowserRuntime() DI container (pool,
                        queue, repos, audit sink, approval bridge), REST
                        envelope/error mapping for /api/browser/*
  api-auth.ts           session-or-msk_ principal resolution + scopes
  crypto.ts             AES-256-GCM vault for BYOK keys (scrypt from AUTH_SECRET)
  validations/          zod schemas for every input surface
  permissions.ts        rank-based RBAC engine (single source of truth)
  rate-limit.ts         sliding-window limiter + named policies
  audit.ts              fail-safe audit logging (60 action types incl. browser.*)
  billing.ts            plan limits + billing-period helpers
  mail.ts               email templates + Resend / console transport
  workspace.ts          session resolution, workspace context, permission checks
prisma/
  schema.prisma         41 models: UUIDs, soft deletes, composite indexes, cascades,
                        vector(768) columns for semantic recall, 11 browser_*
                        tables for the Computer Use Engine
  migrations/           versioned SQL (via migrate deploy; HNSW indexes hand-kept)
  seed.ts               idempotent demo data
scripts/                smoke.mjs · auth-flow-test.mts · dashboard-routes-test.mts
tests/                  node:test suites: unit · integration/ · perf/
docs/                   DEPLOYMENT.md
```

## REST API & SDK (Phase 3)

All endpoints are under `/api/ai/*`, return `{ ok, data }` / `{ ok:false, error, message }`,
and accept either the dashboard session or `Authorization: Bearer msk_…`.

```bash
# chat (buffered)
curl -X POST $HOST/api/ai/chat \
  -H "Authorization: Bearer msk_…" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Brief me on refunds."}]}'

# chat (SSE streaming) — add "stream": true, consume `data: {StreamEvent}` lines

# semantic memory write + search
curl -X POST $HOST/api/ai/memory -H "Authorization: Bearer msk_…" \
  -H "Content-Type: application/json" \
  -d '{"scope":"LONG_TERM","content":"Refunds above ₦50,000 need dual sign-off.","importance":80}'
curl -X POST $HOST/api/ai/memory/search -H "Authorization: Bearer msk_…" \
  -H "Content-Type: application/json" -d '{"query":"refund approval rules"}'

# knowledge ingest (multipart file OR {"url"}), then search
curl -X POST $HOST/api/ai/knowledge/documents -H "Authorization: Bearer msk_…" \
  -H "Content-Type: application/json" -d '{"url":"https://docs.example.com/policy"}'
curl -X POST $HOST/api/ai/knowledge/search -H "Authorization: Bearer msk_…" \
  -H "Content-Type: application/json" -d '{"query":"dual sign-off"}'

# run a workflow, poll usage
curl -X POST $HOST/api/ai/workflows/<id>/execute -H "Authorization: Bearer msk_…" \
  -H "Content-Type: application/json" -d '{"input":{"topic":"vendors"}}'
curl $HOST/api/ai/usage?days=30 -H "Authorization: Bearer msk_…"
```

```ts
// Same surface, typed — packages/ai-runtime/sdk (published as @moniclaw/sdk)
import { MoniClawClient } from "@moniclaw/sdk";
const client = new MoniClawClient({ baseUrl: "https://moniclaw.vercel.app", apiKey: "msk_…" });

const reply = await client.chat.complete({
  messages: [{ role: "user", content: "Brief me on refunds." }],
});
for await (const event of client.chat.stream({ messages: [{ role: "user", content: "hi" }] })) {
  if (event.type === "text_delta") process.stdout.write(event.text);
}
const hits = await client.knowledge.search("dual sign-off");
const used = await client.usage.summarize(30);
```

## REST API — Computer Use (Phase 4)

All endpoints under `/api/browser/*`, same envelope and auth as `/api/ai/*`
(plus the `browser.read` / `browser.execute` scopes on `msk_…` keys).

```bash
# engine health (pool, queue, driver capabilities, action count)
curl $HOST/api/browser/health -H "Authorization: Bearer msk_…"

# open a governed session, list the 38-action catalog
curl -X POST $HOST/api/browser/sessions -H "Authorization: Bearer msk_…" \
  -H "Content-Type: application/json" -d '{"startUrl":"https://example.com"}'
curl $HOST/api/browser/actions -H "Authorization: Bearer msk_…"

# run one action inline (validated, policy-checked, audited)
curl -X POST $HOST/api/browser/actions -H "Authorization: Bearer msk_…" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<id>","action":"take_screenshot","args":{"fullPage":true}}'

# queue a multi-step execution (202) then watch it over SSE
curl -X POST $HOST/api/browser/executions -H "Authorization: Bearer msk_…" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<id>","steps":[{"action":"navigate","args":{"url":"https://example.com"}},{"action":"extract_text","args":{}}]}'
curl -N $HOST/api/browser/executions/<exec>/stream -H "Authorization: Bearer msk_…"

# artifacts + governance
curl $HOST/api/browser/executions/<exec>/replay  -H "Authorization: Bearer msk_…"
curl $HOST/api/browser/downloads/<id>/file       -H "Authorization: Bearer msk_…" -OJ
curl $HOST/api/browser/screenshots/<id>/image    -H "Authorization: Bearer msk_…" -O
curl $HOST/api/browser/logs?limit=50             -H "Authorization: Bearer msk_…"
curl -X PUT $HOST/api/browser/permissions -H "Authorization: Bearer msk_…" \
  -H "Content-Type: application/json" \
  -d '{"confirmationDomains":["*.bank.example"],"blockedDomains":["*.exe-mirror.example"]}'
curl -X POST $HOST/api/browser/sessions/<id>/tabs -H "Authorization: Bearer msk_…" \
  -H "Content-Type: application/json" -d '{"url":"https://example.com/docs"}'
curl -X DELETE $HOST/api/browser/sessions/<id> -H "Authorization: Bearer msk_…"
```

Executions parked on a confirmation domain return `AWAITING_APPROVAL` with an
`approvalId`; after the approval is decided in the dashboard,
`POST /api/browser/executions/<id>/resume` continues the plan from the parked
step. Downloads flagged by the heuristic scanner stay `HELD` — the `/file`
route refuses to serve them until released (Manager+, audited).

## REST API — AI Workers (Phase 5)

All endpoints under `/api/agents/*`, same `{ ok, data | error }` envelope and
session/`msk_…` auth as `/api/ai/*` (RBAC actions `agents.read/create/run`).

```bash
# create a research worker (starts DRAFT; promote to take runs)
curl -X POST $HOST/api/agents -H "Content-Type: application/json" \
  -d '{"name":"Pricing Scout","description":"Weekly competitor pricing digest for the strategy team.","workerType":"research","goal":"Map the pricing pages of our top five competitors and file a cited report."}'

# dispatch (202; idempotencyKey deduplicates retries safely)
curl -X POST $HOST/api/agents/<id>/dispatch -H "Content-Type: application/json" \
  -d '{"idempotencyKey":"weekly-2026-W32","mode":"LIVE"}'

# follow the evidence (cursor) or stream it
curl "$HOST/api/agents/runs/<runId>/events?limit=200"
curl -N $HOST/api/agents/runs/<runId>/stream        # SSE: event/status/end frames

# kill switch / resume after a human decision
curl -X POST $HOST/api/agents/runs/<runId>/cancel
curl -X POST $HOST/api/agents/runs/<runId>/resume

# scheduler heartbeat (Vercel Cron daily via GET on Hobby; POST idempotent —
# run it every minute from any external scheduler for a finer cadence)
curl -X POST $HOST/api/agents/tick -H "Authorization: Bearer $CRON_SECRET"
```

Worker budgets (`maxSteps`, `maxTokens`, `maxCostMicros`, `maxDurationMs`,
`maxConcurrentRuns`, `maxDepth`) are enforced mid-run at the spend boundary
and post-hoc at synthesis; breach → `FAILED / budget_exceeded` (HTTP 402).
Runs parked on a human gate return `NEEDS_APPROVAL` with an Approval row.

## Data-layer conventions

- UUID primary keys everywhere; `createdAt`/`updatedAt` on all business models.
- Soft deletes (`deletedAt`) on User, Workspace, Agent, KnowledgeEntry;
  Agent archive runs through `ARCHIVED` status to retain evidence.
- Cascade rules: workspace → memberships/runs/knowledge/assets cascade;
  authorship references (`createdById`) use `SetNull` to preserve records.
- Every query path used in a page or action has a composite index (see
  `@@index` blocks in `schema.prisma`).

## Deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the full Vercel +
managed-Postgres runbook: environment setup, `migrate deploy`, the
seed-only-if-empty policy, and the post-deploy verification checklist.

## License

Proprietary — MoniClaw. All rights reserved.
