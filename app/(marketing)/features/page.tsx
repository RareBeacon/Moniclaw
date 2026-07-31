import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Gauge,
  MonitorSmartphone,
  ShieldCheck,
  X,
} from "lucide-react";

import { Section, SectionHeading, Eyebrow } from "@/components/shared/section";
import { Reveal } from "@/components/shared/reveal";
import { GridBackdrop, Glow } from "@/components/shared/backgrounds";
import { buttonVariants } from "@/components/ui/button";
import { Categories } from "@/components/home/categories";
import { FinalCta } from "@/components/home/final-cta";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Features — the AI workforce platform",
  description:
    "Browser and app operation, credential vaulting, human-in-the-loop approvals, run replay, and the ROI dashboard — everything around the agent so the agent can work.",
};

const comparisons = [
  {
    dimension: "What it does",
    rpa: "Repeats a recorded click path",
    ipaas: "Moves data between known APIs",
    moniclaw: "Completes the job, including the judgment calls",
  },
  {
    dimension: "When the UI changes",
    rpa: "Breaks until re-recorded",
    ipaas: "Unaffected — but can't reach the UI at all",
    moniclaw: "Re-reads the screen and adapts; flags what changed",
  },
  {
    dimension: "Tools without an API",
    rpa: "Possible, fragile",
    ipaas: "Not reachable",
    moniclaw: "Fully operable through the browser",
  },
  {
    dimension: "Handling exceptions",
    rpa: "Fails or needs new scripts",
    ipaas: "Routes to error queues",
    moniclaw: "Reasons within policy, escalates with context",
  },
  {
    dimension: "Accountability",
    rpa: "Machine logs",
    ipaas: "Execution logs",
    moniclaw: "Named identities, approvals, replayable evidence",
  },
];

