# MoniClaw Roadmap — Phases 7–12 (Redefined & Expanded)

> Status: **definition only.** Phases 1–6 are shipped (see `PHASE-*-DEPLOYMENT.md`).
> This document redefines the Phase 7–12 vision against the platform as it
> actually exists today, expands each phase into scoped workstreams, and maps
> every future feature to the engines already in the codebase. Nothing here
> is implemented yet; each phase begins only when its entry criteria are met.
>
> Guiding rules inherited from Phases 1–6 (unchanged):
> • Reuse every engine; extend, never rewrite. Strict backward compatibility.
> • No placeholders, no fake success — honest failure everywhere.
> • Every phase ships with full tests, docs, security review, and a verified
>   production deployment report.

---

## Where we stand (foundation every phase builds on)

| Engine (shipped) | What it gives the roadmap |
| --- | --- |
| Agent Runtime (Ph 5) | Workers, runs, cron schedules, idempotency, budgets, delegation (`parentRunId`/`depth`), evidence + audit trails, kill switch |
| AI Runtime (Ph 3) | BYOK + platform fallback providers (Gemini → OpenRouter → Ollama), planner, memory, knowledge, workflows, usage metering |
| Sales OS (Ph 6) | CRM spine, pipeline/deals, campaigns, approval-gated drafts, **email connections (SES/SMTP) + delivery ladder**, research worker, sales tools, analytics |
| Computer Use (Ph 4) | Governed browser automation (38 actions), sessions, permissions, recordings |
| RBAC / rate limits / audit (Ph 2+) | rank-based permissions, per-scope limiters, immutable audit log |

---

## Phase 7 — Multi-Agent Sales Organization

> **Status 2026-08-02: v1 LANDED** (`eacd737`) — teams on the delegation engine: roster, briefing, delegation-gated runs, lineage, REST/SDK/UI. Remaining vision (org-chart autonomy, cross-team learning) stays open.

**Vision.** From single workers to an *orchestrated org*: a researcher drafts
a target brief, a writer produces outreach, a reviewer agent checks policy &
tone, the human approves, a sender agent delivers — all coordinated under one
budget and one evidence trail.

**Why now / entry criteria.** Phase 6 proves the single-worker research loop in
production. Entry: ≥ 2 weeks of stable Phase 6 usage; OpenRouter/Gemini quota
strategy resolved (see Phase 6 report → Recommendations).

**Workstreams (all reuse-first)**
1. **Agent teams.** `AgentTeam` model (additive): named roster of agents +
   routing policy. Reuses `Agent`/`AgentRun`; `parentRunId` + `depth` already
   model delegation trees.
2. **Blackboard memory.** Shared team-scoped memory namespace on top of the
   existing Memory API (`/api/ai/memory`) with rank-based read/write scopes.
3. **Handoff contracts.** Tool-level `requiredAction` pattern extended to
   *agent-to-agent* approvals (writer → reviewer) via the existing approval
   spine (`Approval` rows, inbox, audit).
4. **Team budgets.** One `budgetSnapshot` per org run (already immutable per
   run — extend resolution to team scope); hard-stop propagation to children.
5. **Console.** Org chart view of a run tree (SSE stream already carries
   per-node events).

**Explicit non-goals.** No autonomous sending without the human approval gate;
no cross-workspace delegation.

**Exit criteria.** A 4-agent team researches 10 companies, drafts 10 emails,
passes review, and queues them for approval — under one budget, one evidence
trail, zero human intervention except the send approval.

---

## Phase 8 — Marketplace (Agents, Tools, Templates)

> **Status 2026-08-02: v1 LANDED** (`1c47659`) — curated first-party template catalog with permission manifests + SHADOW installs (REST/SDK/UI). Revenue share + community moderation remain deferred to the billing rails.

**Vision.** A catalog where builders publish agents / tools / campaign
templates and teams install them with explicit, reviewable permissions.

**Workstreams**
1. **Packages.** `MarketplacePackage` model: versioned manifest (agent spec,
   tool definitions, workflow graphs) — same JSON schemas the runtime already
   validates today.
2. **Install flow.** Install = import manifest into workspace *with the
   permission manifest diff rendered*; personal-api-key auth path already
   exists for programmatic installs.
3. **Moderation spine.** Publisher submissions ride the existing
   approval/audit engine (PENDING → APPROVED/REJECTED) plus takedown.
4. **Revenue share.** Deferred to Phase 10 (billing rails land first).
5. **Safety.** Installed tools run under the same policy engine + rate
   limits; mutating tools remain default-disabled (safe-by-default rule).

**Non-goals.** No third-party code execution inside the platform sandbox —
Phase 8 ships declarative packages only (prompts, graphs, schemas).

---

## Phase 9 — Enterprise

> **Status 2026-08-02: v1 LANDED** (`ee1ea48`) — durable cross-instance rate limiting, 20-seat launch cap + seats meter, streamed audit export. SSO/SCIM and on-prem remain open.

**Vision.** The same platform, deployable and governable for large orgs.

**Workstreams**
1. **Identity.** SSO (SAML + OIDC) in front of NextAuth; SCIM provisioning
   into workspace memberships (rank mapping onto existing RBAC).
