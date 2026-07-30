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
| Planned    | PostgreSQL · Prisma · Auth.js (Phase 2)           |

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

## Project structure

```
app/                    # Routes (App Router)
  (auth)/               # login, signup, forgot-password, verify-email
  blog/[slug]/          # Article pages (content lib driven, SSG)
  legal/(privacy|terms) # Legal documents (data-driven renderer)
  features/ pricing/ about/ docs/ contact/ blog/
components/
  ui/                   # shadcn-style primitives (button, card, accordion …)
  layout/               # Header w/ mobile nav, footer, newsletter
  home/                 # Homepage sections (hero, demo replay, grid …)
  auth/ pricing/ contact/ legal/ shared/
lib/                    # Content + config (pricing, faqs, posts, legal, nav)
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

- **Phase 2**: Auth.js (email + Google + GitHub SSO), PostgreSQL + Prisma,
  workspace dashboard, agent CRUD, run history.
- **Phase 3**: Credential vault, approvals, live browser runtime, billing.

---

© 2026 MoniClaw, Inc. All rights reserved.
