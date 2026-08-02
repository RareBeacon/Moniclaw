# Phase 7–12 Deployment & Verification Report

**Release line:** `d1b3162` (Phase 6) → `9680afa` (P11 gateway) → `d35a1a9` (P11 email presets) → `eacd737` (P7 teams) → `ee1ea48`/`3e3aa55` (P9 governance) → `be61c00` (light theme) → `38e11f6` (P11 multi-key rotation) → `c97b4a5`/`ad96a4b`/`ee32ca5` (P10 metering) → `1c47659`/`f094a06` (P8 catalog)
**Production:** https://moniclaw.vercel.app · **Repo:** https://github.com/RareBeacon/Moniclaw
**Stack:** Next.js 14 (Vercel Hobby) · Neon Postgres (13 migrations applied) · Prisma 6
**Date:** 2026-08-02 · executed end-to-end by the MoniClaw Architect agent (no human testing was required).

---

## 1 · What each phase delivered (v1)

### Phase 7 — Multi-Agent Sales Organization → **Teams v1** (`eacd737`)
`AgentTeam` / `AgentTeamMember` + `AgentRun.teamId` lineage on the existing delegation engine.
- Leader needs `toolPolicy.allowDelegation` or runs refuse with 403 `delegation_denied` naming the exact remediation.
- Teams CRUD (`/api/agent-teams`), `/run` with idempotency keys + budget snapshot overrides, runs feed filterable by team, dashboard `/dashboard/teams` (+new, detail, delete), SDK `agents.teams`, audit `agents.team.*`.
- Deleting a team keeps run evidence (`teamId` → NULL, verified in prod).

### Phase 8 — Marketplace → **Template Catalog v1** (`1c47659`)
Curated first-party declarative packages (no user submissions → no moderation needed yet).
- `AgentTemplate` platform-global model + `Agent.templateSlug` install lineage (migration 13).
- 8 shipping packages: Prospect Deep-Dive, Competitor Watch, Weekly Ops Reporter, Market Map Analyst, Portal Data Entry (browser), Inbox Triage Drafter, Meeting Notes → CRM, Invoice Chaser Drafts.
- **Shipping rule enforced by unit tests:** every manifest is parsed by the orchestrator's own `resolveToolPolicy` / `workerBudgetSchema`; packages land in SHADOW (dry-run) mode, never delegation-armed by default.
- REST `GET /api/templates`, `POST /api/templates/[slug]/install` (plan agent caps honored, phantom slug → honest 404); SDK `templates`; dashboard `/dashboard/templates` renders the *resolved* permission manifest + budget caps on every card before install.
- Seeded via `scripts/seed-templates.mts` (idempotent upserts): **8 live in production.**

### Phase 9 — Enterprise → **Capacity & Governance v1** (`ee1ea48`)
Built for the 20-seat private launch, honest everywhere:
- **Durable rate limiting** — the real multi-instance fix: fixed-window Postgres buckets (`rate_limit_buckets`), one atomic upsert per hit so every Vercel instance increments the SAME row. In-memory limiter kept as unit-test store + circuit-breaker fallback. Daily cron reaps expired buckets.
- **20-user capacity** — `AUTH_REGISTRATION_MAX_USERS=20` (prod env): registration closes with an honest "at capacity" message when seats are taken; Settings → *Access & launch seats* shows platform accounts vs the cap with a progress meter + workspace headcount + registration mode.
- **Audit export** — `GET /api/audit-logs/export` streams the workspace ledger as NDJSON (cursor-paginated, self-audited, 12/hr export bucket, 50k ceiling with truncation meta line) + Settings download section.
- 429 envelopes platform-wide now carry honest `retry in Ns` timing.

