# Phase 6 — AI Sales Operating System · Deployment Report

**Production:** https://moniclaw.vercel.app
**Repo:** https://github.com/RareBeacon/Moniclaw
**Database:** Neon Postgres (`neondb`), 8/8 migrations applied
**Release commits:** `f7bc3fc` (feature drop) + release-docs commit on `main`
**Date:** 2026-08-01

Phase 6 turns MoniClaw from a platform with agents into a **complete AI sales
operating system**: CRM, pipelines, campaigns, approval-gated outreach,
connected sending identities (Amazon SES / any SMTP), and a research worker —
all built on the existing engines (agent runtime, AI runtime, RBAC, audit,
rate limits, approval spine) with zero redesigns.

---

## 1 · Architecture Summary

- **Sales runtime (service layer, DI-first):** scoring, ICP fit, research
  reconcile, sequence runner, draft renderer, unsubscribe/quiet-hour/channel
  guards — pure services behind port interfaces, Prisma adapters underneath.
- **Research worker:** system agent (`system-sales-researcher`) auto-
  provisioned per workspace; research runs through the Phase-5 worker
  pipeline (queue, terminal states, evidence/audit) with plan-decompose,
  knowledge search, web fetch, synthesize. Results reconcile onto
  `SalesCompany` (summary, sources, fitScore, priorityScore).
- **Email delivery (`lib/email/`):** `smtp.ts` nodemailer transport
  (loopback-aware TLS, injection-safe From formatting, mandatory text/plain
  alternative); `connections.ts` CRUD + verify (real SMTP handshake +
  optional test mail) + `sendDraft` — atomically claimed `SENDING` to `SENT`
  (double-click safe), transient failures reschedule for the cron tick,
  3 attempts = `FAILED`. Every failure is written to the row, never faked.
- **Cron tick (`/api/agents/tick`):** one sweep dispatches due workers,
  advances campaign enrollments, **and delivers due approved email drafts**
  (`campaigns` + `email` blocks in the response), all behind `CRON_SECRET`.
- **Guards (always on):** enrollment-level unsubscribe, channel eligibility,
  approval status, send-window settings. The human approval gate cannot be
  bypassed by the campaign engine or the API.
- **Platform AI wiring:** `OPENROUTER_API_KEY` env (free models) powers any
  workspace without its own BYOK key (workspace keys always win). Planner
  tolerates array-shaped plans, retries with stricter JSON instruction, and
  knowledge search degrades honestly when only a chat-only key exists.

## 2 · Packages Added

| Package | Version | Why |
| --- | --- | --- |
| `nodemailer` | `^6.10.1` (pinned) | Real SMTP/SES transport. Pinned: next-auth beta peer range is `^6.6.5`; v9 breaks resolution. |
| `@types/nodemailer` (dev) | 8.x | types |

No other dependency changes. Bundle impact: email routes are server-only.

## 3 · Database Changes (migration `20260801120000_email_connections` — additive)

- **`EmailConnection`** (new table): provider (SES/SMTP), label, sender
  identity, smtp host/port/secure/username, `passwordEnc` (AES-256-GCM vault,
  never selected by any read path — `SAFE_SELECT`), region, status
  (`UNVERIFIED` / `VERIFIED` / `FAILED` + `lastError`), `isDefault`,
  unique `[workspaceId, senderEmail]`, indexed by workspace.
- **`SalesDraft`** (+3 cols): `emailConnectionId`, `sendAttempts`,
  `sendError`; new enum value **`SENDING`** in `SalesDraftStatus` (SENT/FAILED
  already existed — this completes the seam).
- No destructive changes, no backfills; earlier Phase-6 migrations added the
  12 sales tables (companies, contacts, pipelines, stages, deals, activities,
  campaigns, steps, enrollments, drafts, saved searches, settings).

## 4 · Routes Added (this milestone)

