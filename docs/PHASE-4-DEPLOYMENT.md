# Phase 4 Deployment Report — MoniClaw Computer Use Engine (MCUE)

**Date:** 2026-07-31 · **Deployment:** https://moniclaw.vercel.app ·
**Commit:** `0881414c84116805cc3f1b68dd5d58d72baf3a8e` (main; engine `ba000f1`,
docs `0881414`) · **Migration:** `20260731140000_computer_use` applied to
production (Neon).

Phase 4 delivers a **Computer Use Runtime** — a governed, observable,
recoverable browser that upcoming AI workers (Phase 5) will drive. It is *not*
browser automation glue: it has its own action semantics, selector engine with
self-healing, recovery strategies, workspace policy enforcement, recording,
and a full evidence trail. The engine is framework-agnostic
(`packages/computer-use/` imports zero Next.js code), and the AI Runtime
consumes it as a **Tool Provider through interfaces** — no tight coupling in
either direction.

---

## 1 · What was built

### 1.1 Engine core (`packages/computer-use/`)

| Package | Contents |
|---|---|
| `browser-engine/` | Browser driver contract + Playwright driver, process pool (idle reaping, size cap), session page-handle registry |
| `browser-tools/` | **38-action catalog** (navigation, tabs, mouse, keyboard, scroll, DOM extract, screenshots, PDF, cookies, files, gated JS) — every action declares id/name/description/category/`permission`/`risk`/zod schema/`validate()`/`execute()`/`rollback()` where meaningful |
| `selectors/` | 8 selector strategies with stability scoring; resolution with fallback chains; **self-healing discovery** (page probe → candidate ranking → heal, `healedFrom` persisted on the event trail) |
| `permissions/` | Domain-list semantics (blocked > confirmation > allowed > default), readOnly/navigationOnly tiers, JS/download/upload gates, artifact caps, concurrent-session quota |
| `recovery/` | Failure-class decision table: bounded retry → refresh-retry → dialog auto-handling → browser relaunch → approval parking → fail; `RECOVERED` first-class outcome |
| `execution/` | Planner (fail-fast zod + policy validation), FIFO queue (bounded concurrency), per-step manager (events, progress, approval parking/resume, cancellation) |
| `sessions/` | Lifecycle manager (ephemeral + profile-persistent), TTL sweep, tab registry |
| `recording/` | Step recorder + screenshot service; recordings stitch into a replayable timeline |
| `downloads/` | Temp-hold downloads, **heuristic scanner** (dangerous MIME/ext and scriptable-document markers → `HELD`), content-addressed binary store (sha256) |
| `uploads/` | Staging with size caps + reference counting, soft delete |
| `profiles/` + `cookies/` | Encrypted storage state (AES-256-GCM via `lib/crypto`), cookie helpers |
| `vision/` | Layout maps from the DOM/a11y probe, pixel-diff with 10×10 heat grid (pixelmatch); OCR + multimodal seams behind ports |
| `audit/` | Audit sink port bound to the platform audit log |
| `repositories/` | Prisma adapters for all 11 `browser_*` tables, behind repository interfaces |

### 1.2 Platform glue

- `lib/browser/runtime.ts` — DI container (lazy singleton): pool
  (`MCUE_POOL_MAX_PROCESSES` default 4 · `MCUE_POOL_IDLE_MS` 120 s), execution
  queue (concurrency 2), repositories, audit sink → `lib/audit`, approval
  bridge → workspace `Approval` rows, upload materializer, AI-facing gateway.
- `lib/browser/api.ts` — REST envelope + `CueError → HTTP` mapping
  (`CUE_HTTP_STATUS`), session/`msk_`-key guard, per-workspace rate limits
  (40 sessions · 150 executions · 30 uploads per hour).
- `lib/permissions.ts` — 6 browser capabilities: `browser.read` (Viewer),
  `browser.execute` + `browser.profiles.manage` (Member),
  `browser.downloads.manage` (Manager), `browser.settings.manage` +
  `browser.policy.manage` (Admin).
- `lib/api-auth.ts` — API-key scopes extended with `browser.read`,
  `browser.execute`.
- `lib/ai/browser-registration.ts` — 6 AI-runtime tools
  (`browser_session_create/close/status/execute/extract/screenshot`) wrapping
  the engine gateway; registered in `lib/ai/runtime.ts` after knowledge/
  memory tools.

### 1.3 REST surface — 25 route handlers under `/api/browser/*`

Sessions (list/create · detail/close · tabs · CRON sweep) · Actions
(catalog · inline run) · Executions (list · queue `202` · detail · cancel ·
resume · events · **SSE stream** · replay) · Downloads (list · detail/delete ·
file download with HELD-refusal + `X-Content-Sha256`) · Uploads
(multipart staging · detail) · Screenshots (list · detail · image) · Logs ·
Permissions (GET/PUT) · Settings (GET/PUT) · Profiles (list/create ·
detail/patch/delete) · Health (pool/queue/driver/vision diagnostics).

### 1.4 Dashboard — "Computer Use" section (9 nav items, 10 pages)

