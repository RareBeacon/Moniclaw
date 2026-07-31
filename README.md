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

### Permission model (rank-based RBAC)

`VIEWER < MEMBER < MANAGER < ADMIN < OWNER` — each capability declares a
minimum rank; owner-only operations are enforced separately so rank logic can
never grant them.

| Capability | Minimum role |
|---|---|
| agents.read · approvals.read · knowledge.read · files.read · usage.read · analytics.read · members.read | Viewer |
| agents.create · agents.run · knowledge.write · files.export · ai.chat · ai.prompts.manage · ai.memory.read/write · ai.workflows.manage/run | Member |
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
| `CRON_SECRET` | — | Guards `GET /api/cron/memory-sweep` (route refuses when unset) |
| `DATABASE_URL_UNPOOLED` | ✓† | Direct endpoint for Prisma CLI migrations (Neon integration injects both) |

\* On Vercel, host trust is automatic; set it anyway for preview/prod parity if
you run the same build elsewhere.
† The schema declares `directUrl` — Prisma CLI needs both DB vars exported
(in separate shell statements).

## Testing

```bash
npm run typecheck    # TypeScript
npm run lint         # ESLint (also enforced during `next build`)
npx prisma validate  # schema check

npm test             # unit (82): platform + crypto vault, safe-expression parser,
                     # chunker, prompt renderer, model-router failover/retry/cancel,
                     # tool executor policy, workflow graphs (incl. loop/condition),
                     # planner, usage math
npm run test:integration  # runtime repositories vs real Postgres+pgvector (9; skips
                          # cleanly without DATABASE_URL)
npm run test:perf         # hot-path fences: chunker 100KB, 30-node workflow,
                          # 10k renders/evals

# end-to-end (need a running server; the two DB suites also need DATABASE_URL)
npm run smoke        # HTTP checks: routes, middleware guards, headers, auth API, AI surfaces
npm run test:auth    # real sign-in, wrong-password, audit events, session rotation
npm run test:routes  # all dashboard routes + dynamic details + RBAC negative
npm run test:flows   # email flows (verification/reset, console-fallback aware)
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
                         audit-logs, profile — and the Intelligence section:
                         playground, memory, prompts, workflows, ai-providers
  api/auth/[...nextauth]/ Auth.js handler
  api/assets/[id]/        authorized asset streaming (avatars, exports, evidence)
  api/ai/                 Phase 3 REST surface (chat, conversations, memory,
                          knowledge, embeddings, providers, workflows, usage)
  api/cron/               memory-sweep (Vercel Cron, CRON_SECRET-guarded)
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
                        memory, knowledge, workflows, api keys)
  ai/                   runtime glue: settings (BYOK source), getRuntime() DI
                        container, REST envelope/error mapping
  api-auth.ts           session-or-msk_ principal resolution + scopes
  crypto.ts             AES-256-GCM vault for BYOK keys (scrypt from AUTH_SECRET)
  validations/          zod schemas for every input surface
  permissions.ts        rank-based RBAC engine (single source of truth)
  rate-limit.ts         sliding-window limiter + named policies
  audit.ts              fail-safe audit logging (43 action types)
  billing.ts            plan limits + billing-period helpers
  mail.ts               email templates + Resend / console transport
  workspace.ts          session resolution, workspace context, permission checks
prisma/
  schema.prisma         30 models: UUIDs, soft deletes, composite indexes, cascades,
                        vector(768) columns for semantic recall
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
