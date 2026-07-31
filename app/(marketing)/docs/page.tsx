import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  Bot,
  Braces,
  FileKey2,
  History,
  Rocket,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Webhook,
  Workflow,
} from "lucide-react";

import { Section, Eyebrow } from "@/components/shared/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/shared/reveal";
import { GridBackdrop, Glow } from "@/components/shared/backgrounds";
import { CodeBlock, T } from "@/components/shared/code-block";
import { IconBadge } from "@/components/shared/icon-badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Documentation — build on MoniClaw",
  description:
    "Quickstart guides, core concepts, API reference, and SDKs for the MoniClaw AI workforce platform. Deploy your first agent in 15 minutes.",
};

const concepts = [
  {
    icon: Bot,
    title: "Agents",
    body: "A named, permissioned identity that executes a job description. Agents hold their own credentials, working hours, budgets, and approval policies — and are reviewed like any employee.",
  },
  {
    icon: Workflow,
    title: "Skills",
    body: "Reusable, versioned capabilities — browser operation, invoice processing, CRM updates — that agents compose. Ship your own with the TypeScript or Python SDK.",
  },
  {
    icon: FileKey2,
    title: "Credential vault",
    body: "Secrets are encrypted per workspace and injected per action, scoped to domain, destination, and cap. Agents never see raw values; auditors see every use.",
  },
  {
    icon: SlidersHorizontal,
    title: "Guardrails",
    body: "Runtime-enforced policy: approval thresholds, confidence floors, budgets, and circuit breakers. Written as plain rules; provable after every run.",
  },
  {
    icon: History,
    title: "Runs & replay",
    body: "Every execution is a recorded run: actions, screenshots, reasoning, and payloads. Replay second-by-second, diff against shadow runs, export to your SIEM.",
  },
  {
    icon: ShieldCheck,
    title: "Approvals",
    body: "When a run crosses policy, it stops and asks a named human — in Slack, email, or the dashboard — with full context attached. One click, audit-logged.",
  },
];

const guides = [
  "Shadow mode: the only sane way to go live",
  "Writing job descriptions agents can't misread",
  "Modeling approval thresholds by dollar exposure",
  "Migrating a brittle RPA bot to a MoniClaw skill",
  "Webhooks: wiring agents into your event bus",
];

const apiEndpoints = [
  { method: "POST", path: "/v1/agents", desc: "Create an agent from a job description" },
  { method: "POST", path: "/v1/agents/{id}/runs", desc: "Start a run, optionally dry-run" },
  { method: "GET", path: "/v1/runs/{id}", desc: "Fetch run status, result, and evidence links" },
  { method: "GET", path: "/v1/runs/{id}/events", desc: "Stream signed run events (SSE)" },
  { method: "POST", path: "/v1/approvals/{id}/decide", desc: "Approve or reject a pending action" },
];

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-14 justify-center rounded px-1.5 py-0.5 font-mono text-[0.68rem] font-semibold",
        method === "GET"
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "bg-primary/15 text-primary"
      )}
    >
      {method}
    </span>
  );
}