Sessions · Live Execution console (session picker, quick actions, plan
runner, live SSE event stream) · Recordings (+ replay page with screenshot
strip + step timeline) · History · Downloads · Uploads · Screenshots ·
Policy editor (domain lists, tiers, gates) · Engine Settings.

### 1.5 Remote browser worker (`packages/browser-worker/`)

Standalone Node service (`server.mjs`): token-gated WebSocket upgrade proxy
(constant-time token compare, `/healthz`, clean SIGTERM), `Dockerfile` on
`mcr.microsoft.com/playwright:v1.49.1-jammy`. Production pattern documented in
`docs/DEPLOYMENT.md §8`.

### 1.6 Database

Migration `20260731140000_computer_use`: 11 tables — `browser_sessions`,
`browser_executions`, `browser_action_events` (denormalized `workspaceId`,
append-only), `browser_recordings`, `browser_binaries` (sha256
content-addressed), `browser_downloads`, `browser_uploads`,
`browser_screenshots`, `browser_profiles`, `browser_settings`,
`browser_policy` + 6 enums. Workspace `onDelete: Cascade` everywhere.

---

## 2 · Verification results

Local (Ubuntu 24.04, Node 20.20.2, Postgres 17 + pgvector, real Chromium
via `PLAYWRIGHT_BROWSERS_PATH=/home/user/.browsers`):

| Suite | Result |
|---|---|
| `tsc --noEmit` | green |
| Unit (`npm test`) | **128/128** (18 suites incl. MCUE domain policy, selector scoring, catalog contract, plan gating, recovery decisions) |
| Integration (`npm run test:integration`) | **19/19** (runtime repos + all 11 MCUE repos vs real Postgres — encrypted profile roundtrip asserts ciphertext contains no plaintext) |
| Live engine (`npm run test:cue`) | **13/13 scenarios** — session create · 8-step plan pipeline with form fill/select/radio/click/extract/screenshot · recording finalize · tables · tabs · cookies · real download (scanned CLEAN, 31 bytes verified) · staged upload · print_pdf (`%PDF`) · JS gate denied→allowed after policy flip · persistent profile cookie write-back + resume across sessions · pool reuse (1 process) · detach churn recovered (2 attempts) |
| Recovery (`cue-recovery-test.mts`) | **7/7** — self-heal (id rot → testid, RECOVERED) · retry→refresh chain (3 attempts) · dialog dismiss/accept · refresh-retry on changed DOM · confirmation-domain park → Approval PENDING → approve → resume → SUCCEEDED · concurrent-session quota |
| Security (`npm run test:cue:security`) | **8/8** — readOnly/navigationOnly tiers · blocked + default-deny at plan time · download/upload gates · artifact caps + executable HELD · cross-workspace isolation · AES-256-GCM at rest · JS default-deny |
| Perf (`scripts/cue-perf-test.mts`) | **5/5** — warm pool acquire 0.0 ms · context create 7 ms · navigate avg ~110 ms · screenshot ~100 ms · extract_text ~66 ms |
| Smoke (extended) | **71/71** — incl. 9 browser dashboard guards, 19 browser API anonymous-401 checks, bad-key rejection |
| Dashboard routes sweep | **all pass** — 32 owner routes (all 10 browser pages) + RBAC negatives |
| Full-stack HTTP E2E (local server + real Chromium) | session 201 → plan 202 → SSE stream → terminal SUCCEEDED → events/screenshots/replay/downloads endpoints all 200 |

