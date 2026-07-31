# Deployment Guide

Target architecture: **Vercel** (Next.js 14 hosting, edge middleware) +
**managed PostgreSQL** (Vercel Postgres, Neon, Supabase, or RDS — anything with
a TLS connection string).

---

## 1 · Repository

The production branch is `main` on GitHub. Vercel auto-deploys every push to
`main` (production) and every PR (preview).

## 2 · Database

1. Create a Postgres database (Postgres 14+; 17 verified) **with the
   [`pgvector`](https://github.com/pgvector/pgvector) extension available** —
   Phase 3's semantic recall stores 768-dim embeddings
   (`Neon` has it preinstalled; self-hosted: `apt install postgresql-17-pgvector`).
   The Phase 3 migration runs `CREATE EXTENSION IF NOT EXISTS vector`, so the
   extension package only needs to exist on the server — the migration enables
   it in the database itself.
2. Copy the pooled connection string — this becomes `DATABASE_URL`.
3. Note: Prisma migrations run **outside** the Vercel build step (see §4), so
   the build never needs database credentials and preview builds stay safe.

> **Maintainer note — hand-kept indexes.** The `embedding HNSW` cosine indexes
> on `memory_records` / `knowledge_chunks` / `embedding_cache` live in the
> migration SQL only; Prisma's datamodel can't see vector indexes. When
> generating future migrations via `prisma migrate diff`, it will emit
> `DROP INDEX` statements for them — **filter those lines out** of the
> generated SQL, exactly as the Phase 3 migrations did.

## 3 · Environment variables

Configure in **Vercel → Project → Settings → Environment Variables** (scope:
Production + Preview unless noted). Names only — values live in Vercel's vault.

| Variable | Value notes |
|---|---|
| `NEXT_PUBLIC_APP_URL` | e.g. `https://app.moniclaw.com` — your canonical URL |
| `DATABASE_URL` | Pooled Postgres connection string |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | `true` (required; harmless on Vercel, mandatory elsewhere) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Optional; Google OAuth |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | Optional; GitHub OAuth |
| `RESEND_API_KEY` | Optional; email delivery (console fallback without it) |
| `EMAIL_FROM` | Optional; verified sender, e.g. `MoniClaw <no-reply@yourdomain.com>` |
| `GEMINI_API_KEY` | Optional; env-fallback AI provider for workspaces without their own keys (AI Studio free tier) |
| `OPENROUTER_API_KEY` | Optional; first failover provider (`:free` models stay $0) |
| `OLLAMA_BASE_URL` | Optional; keyless self-hosted last resort |
| `CRON_SECRET` | **Production-only.** Guards `GET /api/cron/memory-sweep` (Vercel Cron attaches it automatically). Changes require a redeploy to take effect — env vars bind at build time. Without it the route refuses with 503 (by design). |

OAuth callback URLs to register with providers:

- Google: `https://<domain>/api/auth/callback/google`
- GitHub: `https://<domain>/api/auth/callback/github`

## 4 · Deploy

```bash
# one-time: link the local checkout to the Vercel project
npx vercel link

# deploy to production
npx vercel deploy --prod
```

Or import the GitHub repo in the Vercel dashboard — zero-config; the build is
`next build` (lint + type checks run inside it) and the output is detected
automatically (`postinstall` runs `prisma generate`).

## 5 · Database migrations (run once per release, after env vars exist)

Run from any trusted machine (CI or your laptop) — **not** in the Vercel build:

```bash
DATABASE_URL="postgresql://..." npm run db:migrate:deploy
```

`migrate deploy` is non-interactive, applies only pending migrations, and is
idempotent — safe to re-run.

## 6 · Seed — production policy

**Seed only if the production database is empty.** The seed script is
idempotent (upserts), but production policy is explicit:

```bash
# check first — seed ONLY when this returns 0:
psql "$DATABASE_URL" -tAc 'SELECT count(*) FROM "User";'

# if 0:
DATABASE_URL="postgresql://..." npm run db:seed
```

The seed creates the demo workspace (`demo@moniclaw.dev` / `password123`).
Treat it as onboarding demo data — **rotate or remove the demo credential
before real users sign up**, or skip seeding entirely on production.

## 7 · Post-deploy verification checklist

```bash
export BASE_URL="https://<your-production-url>"
export DATABASE_URL="postgresql://..."   # direct (non-pooled) string is fine

npm run smoke        # 27 checks: routes, middleware 302s, headers, auth API, 404
npm run test:auth    # CSRF→credentials sign-in, wrong password, LoginEvents, rotation
npm run test:routes  # all 17 dashboard routes + dynamic details + RBAC negative
```

Manual pass:

- [ ] `/` , `/pricing`, `/login`, `/signup` render (200)
- [ ] signup → receives verification email (or console link without Resend)
- [ ] email verification + login → lands on `/dashboard`
- [ ] `/dashboard` anonymous → 302 to `/login?next=%2Fdashboard`
- [ ] forgot-password email + reset flow + re-login
- [ ] invite a second user (workspace invitation email) → accept at `/invite/<token>`
- [ ] `/definitely-not-a-page` → branded 404
- [ ] force an error (temporary throw in a page) → branded error boundary, then remove

## 8 · Browser worker (Computer Use Engine)

Vercel serverless functions cannot ship a full Chromium (bundle + memory
limits), so production browser sessions run on a dedicated worker. The app
degrades honestly without one: session creation fails with a typed
`browser_unavailable` error (HTTP 409) and the dashboard shows the engine as
not configured — every other surface keeps working.

```bash
# 1 · run the worker anywhere containers live (Fly.io, Railway, Render, VPS)
docker build -t moniclaw-browser-worker packages/browser-worker
docker run -d --name browser-worker \
  -e BROWSER_WORKER_TOKEN="$(openssl rand -hex 32)" \
  -e PORT=4310 -e WORKER_BROWSER=chromium -e WORKER_HEADLESS=1 \
  -p 4310:4310 moniclaw-browser-worker

# 2 · health:  GET http://<worker-host>:4310/healthz  → {"ok":true,...}

# 3 · point the app at it (redeploy required — env binds at build/deploy time)
vercel env add BROWSER_WS_ENDPOINT production   # wss://<worker-host> (or ws:// on private net)
vercel env add BROWSER_WORKER_TOKEN production  # same token as the worker
vercel deploy --prod
```

- The worker exposes **one** token-gated WebSocket endpoint; the token travels
  on the `x-mcue-token` upgrade header (constant-time compared). Put it behind
  TLS (or a private network) in production.
- One worker process hosts many sessions; scale horizontally and shard by
  workspace if needed (pool is per-worker).
- Local development needs nothing of this: sessions launch on the local
  Playwright Chromium (`npx playwright install chromium`).

## 9 · Custom domain + security notes

- Attach the domain in Vercel → Domains; HTTPS is automatic.
- All cookies are `HttpOnly`, `SameSite=Lax`, and `__Secure-`-prefixed on HTTPS.
- Rate limits are in-memory per instance; for multi-instance horizontal scale,
  swap `lib/rate-limit.ts` for the Upstash Redis adapter (same interface).
- Audit logs are append-only in Postgres; nothing in the app deletes them.

## Rollback

- App: `vercel rollback` or redeploy the previous deployment in the dashboard.
- Database: migrations are forward-only; keep PITR/daily snapshots enabled on
  your Postgres provider before applying any destructive change.
