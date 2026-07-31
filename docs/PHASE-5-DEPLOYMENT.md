# MoniClaw — Phase 5 Deployment & Verification Report

**Scope:** Autonomous AI Workers (`packages/agent-runtime`) — orchestration core, research/ops/general archetypes, human-in-the-loop gates, multi-agent delegation seams, observability, full gate battery.
**Status:** ✅ DEPLOYED & VERIFIED (worker live-run section finalizes with the BYOK key restore)
**Date:** 2026-08-01

---

## Git Commit SHA

- Final build: see §Deployment Status (aliased to production)
- Phase-5 milestones on `main`:
  - `aedfdc5` worker orchestration engine (ports, orchestrator, cron, budgets, policy, research, delegation, 33 unit tests)
  - `6ed4cf1` app glue + REST surface (12 `/api/agents/*` routes, integrations)
  - `94fa5bb` dashboard worker surface + `lib/actions/agents.ts` + Phase-2 `startRun` orchestrator bridge
  - `91fbc99` zombie reaper + dispatch recovery + Vercel `waitUntil` survival
  - `4c451f0` smoke anon-401 battery · `d761f58` agent E2E + `upstream_failed` taxonomy
  - `948ef31` docs + tick GET alias · `cdd7faa` Hobby cron cadence + verification harnesses

## Production URL

https://moniclaw.vercel.app · Vercel (Hobby) · Neon Postgres (`neondb`)

## Migration Status

- `20260801090000_agent_workers` — **APPLIED** to Neon (`prisma migrate deploy`: "All migrations have been successfully applied"; `migrate status`: "Database schema is up to date").
- Integrity spot-checks: **19/19** Phase-5 columns present (`Agent.workerType/goal/instructions/toolPolicy/budget/lastScheduledAt/runCount`, `AgentRun.parentRunId/depth/plan/progress/budgetSnapshot/idempotencyKey/output/errorClass/cancelRequested/tokensUsed/stepsExecuted`, `AiUsageEvent.requestId`); unique constraint `agent_runs_agentId_idempotencyKey_key` present; parent-run index present.
- **Schema drift: none** (5/5 migrations applied on prod; Prisma client regenerated).

## Deployment Status

| Item | Result |
|---|---|
| Build | ✓ `Compiled successfully` — 12 `/api/agents/*` routes + `/dashboard/agents/[id]` |
| Prod deploy | ✓ Ready in ~1m, aliased to `moniclaw.vercel.app` |
| Env vars | ✓ 46 production vars; 7 critical verified (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `AUTH_URL`, `NEXTAUTH_URL`, `AUTH_TRUST_HOST`, `CRON_SECRET`) |
| CRON_SECRET | **rotated** (Vercel redacts Sensitive values in `env pull`, making the prior value unverifiable; new value set, deployed, and live-verified on both cron routes) |
| Cron config | ✓ Registered on the production deployment: `GET /api/agents/tick` daily 04:45 UTC · `GET /api/cron/memory-sweep` daily 04:00 UTC |

## Test Summary

| Suite | Result |
|---|---|
| Unit (`npm test`) | **169/169** — cron parser, budget meter, tool policy, orchestrator lifecycle, error taxonomy (+ all Phase 1–4 suites) |
| Integration (real Postgres + pgvector) | **30/30** — repos incl. stale-sweep windows, idempotency unique race |
| Perf fences | **5/5** |
| MCUE engine (local Chromium) | **13/13 scenario · 7/7 recovery · 9/9 security** |
| Agent E2E (prod) | **27/27** |
| Resilience (prod) | **7/7** |
| Smoke (prod) | **84/84** |
| Auth flow / AI REST E2E / dashboard routes / email flows (prod) | all green |
| Typecheck / next build | green |

## Production Verification Results

- **Anonymous surface:** all `/api/agents/*` + tick reject with 401 (11-route battery in smoke).
- **Cron execution (rehearsed live):** `GET /api/agents/tick` + `CRON_SECRET` → `200 {dispatched,skipped,reaped,requeued}`; anon → 401; rotation re-verified on `/api/cron/memory-sweep` → 200. Hobby plan allows daily-only crons (hourly `15 * * * *` was rejected by Vercel at deploy) — endpoint is idempotent (per-minute cron keys) for any finer external cadence.
- **Agent lifecycle (prod e2e, ephemeral workspace):** create 201 → validation 400 → DRAFT dispatch 409 → promote → **dispatch 202** → idempotent redispatch (same key → same run) → terminal run → evidence events (`run_queued,run_started,run_failed|succeeded`) → audit rows → runCount increment → kill-switch cancel 200/CANCELED → SSE contract (status/event/end frames) → viewer 403 on dispatch + cancel → cross-tick cron dispatch (`dispatched=1`, `cron:<agentId>:<minute>` idempotency, `lastScheduledAt` stamped).
- **Honest failure posture (model-less workspace):** runs terminate `FAILED / upstream_failed` with full evidence — never `internal`, never stuck.
- **Rate limits:** `agentsRun` 60/hour enforced — **429 at call #61** (calls while quota lasted returned the domain 409 as expected).
- **Failure recovery (live tick):** injected zombie RUNNING row (20-min old, 60s budget) → **reaped** `FAILED / budget_exceeded` + evidence; injected lost QUEUED row (5-min old) → **rescued** (`requeued=1`) and executed to terminal at-most-once via the transition guard, evidence trail intact.
- **Workspace isolation:** cross-tenant run read → 404 (both e2e and demo-workspace probes).
- Full regression confirmation for Phases 1–4 surfaces (site, auth, AI REST, dashboard routes, email flows, MCUE health).