Production (https://moniclaw.vercel.app, Neon Postgres):

| Check | Result |
|---|---|
| Migration `20260731140000_computer_use` | applied; 11/11 `browser_*` tables present |
| `vercel deploy --prod` | Ready in ~2 m, aliased to moniclaw.vercel.app |
| Smoke (71 checks) | **71/71** |
| Auth flow (real sign-in, rotation, audit) | all pass |
| Dashboard routes (provisioned owner/viewer on prod DB) | all pass — incl. all browser pages + recording detail |
| AI REST E2E (Phase 3 regression) | all pass |
| `/api/browser/*` authed (demo session) | **health 200** (pool/queue/capabilities), actions catalog **38**, all 10 GET surfaces 200 |
| Session create without worker | typed `browser_unavailable` **503** with actionable message — honest degradation, no crash |
| Dogfood | MCUE driven against the live site itself captured production screenshots (login + pricing) end-to-end |

### Production incident found & fixed during verification

Cookie-based login on Vercel was broken (302 loop after sign-in): the
deployment had no `AUTH_URL`/`NEXTAUTH_URL`, so Auth.js resolved its base URL
as `http://localhost:3000` — non-secure cookie names from the callback vs
`__Secure-` names expected by middleware on the HTTPS request. This predates
Phase 4 (visible only via browser login; API-key flows masked it). Fixed by
setting `AUTH_URL=https://moniclaw.vercel.app` + `NEXTAUTH_URL` in Vercel
production env and redeploying; login now issues `__Secure-authjs.*` cookies
and the full dashboard sweep passes.

---

## 3 · Security review

- **Policy enforcement is fail-fast**: domain/JS/download/upload violations
  are rejected at *plan* time (never reach a browser); confirmation domains
  park the execution behind a workspace-scoped Approval row; resume verifies
  `APPROVED` server-side.
- **JS execution** is default-deny (`allowJavascript: false`), needs explicit
  policy opt-in, evaluated per-plan.
- **Downloads** are held in a temp dir, scanned heuristically (dangerous
  MIME/extension; `<script`/`javascript:`/iframe markers in scriptable doc
  types), and `HELD` files are refused by the download route (403). Served
  files carry `X-Content-Type-Options: nosniff` + sha256 header.
- **Uploads** are staged server-side with workspace size caps and reference
  counting; nothing reaches a page without a session in the same workspace.
- **Profiles/cookies**: storage state encrypted at rest (AES-256-GCM, scrypt
  from `AUTH_SECRET`); integration test asserts the ciphertext contains no
  plaintext markers.
- **Multi-tenancy**: every query workspace-scoped (cross-workspace read test
  explicitly asserts `null`); binaries content-addressed but metadata always
  tenant-owned.
- **Rate limits**: session/execution/upload caps per workspace per hour.
- **Audit**: 17 `browser.*` actions (sessions, executions, policy changes,
  quarantine release, profile ops) appended with IP + user agent.
- **Browser worker**: single-token WebSocket auth (constant-time compare),
  loopback bind by default, no credential persistence.
- No secrets in code (env only); `.env*` git-ignored; no new npm
  vulnerabilities introduced (`playwright-core`, `pixelmatch`, `pngjs` only).

---

## 4 · Deployment steps (as executed)

```bash
# 1 · local verification battery
npm test && npm run test:integration && npm run test:cue \
  && npm run test:cue:security && PLAYWRIGHT_BROWSERS_PATH=~/.browsers \
     npx tsx scripts/cue-perf-test.mts && next build

# 2 · commit + push every change
git push origin main                       # ba000f1 engine · 0881414 docs

# 3 · production database
vercel env pull /tmp/vercel-prod.env --environment=production --yes
set -a && . /tmp/vercel-prod.env && set +a
npx prisma migrate deploy                  # applied 20260731140000_computer_use

# 4 · production release
vercel deploy --prod --yes                 # https://moniclaw.vercel.app

# 5 · prod verification
BASE_URL=https://moniclaw.vercel.app npm run smoke
BASE_URL=https://moniclaw.vercel.app npx tsx scripts/dashboard-routes-test.mts
BASE_URL=https://moniclaw.vercel.app npx tsx scripts/auth-flow-test.mts
BASE_URL=https://moniclaw.vercel.app npx tsx scripts/ai-api-e2e-test.mts
# + authed /api/browser/* probe (health, catalog, lists, 503 posture)

# 6 · auth fix discovered in step 5
vercel env add AUTH_URL production         # https://moniclaw.vercel.app
vercel env add NEXTAUTH_URL production     # https://moniclaw.vercel.app
vercel deploy --prod --yes                 # re-verified: all suites green
```

Rollback: `vercel rollback` (app is back-compatible — Phase 4 only *adds*
tables/routes/pages); the migration is additive and forward-only.

---

## 5 · Known issues & deferred capabilities

1. **No browser worker in production yet** — sessions on Vercel return typed
   `browser_unavailable` (503) by design (mirrors Phase 3's provider
   posture). Deploy `packages/browser-worker` and set `BROWSER_WS_ENDPOINT` +
   `BROWSER_WORKER_TOKEN` to flip it live (guide in `docs/DEPLOYMENT.md §8`).
2. **Execution queue is in-process** (FIFO, concurrency 2). The
   `ExecutionQueuePort` interface admits a BullMQ/Redis adapter for
   multi-instance deployments — deferred.
3. **Binary store is the database** (`browser_binaries`, content-addressed).
   The `BinaryStorePort` interface admits S3/R2 — deferred; fine at current
   volumes (screenshots ~90–240 KB, dedup by sha256).
4. **Download scanner is heuristic**, not an AV engine. `ScannerPort` allows
   swapping in ClamAV/VirusTotal — deferred; HELD defaults err toward
   quarantine.
5. **Vision**: layout maps + pixel-diff ship; OCR (Tesseract) and multimodal
   model wiring exist as ports (`OcrPort`, `VisionModelPort`) — deferred to
   Phase 5 wiring.
6. **SSE stream** polls the event table (≤55 s windows, `afterSeq` resume) —
   deliberately connection-safe on serverless; a push-based variant belongs
   with the queue backend in item 2.
7. **Firefox/Edge/Chrome channels**: driver supports them locally; the worker
   image ships Chromium by default (`WORKER_BROWSER=firefox` flips it).
8. Headed mode is local-dev only (needs a display); worker runs headless.

## 6 · Next (Phase 5 — awaits approval)

Autonomous agents on top of MCUE: sales/research workers, multi-agent
orchestration, planner→browser pipelines wired through the existing AI
Runtime tool framework. **Not started** — per mission instruction, Phase 5
begins only after explicit approval.