function DeepDive({
  index,
  icon: Icon,
  eyebrow,
  title,
  body,
  bullets,
  visual,
  flip,
}: {
  index: string;
  icon: React.ElementType;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <Section className="py-16 sm:py-20">
      <div
        className={cn(
          "grid items-center gap-12 lg:grid-cols-2",
          flip && "lg:[&>*:first-child]:order-2"
        )}
      >
        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">{body}</p>
          <ul className="mt-7 space-y-3.5">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Check className="h-3 w-3 text-primary" aria-hidden />
                </span>
                <span className="text-[0.95rem] leading-6 text-foreground/85">
                  {bullet}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="relative">
            <span
              aria-hidden
              className="absolute -top-4 left-6 z-10 rounded-full border bg-card px-2.5 py-1 font-mono text-[0.7rem] text-muted-foreground"
            >
              {index}
            </span>
            {visual}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

export default function FeaturesPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-20 sm:py-28">
        <GridBackdrop />
        <Glow className="left-1/2 top-[-12rem] h-[24rem] w-[46rem] -translate-x-1/2" />
        <div className="container relative">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <Eyebrow>The platform</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">
              One operating system for the jobs your team shouldn&apos;t be doing
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              MoniClaw pairs agents that can genuinely operate software with the
              governance layer enterprises need to trust them. Three systems,
              one platform: operate, govern, prove.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "group")}>
                Start building free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <Link href="/docs" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Read the docs
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Deep dive: Operate ───────────────────────────────── */}
      <DeepDive
        index="01 — Operate"
        icon={MonitorSmartphone}
        eyebrow="Operate"
        title="Agents that read screens, not just API docs"
        body="MoniClaw agents work through a hardened, per-agent browser and first-class API connectors. They navigate by understanding the interface — so the layout changes, pop-ups, and edge cases that silently break scripts become logged, handled events."
        bullets={[
          "Hardened browser runtime with per-session isolation and full recording",
          "60+ first-class connectors: Stripe, Slack, Gmail, HubSpot, NetSuite, GitHub, and more",
          "Falls back to the UI when no API exists — your legacy ERP is finally automatable",
          "Structured extraction turns any web table into typed, validated data",
        ]}
        visual={
          <div className="rounded-2xl border bg-card p-6 shadow-soft">
            <div className="flex items-center gap-2 border-b pb-4">
              <MonitorSmartphone className="h-5 w-5 text-primary" aria-hidden />
              <span className="text-sm font-semibold">Agent view — live session</span>
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-500" />
                Grounded
              </span>
            </div>
            <div className="mt-4 space-y-2.5">
              {[
                ["Detected", "vendor portal updated: “Invoices” → “Billing Center”"],
                ["Adapted", "re-mapped 4 selectors · confidence 0.97"],
                ["Continued", "run stayed on plan · zero human touch"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-start gap-3 rounded-lg border bg-background px-4 py-3 text-[0.82rem]"
                >
                  <span className="w-20 shrink-0 font-semibold text-primary">{k}</span>
                  <span className="font-mono text-muted-foreground">{v}</span>
                </div>
              ))}
            </div>
          </div>
        }
      />

      {/* ── Deep dive: Govern ────────────────────────────────── */}
      <DeepDive
        flip
        index="02 — Govern"
        icon={ShieldCheck}
        eyebrow="Govern"
        title="Guardrails an auditor would design"
        body="Autonomy without governance is a liability. Every MoniClaw agent runs inside policy: what it may spend, where it may send, what requires a named human — expressed as plain rules, enforced by the runtime, and provable afterward."
        bullets={[
          "Approval thresholds by dollar amount, action type, destination, or customer tier",
          "Credential vault with per-action injection — agents never see raw secrets",
          "Budgets and circuit breakers halt anomalous spend before it compounds",
          "Shadow mode dry-runs every workflow against live data before launch",
        ]}
        visual={
          <div className="rounded-2xl border bg-card p-6 shadow-soft">
            <div className="flex items-center gap-2 border-b pb-4">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
              <span className="text-sm font-semibold">Policy — mara.ar</span>
            </div>
            <dl className="mt-4 space-y-3 text-[0.82rem]">
              {[
                ["Refunds", "auto ≤ $50 · else approval by @priya"],
                ["Vendor changes", "always requires approval"],
                ["Working hours", "24/7 · spend cap $1,500/day"],
                ["Confidence floor", "0.85 — below: stop and escalate"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between rounded-lg border bg-background px-4 py-3"
                >
                  <dt className="font-semibold">{k}</dt>
                  <dd className="font-mono text-muted-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        }
      />

      {/* ── Deep dive: Prove ─────────────────────────────────── */}
      <DeepDive
        index="03 — Prove"
        icon={Gauge}
        eyebrow="Prove"
        title="Every hour returned, accounted for"
        body="Agents report like employees: throughput, accuracy, escalations, and cost per completed task — per agent, per workflow, per department. The ROI dashboard is why renewals are the easiest meeting we have with customers."
        bullets={[
          "Cost per completed task benchmarked against your manual baseline",
          "Accuracy tracked against sampled human review, not self-reporting",
          "Escalation rate trends show where autonomy is growing — and where to coach",
          "Finance-ready exports reconcile credits to invoices, workflow by workflow",
        ]}
        visual={
          <div className="rounded-2xl border bg-card p-6 shadow-soft">
            <div className="flex items-center gap-2 border-b pb-4">
              <Gauge className="h-5 w-5 text-primary" aria-hidden />
              <span className="text-sm font-semibold">ROI dashboard — June</span>
            </div>
            <div className="mt-4 space-y-4">
              {[
                { label: "Hours returned", value: "412", width: "92%" },
                { label: "Tasks completed", value: "3,842", width: "78%" },
                { label: "Cost per task", value: "$0.16", width: "22%" },
                { label: "Accuracy (reviewed)", value: "99.2%", width: "99%" },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-1.5 flex justify-between text-[0.82rem]">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-semibold">{row.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
                      style={{ width: row.width }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        }
      />

      {/* ── Comparison table ─────────────────────────────────── */}
      <Section className="py-16 sm:py-24">
        <SectionHeading
          eyebrow="Honest comparison"
          title="Agents aren't RPA, and they aren't iPaaS"
          description="Both older categories still have their place. Here's where each fits — so you can decide with clear eyes."
        />
        <Reveal className="mt-14 overflow-x-auto">
          <table className="mx-auto w-full max-w-5xl border-collapse overflow-hidden rounded-2xl text-left text-sm">
            <thead>
              <tr className="border-b bg-secondary/60">
                <th scope="col" className="px-5 py-4 font-semibold">Capability</th>
                <th scope="col" className="px-5 py-4 font-semibold text-muted-foreground">RPA</th>
                <th scope="col" className="px-5 py-4 font-semibold text-muted-foreground">iPaaS / Zapier</th>
                <th scope="col" className="px-5 py-4 font-semibold text-primary">MoniClaw</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((row) => (
                <tr key={row.dimension} className="border-b last:border-0">
                  <th scope="row" className="px-5 py-4 font-medium">{row.dimension}</th>
                  <td className="px-5 py-4 text-muted-foreground">{row.rpa}</td>
                  <td className="px-5 py-4 text-muted-foreground">{row.ipaas}</td>
                  <td className="px-5 py-4 font-medium text-foreground">{row.moniclaw}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </Section>

      <Categories />
      <FinalCta />
    </>
  );
}