### Phase 10 — Billing & Metering → **Metering with Teeth v1** (`c97b4a5`)
The previously-observational credits ledger now **accrues and enforces**:
- `creditsForRun` pure accrual: `max(1, ⌈tokens/1000⌉)` for any run that did real work, 0 otherwise; stamped on every terminal run via the finish path.
- `PlanGatePort` (optional, root-dispatches only): when the monthly pool is spent, new runs refuse with an honest 402 naming plan, spend, and reset date. Delegated children can't double-pay.
- **Duo plan** (2 seats · 5,000 credits/mo · 10 live agents) — new default + cohort backfilled (enum migration 12).
- Agent creation capped per plan (archived frees the slot), Billing/Usage pages show real gauges (they existed — now they're fed by non-zero data).
- Two real bugs found by prod E2E and fixed: prisma `finish()` dropped `creditsUsed`; mid-plan execution failures never reached the audit trail.
- **No Stripe** — honest banner stays: nothing is charged, no card is collected, payment rails are explicitly deferred (see §6).

### Phase 11 — MoniClaw AI Cloud → **Universal Gateway + Multi-Key Rotation** (`9680afa`, `38e11f6`)
- 11 provider adapters behind one contract (Gemini, OpenRouter, Ollama, OpenAI, Anthropic, DeepSeek, Mistral, Groq, xAI, Together) + custom OpenAI-compatible endpoints; verified-before-save, AES-256-GCM at rest.
- Settings → **API Keys** page (`/dashboard/settings/api-keys`) — any platform, any number of keys.
- **Multi-key rotation (user ask):** a 429 from any provider now rests that key for the provider's own `Retry-After` window (clamped 1m–1d, default 1h), traffic rotates to the workspace's other keys immediately, resting keys re-enter on success or expiry, env fallbacks resume while all BYOK keys rest, undecryptable rows degrade instead of killing the chain.
- **Immediate alerts:** deduped in-app `Notification` + header bell (20s polling, unread badge, mark-all-read) + `GET/POST /api/notifications`; a flapping key cannot spam (unread-dedup proven on prod).

### Phase 12 — GA & Stabilization v1 (this document)
Hardening evidence (§3), API/SDK surface documented + versioned additive-compat, full deployment docs, roadmap truth-sync.

### Also shipped this cycle (user asks)
- **Gmail & business email** (`d35a1a9`): one-tap presets (Gmail App-Password SSL:465, Outlook 587, Zoho 465) on the SES/SMTP path with server-side port/TLS sanity + Gmail identity rule. Setup guide: §5.3.
- **Light default theme** (`be61c00`): product loads white for every visitor (was OS-dependent black); toggle in header/user-menu still switches; **zero animation/transition changes**; stored choices honored.
- **Honest 429 UX** everywhere (retry timing), **React-comment-safe E2E assertions**, provider-weather-aware test batteries.

---

## 2 · Capacity for 20 users — the mechanics

| Layer | Mechanism | Limit |
|---|---|---|
| Accounts | `AUTH_REGISTRATION_CODE` gate + `AUTH_REGISTRATION_MAX_USERS=20` | **20 seats**, fail-closed at cap |
| Rate limits | Durable Postgres buckets, all policies in `RATE_LIMITS` | per-workspace/ip policies hold across ALL serverless instances |
| Metering | planGate on root dispatches | Duo 5,000 credits/month/workspace |
| Agents | plan agent cap on create/install | 10 live agents/workspace |
| Access code | `MONICLAW-DUO-D86FF0EE` (share with the cohort; rotate in Vercel env if leaked) | — |

---

## 3 · Verification evidence (all on production, none skipped)

| Battery | Result | Coverage |
|---|---|---|
| Unit (`npm test`) | **267/267** | permissions, rate limiter, rotation helpers, plans/credits, templates, policy, orchestrator, sales, CUE… |
| Typecheck / build | clean / clean | `tsc --noEmit`, `next build` |
| Governance E2E | 13/13 | seats UI shows cap 20, NDJSON export self-audited, **durable bucket: exactly 12 allowed then deterministic 429** |
| AI Workers E2E | **54/54** | lifecycle, idempotency, kill switch, SSE, RBAC, tick, teams (16 checks), plan gate 402 + re-open, template install + dispatch |
| Sales E2E | 69/69 | CRM, pipelines, campaigns, cron auto-drafts over REAL SMTP honesty, 21st-request 429, presets (Gmail/SES) |
| AI REST E2E | 33/33 | 11-adapter catalog all-shipped, **multi-key seed→rest→alert→dedup→rotate-out→recover**, notifications REST, workflows |
| Dashboard routes | 62/62 | every page 200s incl. templates, settings seats card, api-keys |
| Auth email flows | 17/17 | register gate, access code, resend/verify honesty |
| Smoke | 83/83 | marketing/legal/edge |

Provider-weather notes (environmental, not defects): OpenRouter free tier = 50 req/day shared; batteries branch explicitly on quota state and assert *honest classified failures* vs *success* accordingly.

---

## 4 · Neon migrations applied (13)

…through `20260802030000_agent_templates`. Order matters: enum `DUO` migration commits its `ALTER TYPE` alone before the backfill (PG rule). All applied via `prisma migrate deploy` against the production branch.

---

## 5 · Operator guides

### 5.1 Register the cohort
Share the URL + access code **`MONICLAW-DUO-D86FF0EE`** (do not commit it anywhere). New accounts verify-skip cleanly while Resend isn't wired; login works unverified.

### 5.2 Add API keys (any platform, any count)
Settings → **AI provider keys** → Add connection. Keys are tested live before saving; multiple keys per provider rotate automatically, the bell tells you the moment one hits its limit.

### 5.3 Connect Gmail & business email
Dashboard → Sales → Settings → Email connections:
1. Pick the **Gmail** preset (or Outlook/Zoho for business mailboxes).
2. Gmail requires an **App Password** (Google Account → Security → 2-Step Verification → App passwords) — not your normal password.
3. Username = the full Gmail address; sender email must match it.
4. Verify → MoniClaw performs a real SMTP handshake; failure marks the connection FAILED with the server error (never fake-verified).

### 5.4 Install a worker
Dashboard → Templates → read the permission manifest on the card → Install. Worker appears under Agents in SHADOW; dispatch dry-runs, promote status when satisfied.

### 5.5 Ops runbook
- Crons (Vercel, daily): `/api/agents/tick` (schedules/campaigns/draft delivery), `/api/cron/memory-sweep` (+ rate-limit bucket reaper). `CRON_SECRET` required.
- Rotate secrets in Vercel envs then `vercel deploy --prod` (env changes need a redeploy).
- Re-seed templates after catalog edits: `DATABASE_URL=… npx tsx scripts/seed-templates.mts`.

---

## 6 · Deferred (explicit, with reasons)

| Item | Why | Ready path |
|---|---|---|
| Stripe/payments | No fake payments will ever ship; preview is honestly free | PLAN_LIMITS + accrual + gate are live; attach Stripe Billing to the same table |
| Marketplace revenue share & moderation (Phase 8.4) | Needs third-party submissions + payments | Catalog/install primitives done |
| Gmail OAuth (one-click) | App Passwords are verified & working; OAuth needs Google app review | Presets keep full function meanwhile |
| SSO/SCIM, on-prem installer | Phase 9/12+ evaluation | RBAC/audit/seats groundwork in place |
| Hosted embeddings beyond Gemini/Ollama | 768-dim schema contract | graceful degradation is honest today |
| Hourly crons | Vercel Hobby = daily | documented upgrade to Pro when traffic warrants |
| Supabase | Token verified (orgs RareBeacon's Org, ProspectIQ; 5 projects). **Decision: stay on Neon** — zero-risk vs a forced migration of a green production DB; no product feature needs Supabase today | Migration is a scripted, reversible exercise if vendor consolidation is ever wanted |