## Worker Verification Results (BYOK research run)

- Demo workspace: sign-in via real Auth.js surface ✓ · research worker (bounded budget: 10 steps / 200k tokens / $1.00 / 4 min / depth 0) ✓ · promoted SUPERVISED ✓ · dispatch 202 ✓ · cross-tenant 404 ✓ · SSE replay ✓ · audit trail ✓ · runCount ✓.
- **Model-dependent rows:** pending the BYOK key restore (production holds zero provider keys post-reset; workspace currently fails honestly — proof-of-posture run: `runs/0afb7a2f-…`). On key save, `scripts/agent-prod-verify.mts` re-executes: planner steps + token metering, `http_request` fetch, cited report synthesis, usage-ledger attribution (AiUsageEvent `requestId`), HITL park/resume if gated.
- ➡ **Result recorded below once executed (see "Live Research Run Evidence").**

## Security Verification

- RBAC: `agents.read/create/run/promote/archive` enforced (viewer 403 dispatch/cancel; demo OWNER full pass).
- Anonymous cron/bearer guard on tick; rate limits per workspace-hour; envelope + 256KB JSON caps.
- Cross-tenant isolation at repo + route level (404 probes); soft-delete + ARCHIVED evidence retention; kill switch honored mid-run.
- Provider keys: AES-256-GCM vault (Phase-3 path — no key material in reports/logs/`.env` commits); CRON_SECRET rotated post-redaction.
- No secrets in repo; `.env.example` documents names only.

## Performance Summary

- Deploy end-to-end: **~60s** (Vercel build incl. lint+typecheck).
- Dispatch latency: 202 in ≤1s; queue concurrency 2/process (env-tunable); tick sweep < 4s cold.
- Budgets enforced mid-run at the spend boundary + post-hoc; wall-clock reaper guarantees terminality ≤ next tick after budget.
- SSE poll cadence 700ms; events cursor `?after=` indexed (`@@index([runId, ts])`).

## Known Issues

1. **Hobby cron cadence** — daily-only on this plan; finer scheduling needs an external caller (route is idempotent/minute-safe) or Pro upgrade.
2. **No browser engine on Vercel prod** (Phase-4 posture): no `BROWSER_WS_ENDPOINT` configured — `browser_*` tools degrade honestly; research runs should default to `http_request` until the browser worker is deployed.
3. **Provider keys resets** — production has zero BYOK configs; onboarding currently relies on users adding keys manually (AI Providers page).
4. In-process queue on serverless: bounded by route `maxDuration` (300s) — long runs rely on checkpoint + tick rescue/reaper (by design this phase).

## Deferred Features

- Distributed queue implementation of `AgentQueuePort` (BullMQ/SQS) for runtimes > serverless window.
- Ops-worker deep tooling (mutating action catalog beyond the current general/seam tools) — grows with Phase 6 capability work.
- Vision/OCR wiring for browser-informed research (ports exist; Phase-4 baseline).
- Fine-grained cron (< daily) via external scheduler or Pro plan.

## Recommendations

1. Run an external per-minute scheduler against `POST /api/agents/tick` (idempotent) until the plan allows hourly crons.
2. Add the first BYOK key in onboarding (guided) — the worker plane proves its value only with a model online.
3. Deploy `packages/browser-worker` (Dockerfile included) and set `BROWSER_WS_ENDPOINT` before browser-heavy research.
4. Consider Pro for hourly crons and longer function windows if production workloads exceed the 5-minute envelope.

---

## Live Research Run Evidence

**Deferred on operator decision** — production held zero provider keys
after the environment reset, and Phase 5 was declared complete before the
restore landed. The proof harness (`scripts/agent-prod-verify.mts`) is
committed and one command away once a key exists:

```bash
BASE_URL=https://moniclaw.vercel.app DEMO_EMAIL=… DEMO_PASSWORD=… \
  DATABASE_URL=… npm exec tsx scripts/agent-prod-verify.mts
```

Posture proven in its place: model-less workspaces fail honestly
(`FAILED / upstream_failed`, full evidence trail, usage ledger empty by
design) — verified on dispatch, cron-dispatch and rescued-run paths in
production. The model-path assertions themselves (planner steps, token
metering, cited synthesis, usage attribution) run unchanged the moment a
BYOK key is saved on the demo workspace.