- `POST /api/sales/email/connections`, `GET /api/sales/email/connections`
- `PATCH /api/sales/email/connections/[id]`, `DELETE` same path
- `POST /api/sales/email/connections/[id]/verify`
- `POST /api/sales/drafts/[id]/send`
- `/api/agents/tick` extended (email delivery block + `sales.email.tick` audit)
- **Access gate:** signup requires `AUTH_REGISTRATION_CODE` when configured
  (constant-time compare, before any DB work) — the "only us" switch.

(The 60+ Phase-6 REST routes for CRM/campaigns/drafts/research/analytics and
the 13 dashboard pages shipped in earlier milestones this phase; see git
history `ce58b3f`, `0aea398`.)

## 5 · API Endpoints (new surface summary)

| Endpoint | Guard | Rate limit |
| --- | --- | --- |
| `GET/POST /api/sales/email/connections` | sales.read / sales.settings.manage (ADMIN) | 30/hr (create) |
| `PATCH/DELETE /api/sales/email/connections/[id]` | sales.settings.manage | — |
| `POST /api/sales/email/connections/[id]/verify` | sales.settings.manage | 20/hr |
| `POST /api/sales/drafts/[id]/send` | sales.drafts.review (MANAGER) | 60/hr |

SDK: `sales.email.*` (list/create/update/delete/verify) and
`sales.drafts.send(id)` added to the Phase-3 SDK; `EmailConnectionDto` mirrors
the credential-free projection.

## 6 · Dashboard Pages

- **Sales Settings > Email connections**: SES-first connect flow (region
  presets auto-fill `email-smtp.<region>.amazonaws.com`), generic SMTP path,
  verify + test-mail, default identity, honest status chips
  (UNVERIFIED/VERIFIED/FAILED + lastError), delete.
- **Draft detail > Delivery card**: connection used, attempts, last error,
  sent timestamp/message-id, **Send now** button for managers (APPROVED only).
- Signup page: access-code field (copy change only; enforcement is
  server-side).

## 7 · Security Review

- **Credentials:** mailbox passwords sealed with the platform vault
  (scrypt(AUTH_SECRET) AES-256-GCM); list/detail projections never select
  `passwordEnc`; E2E asserts the wire is credential-free.
- **AuthZ:** connections = `sales.settings.manage` (ADMIN); send =
  `sales.drafts.review` (MANAGER); viewer RBAC negatives asserted (403).
- **Registration gate:** `AUTH_REGISTRATION_CODE` constant-time
  (`safeEqual`), checked before user creation; verified on prod (no user row,
  no side effects without the code).
- **Delivery safety:** single default sender per workspace; draft claimed
  atomically (`SENDING`) so concurrent sends cannot double-deliver (409 on
  re-send of SENT — asserted); unsubscribe/channel/approval guards run on
  every send path (manual + cron).
- **Abuse surfaces:** per-workspace rate limits on create/verify/send;
  recipient touch (`NEW` to `CONTACTED`) only after a real SENT.
- **Headers/transport:** TLS required off-loopback; From-header composed
  injection-safe; html bodies always paired with a text/plain alternative.
- **Audit:** verify/send/failed and credential lifecycle all recorded with
  actor/workspace; `lib/http` hardened so background contexts audit too.

## 8 · Performance Summary

- Atomic draft claim = one conditional UPDATE (no locks held over SMTP).
- Tick delivery is batched per workspace with send-window short-circuit.
- Connection list is one indexed query (`workspaceId`, `isDefault` ordering).
- Perf budgets suite (`npm run test:perf`): **5/5 pass** (runtime overhead,
  template rendering linear).
- Production build: clean; no client-bundle growth from email (server-only).

## 9 · Test Results (all green on https://moniclaw.vercel.app)

