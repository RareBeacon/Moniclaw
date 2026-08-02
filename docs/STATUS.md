# MoniClaw — Current State (living handover doc)

> Read this first in any new chat/session. Keep it short and true; the full
> history lives in git and `docs/PHASE-*-DEPLOYMENT.md`.

**As of 2026-08-02 (re-verified) · HEAD `5deff19`+ · https://moniclaw.vercel.app · all E2E batteries green.**

> Incident note (2026-08-02): prod `CRON_SECRET` had silently drifted from the
> value recorded in session notes (positive scheduler-tick checks masked by the
> "secret unset → skip" branch in an earlier battery). Diagnosed via agent-e2e
> tick 401s; rotated a fresh secret into Vercel Production, redeployed, and
> re-verified positive cron auth (401 without, 200 dispatched with).

## Shipped
Phases 1–12 v1 all production-deployed and verified. Latest cycle:
- P7 Multi-agent teams · P8 Template catalog (8 packages) · P9 durable rate limiting + 20-seat cap + audit export · P10 metering (Duo plan, accrual + monthly gate) · P11 11-provider gateway + multi-key rotation + rate-limit bell alerts · P12 hardening docs · Light default theme · Gmail/business-email presets.

## Access for the owner cohort
- Registration access code: **`MONICLAW-DUO-D86FF0EE`** (never commit it to the repo).
- Platform seat cap `AUTH_REGISTRATION_MAX_USERS=20` (Vercel env).
- Demo user: `demo@moniclaw.dev` / `password123` (Demo Logistics Co).
- Owner should: register via the code → Settings → API Keys (add provider keys, N per platform — rotation is automatic) → Sales → Settings → Email connections (Gmail preset needs an App Password) → install templates in SHADOW.

## Ops essentials
- Local gitignored `.env` holds: `OPENROUTER_API_KEY`, `PROD_CRON_SECRET`, `AUTH_REGISTRATION_CODE`, local DB urls.
- Vercel CLI token + GitHub PAT live in session notes (agent-side; rotate periodically).
- Sandbox wipes between turns: re-run `npm install`, `npx prisma generate`, re-add git remote token, re-link Vercel (`vercel link --yes --project moniclaw`), re-add 3G swap; `node_modules` is not persisted.
- Sandbox builds need `NODE_OPTIONS=--max-old-space-size=2560` and idle RAM (kill stray build workers).
- Prod harness pattern: `set -a; . /tmp/prod.env; set +a; export BASE_URL=https://moniclaw.vercel.app CRON_SECRET=… OPENROUTER_API_KEY=…; npx tsx scripts/<suite>.mts` (pull prod env via `vercel env pull /tmp/prod.env --environment=production`). **Always export CRON_SECRET** — several suites skip positive cron checks when it's unset, which once masked a real secret drift. `vercel env pull` redacts sensitive values (`[SENSITIVE]`), so the live CRON_SECRET exists only in Vercel + the `.env` copy here.
- Provider weather: OpenRouter free tier 50 req/day resets ~00:00 UTC; campaigns send-window endHour is exclusive-after-:00 (suites can't tick drafts between endHour and midnight UTC).

## Batteries at last full run (2026-08-02 post-incident, against final deploy)
unit 267/267 · typecheck clean · smoke 84/84 · dashboard-routes all · auth-flow all · auth-email-flows all · ai-api 34/34 · agent 54/54 · sales all (incl. 21st-request 429) · governance all (incl. export 429 honesty) · 14 migrations applied, none pending.

## Deferred (agreed)
Stripe, SSO/SCIM, Gmail OAuth (App Passwords work), revenue-share/moderation, hosted embeddings beyond Gemini/Ollama, hourly crons (Hobby), Supabase migration (token verified; Neon stays — see PHASE-7-12 report §6).