export default function DocsPage() {
  return (
    <>
      {/* ── Docs hero ────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b py-20 sm:py-24">
        <GridBackdrop />
        <Glow className="left-1/2 top-[-12rem] h-[22rem] w-[42rem] -translate-x-1/2" />
        <div className="container relative">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow className="justify-center">Documentation</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
              Deploy your first agent in 15 minutes
            </h1>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Everything you need to describe a job, govern it, and put it to
              work — from first API key to production guardrails.
            </p>
            <div className="relative mx-auto mt-8 max-w-md">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                placeholder="Search the docs… (try 'approvals')"
                aria-label="Search documentation"
                className="h-11 w-full rounded-full border bg-card pl-10 pr-4 text-sm shadow-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-2 focus:ring-ring/40"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Quickstart ───────────────────────────────────────── */}
      <Section id="quickstart" className="py-16 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <div className="flex items-center gap-3">
              <IconBadge icon={Rocket} />
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Quickstart
              </h2>
            </div>
            <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
              Three calls: create an agent, start a dry run, receive the
              approval request. Everything below is a real API shape — the
              console wraps the same endpoints.
            </p>
          </Reveal>

          <div className="mt-10 space-y-8">
            <Reveal>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                1 · Create an agent
              </h3>
              <CodeBlock title="terminal">
                <T.comment># Requires MONICLAW_API_KEY in your environment</T.comment>
                {"\n"}
                <T.keyword>curl</T.keyword> <T.plain>-X POST https://api.moniclaw.com/v1/agents \</T.plain>
                {"\n  "}
                <T.plain>-H </T.plain><T.string>&quot;Authorization: Bearer $MONICLAW_API_KEY&quot;</T.string> <T.plain>\</T.plain>
                {"\n  "}
                <T.plain>-d </T.plain><T.string>{`'{
    "name": "mara.ar",
    "job": "Reconcile weekly Stripe payouts against NetSuite; flag variance > $25",
    "skills": ["browser.ops", "stripe.read", "netsuite.write"],
    "policy": { "approvals": [{ "when": "amount > 50", "to": "@priya" }] }
  }'`}</T.string>
              </CodeBlock>
            </Reveal>

            <Reveal>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                2 · Start a dry run (shadow mode)
              </h3>
              <CodeBlock title="terminal">
                <T.keyword>curl</T.keyword> <T.plain>-X POST https://api.moniclaw.com/v1/agents/agt_9f2/runs \</T.plain>
                {"\n  "}
                <T.plain>-H </T.plain><T.string>&quot;Authorization: Bearer $MONICLAW_API_KEY&quot;</T.string> <T.plain>\</T.plain>
                {"\n  "}
                <T.plain>-d </T.plain><T.string>{`'{ "mode": "shadow", "window": "2026-07-20/2026-07-27" }'`}</T.string>
                {"\n\n"}
                <T.comment>{`# → { "run_id": "run_6Hq2", "status": "running" }`}</T.comment>
              </CodeBlock>
            </Reveal>

            <Reveal>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                3 · Handle approvals from your own stack
              </h3>
              <CodeBlock title="webhook payload · approval.requested">
                <T.plain>{"{"}</T.plain>
                {"\n  "}<T.string>&quot;event&quot;</T.string><T.plain>: </T.plain><T.string>&quot;approval.requested&quot;</T.string><T.plain>,</T.plain>
                {"\n  "}<T.string>&quot;run&quot;</T.string><T.plain>: </T.plain><T.string>&quot;run_6Hq2&quot;</T.string><T.plain>,</T.plain>
                {"\n  "}<T.string>&quot;action&quot;</T.string><T.plain>: </T.plain><T.string>&quot;issue_refund&quot;</T.string><T.plain>,</T.plain>
                {"\n  "}<T.string>&quot;amount_usd&quot;</T.string><T.plain>: </T.plain><T.plain>78.40</T.plain><T.plain>,</T.plain>
                {"\n  "}<T.string>&quot;decide&quot;</T.string><T.plain>: </T.plain><T.string>&quot;POST /v1/approvals/apr_3Dv/decide&quot;</T.string><T.plain>,</T.plain>
                {"\n  "}<T.string>&quot;evidence&quot;</T.string><T.plain>: </T.plain><T.string>&quot;https://app.moniclaw.com/runs/run_6Hq2/replay&quot;</T.string>
                {"\n"}<T.plain>{"}"}</T.plain>
              </CodeBlock>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* ── Core concepts ────────────────────────────────────── */}
      <Section id="concepts" className="border-y bg-secondary/20">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow className="justify-center">Core concepts</Eyebrow>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
            Six nouns, whole platform
          </h2>
          <p className="mt-4 text-muted-foreground">
            MoniClaw has a deliberately small mental model. Learn these six
            objects and the rest is composition.
          </p>
        </div>
        <RevealGroup className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {concepts.map((concept) => (
            <RevealItem key={concept.title}>
              <div className="flex h-full flex-col gap-3.5 rounded-xl border bg-card p-7">
                <IconBadge icon={concept.icon} />
                <h3 className="font-semibold">{concept.title}</h3>
                <p className="text-[0.9rem] leading-7 text-muted-foreground">
                  {concept.body}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      {/* ── API reference preview ────────────────────────────── */}
      <Section id="api">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <Eyebrow>API reference</Eyebrow>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              Infrastructure, not a walled garden
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">
              Everything the console does, the API does — agent lifecycle, runs,
              approvals, evidence. Signed webhooks keep your systems in sync;
              SDKs handle auth, retries, and pagination.
            </p>
            <div className="mt-8 space-y-4">
              <div className="rounded-xl border bg-card p-5">
                <h3 className="flex items-center gap-2.5 font-semibold">
                  <Braces className="h-4 w-4 text-primary" aria-hidden />
                  TypeScript SDK
                </h3>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  npm install @moniclaw/sdk
                </p>
              </div>
              <div className="rounded-xl border bg-card p-5">
                <h3 className="flex items-center gap-2.5 font-semibold">
                  <Webhook className="h-4 w-4 text-primary" aria-hidden />
                  Signed webhooks
                </h3>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  X-MoniClaw-Signature · HMAC-SHA256 · replay-protected
                </p>
              </div>
            </div>
          </div>
          <Reveal delay={0.1}>
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="border-b bg-secondary/50 px-5 py-3 text-sm font-medium">
                REST endpoints — v1
              </div>
              <ul className="divide-y">
                {apiEndpoints.map((endpoint) => (
                  <li
                    key={endpoint.path}
                    className="flex items-start gap-4 px-5 py-4"
                  >
                    <MethodBadge method={endpoint.method} />
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[0.82rem]">{endpoint.path}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {endpoint.desc}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Full reference ships with your workspace key —{" "}
              <span className="font-mono text-xs">api.moniclaw.com/docs</span>
            </p>
          </Reveal>
        </div>
      </Section>

      {/* ── Popular guides ───────────────────────────────────── */}
      <Section className="pt-0">
        <div className="mx-auto max-w-4xl rounded-2xl border bg-card p-8 sm:p-10">
          <h2 className="flex items-center gap-3 text-xl font-semibold tracking-tight">
            <BookOpen className="h-5 w-5 text-primary" aria-hidden />
            Most-read guides
          </h2>
          <ul className="mt-6 divide-y">
            {guides.map((guide, i) => (
              <li key={guide}>
                <Link
                  href="/docs"
                  className="group flex items-center gap-4 py-4 text-[0.95rem]"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 group-hover:text-primary">{guide}</span>
                  <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    5 min →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="mx-auto mt-10 flex max-w-4xl flex-col items-center justify-between gap-5 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 p-8 text-center text-white sm:flex-row sm:text-left">
          <div>
            <h2 className="text-xl font-semibold">Ready when you are</h2>
            <p className="mt-1 text-sm text-violet-100">
              The free tier includes the full API. No credit card.
            </p>
          </div>
          <Link
            href="/signup"
            className={cn(
              buttonVariants({ size: "lg" }),
              "shrink-0 bg-white text-violet-700 hover:bg-violet-50"
            )}
          >
            Get your API key
          </Link>
        </div>
      </Section>
    </>
  );
}
