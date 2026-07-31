# Deployment Guide

Target architecture: **Vercel** (Next.js 14 hosting, edge middleware) +
**managed PostgreSQL** (Vercel Postgres, Neon, Supabase, or RDS — anything with
a TLS connection string).

---

## 1 · Repository

The production branch is `main` on GitHub. Vercel auto-deploys every push to
`main` (production) and every PR (preview).

## 2 · Database

1. Create a Postgres database (Postgres 14+; 17 verified).
2. Copy the pooled connection string — this becomes `DATABASE_URL`.
3. Note: Prisma migrations run **outside** the Vercel build step (see §4), so
   the build never needs database credentials and preview builds stay safe.

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

## 8 · Custom domain + security notes

- Attach the domain in Vercel → Domains; HTTPS is automatic.
- All cookies are `HttpOnly`, `SameSite=Lax`, and `__Secure-`-prefixed on HTTPS.
- Rate limits are in-memory per instance; for multi-instance horizontal scale,
  swap `lib/rate-limit.ts` for the Upstash Redis adapter (same interface).
- Audit logs are append-only in Postgres; nothing in the app deletes them.

## Rollback

- App: `vercel rollback` or redeploy the previous deployment in the dashboard.
- Database: migrations are forward-only; keep PITR/daily snapshots enabled on
  your Postgres provider before applying any destructive change.