2. **Org hierarchy.** Workspace tree (org → units) with policy inheritance;
   current `Workspace` gains an optional `parentId` (additive).
3. **Governance.** Org-wide audit export (existing `AuditLog` → S3/NDJSON),
   data-residency pinning (Neon/region selection), retention policies.
4. **Custom roles.** Rank system extended with fine-grained role templates
   (Viewer/Member/Manager/Admin remain the ladder; roles compose scopes).
5. **Private models.** BYOK today → *private endpoint* configs tomorrow
   (Ollama/self-hosted path already proves keyless providers).

**Non-goals.** On-prem installer is Phase 12+ evaluation, not Phase 9.

---

## Phase 10 — Billing & Metering

> **Status 2026-08-02: v1 LANDED** (`c97b4a5`) — credit accrual + monthly plan gate with honest 402s, Duo launch plan, plan agent caps, real usage gauges. Payments (Stripe) stay deferred — no card is collected.

**Vision.** Usage-based billing built on the metering the platform already
records (every run stamps `tokensUsed`; every AI call rows into `AiUsage`).

**Workstreams**
1. **Plans.** Free / Duo / Team / Enterprise: seats, workspace counts, agent
   limits, monthly AI credit allotments.
2. **Credit metering.** `AiUsage` + run budgets → a ledger; hard enforcement
   via the existing budget resolver (today: warns; Phase 10: hard-stops).
3. **Payments.** Stripe checkout, invoices, dunning; webhook handler behind
   the same idempotency-key discipline as agent dispatch.
4. **Metered add-ons.** Extra research credits, extra sending volume,
   marketplace revenue share (unblocks Phase 8.4).

**Non-goals.** No per-email charges during Duo phase (flat for the two
founders); no usage caps *below* current free behavior — grandfathering.

---

## Phase 11 — MoniClaw AI Cloud

> **Status 2026-08-02: v1 LANDED** (`9680afa`, `38e11f6`) — 11-provider mesh + custom endpoints, universal key vault, multi-key rotation with immediate rate-limit bell alerts. Virtual keys/quotas/caching and managed GPU inference remain open.

**Vision.** One AI gateway for the platform: unified key management, caching,
broader provider mesh, and a hosted inference tier.

**Workstreams**
1. **Gateway.** Provider router (exists — Gemini → OpenRouter → Ollama
   failover) becomes a managed gateway: platform-issued virtual keys, per-
   workspace quotas, response caching for repeated prompts, PII redaction
   hooks before provider egress.
2. **Provider mesh.** Anthropic/OpenAI/Mistral/Groq adapters behind the same
   `Provider` interface (contract already formalized in `ai-runtime`).
3. **Dedicated inference.** Scale the Ollama path onto managed GPU capacity
   for tenants that need guaranteed, non-rate-limited completions.
4. **Embeddings service.** Hosted embeddings so knowledge search works without
   a chat-only free key (closes today's graceful-degradation gap).

**Non-goals.** No custom model training in Phase 11 (fine-tuning is a 12+
evaluation).

---

## Phase 12 — V1.0 GA & Stabilization

> **Status 2026-08-02: v1 LANDED — see docs/PHASE-7-12-DEPLOYMENT.md — full prod verification battery green. SLO/status page, self-serve import, docs portal remain open.

**Vision.** Everything shipped, hardened, and contractually stable.

**Workstreams**
1. **SLOs & status.** Public status page, uptime targets, error budgets;
   the health diagnostics endpoint (`/api/agents/health`) extended fleet-wide.
2. **API GA.** The SDK (`MoniClawClient` — chat, memory, workflows, agents,
   sales incl. email) is versioned GA with a written backward-compat policy.
3. **Migration tooling.** Self-serve data export/import per workspace.
4. **Performance.** Cold-start budgets per route, Neon query audits, cached
   read projections for dashboard pages.
5. **Docs portal.** Public docs site generated from this repo's `docs/`.

**Exit criteria.** 30 days at SLO, zero P1 incidents, upgrade drill executed
(backup → restore → verify), API consumers pinned to v1 without breakage.

---

## Long-term vision (post-12)

- **Autonomous revenue org**: multi-agent teams that run the entire top of
  funnel under human-set policy, with the human approving only exceptions.
- **Vertical packs**: logistics, real estate, SaaS — ICP presets, compliance
  packs, template libraries (marketplace first-party).
- **Agent cloud**: customer's agents run on our GPU mesh with verifiable
  per-run isolation.

## Sequencing & dependencies

```
Ph7 (teams) ─┬─► Ph8 (marketplace) ─► revenue share ─┐
             │                                       ├─► Ph10 (billing) ─► Ph11 (AI cloud) ─► Ph12 (GA)
             └─► Ph9 (enterprise) ────────────────────┘
```

- Phase 7 unblocks everything: teams are the unit the marketplace sells,
  enterprise governs, billing meters, and the cloud hosts.
- 8 and 9 can run in parallel after 7.
- 10 lands before 11 (cloud capacity needs metering to be sellable).
- 12 is a horizontal hardening phase, not a feature phase.