| Suite | Result |
| --- | --- |
| Unit tests | **219/219** |
| Typecheck (`tsc --noEmit`) + production `next build` | clean |
| Perf budgets | 5/5 |
| Smoke suite | **84/84** |
| Dashboard routes (every page, RBAC) | **57/57** |
| Auth flow (sessions, login events, rotation) | pass |
| Auth email flows (register, verify, reset — gated) | **17/17** |
| Agent E2E (dispatch, idempotency, kill switch, SSE, cron tick) | pass |
| Sales E2E (CRM, campaigns, drafts, **email**, research, limits) | **~80 checks pass** |
| AI REST E2E (chat/memory/knowledge/workflows/usage/RBAC) | pass |

Integration tests (real Postgres + real SMTP sink): 56/56 in the CI-equivalent
local run at `f7bc3fc` (email: live handshake, test mail over the wire, send,
double-delivery guard).

**Live-AI verification:** the platform fallback provider is confirmed
*invoked* from production runs (the `openrouter:rate_limit` classification
proves the wire), and full end-to-end success was demonstrated against the
same code/provider earlier (research run COMPLETED with 4 citations).
Today's heavy verification consumed the key's **free-tier daily allowance
(50 requests/day)**, so additional same-day runs correctly fail *honestly* as
`upstream_failed`; the allowance resets daily (midnight UTC). See Known
Issues 1 and 6.

## 10 · Known Issues

1. **Free-tier AI capacity.** The shared OpenRouter free key allows 50
   requests/day across all workspaces; a full research run consumes ~5–15.
   Mitigation paths in Recommendations.
2. **Transactional email (verification/reset links).** No `RESEND_API_KEY` in
   production, so verification/reset emails are skipped (accounts still work;
   login does not require verification). Links surface in server logs.
3. **Cron cadence.** Vercel Hobby allows 1x/day scheduled ticks (04:45 UTC);
   due campaign steps and scheduled sends deliver at tick granularity (up to
   24h drift). Manual `POST /api/agents/tick` (with CRON_SECRET) is the
   supported nudge; upgrading to Pro enables hourly crons.
4. **SES sandbox.** A new SES identity starts in sandbox (can send only to
   verified addresses) — production access must be requested in the AWS
   console; the verify flow surfaces bounces honestly.
5. **Imported research "size" field** is clamped to 20 chars max (cosmetic).
6. **Free-model supplier volatility.** 429/404s on `:free` slugs happen
   upstream; the runtime retries and fails honestly. The registry default is
   re-pinnable per workspace via provider config.

## 11 · Deferred Features (by design)

- **Marketplace, Billing, Enterprise, Multi-Agent teams, AI Cloud** —
  scoped in `docs/ROADMAP.md` (Phases 7–12), not started.
- Inbound reply detection / threading (threadId seam exists on drafts).
- OAuth (Gmail/Outlook) mailbox connect — SMTP/SES only today.
- Slack/webhook notifications for approval inbox events.
- Verification/reset emails via the workspace's own SES connection (today:
  Resend-or-skip).

## 12 · Recommendations (pre-launch checklist for the two founders)

1. **Add a Gemini AI Studio key** (free, ~1,500 req/day) as `GEMINI_API_KEY`
   in Vercel — it is the *first* fallback provider, multiplying daily AI
   capacity ~30x at $0. Or add $10 OpenRouter credit (1,000 free-req/day).
2. **Upgrade Vercel to Pro** when ready for hourly ticks (campaign pacing
   and scheduled sends become near-real-time).
3. **Connect your mailbox first**: Sales > Settings > Email connections >
   SES preset > paste SMTP credentials from the AWS SES console > Verify
   (watch for the test mail) > set default.
4. **Share the registration access code** with your partner only; rotate
   `AUTH_REGISTRATION_CODE` to reopen/close registration at will.
5. Keep the Demo Logistics Co workspace for trials; it already contains a
   live research example (Flexport).

## 13 · Verification Log (this release)

- Neon `prisma migrate deploy`: 8/8, no drift.
- Vercel production deploy: Ready in ~2m, alias live; smoke headers 84/84.
- CRON_SECRET rotated post-release (old value unrecoverable/redacted);
  stored off-repo in the gitignored local `.env` (never committed).
