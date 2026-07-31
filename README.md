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

### Permission model (rank-based RBAC)

`VIEWER < MEMBER < MANAGER < ADMIN < OWNER` — each capability declares a
minimum rank; owner-only operations are enforced separately so rank logic can
never grant them.

| Capability | Minimum role |
|---|---|
| agents.read · approvals.read · knowledge.read · files.read · usage.read · analytics.read · members.read | Viewer |
| agents.create · agents.run · knowledge.write · files.export | Member |
| agents.promote · agents.archive · approvals.decide · knowledge.delete · files.delete · audit.read | Manager |
| members.invite · members.role · members.remove · settings.edit · apikeys.manage | Admin |
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

\* On Vercel, host trust is automatic; set it anyway for preview/prod parity if
you run the same build elsewhere.

## Testing

```bash
npm run typecheck    # TypeScript
npm run lint         # ESLint (also enforced during `next build`)
npm test             # unit: permissions, rate limiting, validation, formatting (23 tests)
npx prisma validate  # schema check

# end-to-end (need a running server; the two DB suites also need DATABASE_URL)
npm run smoke        # 27 HTTP checks: routes, middleware guards, headers, auth API
npm run test:auth    # real sign-in, wrong-password, audit events, session rotation
npm run test:routes  # all 17 dashboard routes + dynamic details + RBAC negative
```

The smoke suite is database-aware: without a reachable `DATABASE_URL` the one
DB-rendered check reports SKIPPED rather than failing.

## Project structure

```
app/
  (marketing)/          public site + auth pages (login, signup, verify, reset, invite)
  (dashboard)/dashboard/ authenticated app: overview, agents, runs, approvals,
                         knowledge, files, usage, analytics, members, settings,
                         billing, api-keys, audit-logs, profile
  api/auth/[...nextauth]/ Auth.js handler
  api/assets/[id]/        authorized asset streaming (avatars, exports, evidence)
components/             ui/ primitives, layout, marketing, dashboard, auth forms
lib/
  actions/              server actions (auth, user, workspace, members, knowledge, files)
  validations/          zod schemas for every input surface
  permissions.ts        rank-based RBAC engine (single source of truth)
  rate-limit.ts         sliding-window limiter + named policies
  audit.ts              fail-safe audit logging (23 action types)
  billing.ts            plan limits + billing-period helpers
  mail.ts               email templates + Resend / console transport
  workspace.ts          session resolution, workspace context, permission checks
prisma/
  schema.prisma         17 models: UUIDs, soft deletes, composite indexes, cascades
  migrations/           versioned SQL (via migrate deploy)
  seed.ts               idempotent demo data
scripts/                smoke.mjs · auth-flow-test.mts · dashboard-routes-test.mts
tests/                  node:test unit suites
docs/                   DEPLOYMENT.md
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
