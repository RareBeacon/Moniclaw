# MoniClaw — The AI Workforce Operating System

MoniClaw lets businesses hire autonomous AI employees that operate browsers,
software, and APIs to complete real business tasks — with the approvals, audit
trails, and controls a real business demands.

This repository contains the **public website and web application**
(Phase 1 milestone): marketing site, documentation landing, blog, legal
documents, and the authentication flow UI.

---

## Tech stack

| Layer      | Choice                                            |
| ---------- | ------------------------------------------------- |
| Framework  | Next.js 14 (App Router) · React 18 · TypeScript 5 |
| Styling    | Tailwind CSS 3 · shadcn/ui-style primitives · CSS-variable design tokens |
| Motion     | Framer Motion (scroll-triggered, reduced-motion friendly) |
| Icons      | Lucide                                            |
| Theming    | next-themes (light / dark / system)               |
| Auth       | Auth.js v5 — credentials (bcrypt) + Google/GitHub SSO, JWT sessions |
| Database   | PostgreSQL · Prisma 6                             |
| Validation | zod · server actions                              |
| Email      | Resend HTTP API (dev console fallback)            |

## Getting started

```bash
cp .env.example .env.local   # fill in values as needed
npm install
npm run dev                  # http://localhost:3000
```

### Scripts

| Command             | Purpose                              |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start the dev server                 |
| `npm run build`     | Production build                     |
| `npm run start`     | Serve the production build           |
| `npm run typecheck` | `tsc --noEmit` — strict type checking |
| `npm run db:push`   | Push the Prisma schema to the DB     |
| `npm run db:migrate`| Create/apply a dev migration         |
| `npm run db:seed`   | Idempotent demo workspace (dev data) |
| `npm run db:studio` | Prisma Studio                        |

Demo credentials after seeding: `demo@moniclaw.dev` / `password123` (dev only).

## Project structure

```
app/                    # Routes (App Router)
  (marketing)/          # Public site + (auth) flow pages — header/footer chrome
  (dashboard)/          # Signed-in workspace — sidebar shell, no marketing chrome
  api/auth/             # Auth.js route handler
components/
  ui/                   # shadcn-style primitives (button, card, accordion …)
  layout/               # Header w/ mobile nav, footer, newsletter
  home/                 # Homepage sections (hero, demo replay, grid …)
  dashboard/            # Side nav, status badges, agent/approval controls …
  auth/ pricing/ contact/ legal/ shared/
lib/                    # Content + config (pricing, faqs, posts, legal, nav)
  actions/              # Server actions (auth, workspace)
  validations/          # zod schemas
  db.ts  workspace.ts   # Prisma client · request-scoped data helpers
auth.config.ts          # Edge-safe auth (middleware) · auth.ts Node config
prisma/                 # Schema (users→workspaces→agents→runs→approvals) + seed
```

### Architecture notes

- **RSC-first.** Pages are server components; client components are isolated
  to interaction islands (header, forms, accordion, run replay).
- **Content as data.** Pricing tables, FAQs, testimonials, agent categories,
  blog posts, and legal documents live in typed content libs under `lib/` —
  editors and (later) a CMS change data, not JSX.
- **Design tokens.** All colors/radii read from CSS variables in
  `app/globals.css`; light and dark themes are pure token swaps.
- **Secrets.** Never hardcoded. `.env*` files are git-ignored; see
  `.env.example`.

## Pages (Phase 1)

Home · Features · Pricing · About · Docs landing · Contact · Blog (+3 full
articles) · Privacy Policy · Terms of Service · Login · Signup · Forgot
password · Verify email · Custom 404 · sitemap.xml · robots.txt

## Roadmap

- **Phase 1 (done)**: public website — marketing pages, docs, blog, legal,
  auth UI, sitemap/robots, dark/light.
- **Phase 2 (in progress)**: Auth.js (email + Google/GitHub SSO, verification,
  password reset) · PostgreSQL + Prisma · workspace dashboard (agents CRUD,
  runs ledger, approvals queue, settings) · middleware route protection.
- **Phase 3**: execution plane — browser runtime fleet, credential vault write
  path, run replay player, billing (credits metering is already modeled).

---

© 2026 MoniClaw, Inc. All rights reserved.
