"use client";

import * as React from "react";
import { useInView } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Loader2,
  RotateCcw,
  Terminal,
  UserCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Section, SectionHeading } from "@/components/shared/section";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

type ScenarioStep = { title: string; log: string };

type Scenario = {
  id: string;
  label: string;
  agent: string;
  trigger: string;
  steps: ScenarioStep[];
  stats: { value: string; label: string }[];
};

const scenarios: Scenario[] = [
  {
    id: "ar",
    label: "Accounts receivable",
    agent: "Mara — AR agent",
    trigger: "Cron · weekdays 06:00",
    steps: [
      { title: "Open AP/AR dashboard", log: "09:41:02 session start · identity mara.ar" },
      { title: "Pull last week's Stripe payouts", log: "09:41:19 fetch payouts → 214 records" },
      { title: "Match against open invoices in NetSuite", log: "09:44:50 match complete → 211 matched" },
      { title: "Draft correction entries for 3 variances", log: "09:46:12 variance > $25 · drafting entries" },
      { title: "Request approval from Priya (Finance)", log: "09:46:31 approval requested · slack #close" },
      { title: "Post summary & archive evidence", log: "09:47:05 summary posted · run archived" },
    ],
    stats: [
      { value: "214", label: "payouts reconciled" },
      { value: "3", label: "anomalies escalated" },
      { value: "31 min", label: "human time required: 0" },
    ],
  },
  {
    id: "sales",
    label: "Lead enrichment",
    agent: "Felix — RevOps agent",
    trigger: "Webhook · on new signup",
    steps: [
      { title: "Receive new-signup webhook", log: "14:02:11 hook received · acme-industries.io" },
      { title: "Research company & funding signals", log: "14:02:44 sources: site, filings, news" },
      { title: "Score against ICP rubric v4", log: "14:03:20 score 86/100 · tier A" },
      { title: "Enrich CRM record (HubSpot)", log: "14:03:58 17 fields updated · contact created" },
      { title: "Route to AE with brief", log: "14:04:12 brief assigned → N. Ferreira" },
      { title: "Log run & evidence pack", log: "14:04:19 replay available · 41 credits" },
    ],
    stats: [
      { value: "9 min", label: "per lead, fully hands-off" },
      { value: "86/100", label: "ICP score computed" },
      { value: "41", label: "credits consumed" },
    ],
  },
  {
    id: "qa",
    label: "Release QA pass",
    agent: "Juno — QA agent",
    trigger: "GitHub · on release PR",
    steps: [
      { title: "Provision staging environment", log: "18:22:07 env release-4812 ready" },
      { title: "Execute checkout flow suite (12 paths)", log: "18:24:51 12/12 passed · 0 flakes" },
      { title: "Run billing edge cases in Stripe test mode", log: "18:27:33 disputes, retries, dunning ok" },
      { title: "Detect visual regression on /settings", log: "18:28:02 diff 4.2% · flagged, not blocking" },
      { title: "File report with screenshots", log: "18:28:30 report → #eng-releases" },
      { title: "Approve release checklist", log: "18:28:31 checklist signed · replay archived" },
    ],
    stats: [
      { value: "97", label: "checks executed" },
      { value: "1", label: "regression flagged" },
      { value: "6 min", label: "wall-clock runtime" },
    ],
  },
];

function RunReplay() {
  const [scenario, setScenario] = React.useState(scenarios[0]);
  const [stepIndex, setStepIndex] = React.useState(-1); // -1 = not started
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: "-120px" });
  const total = scenario.steps.length;
  const complete = stepIndex >= total - 1;

  React.useEffect(() => {
    if (!inView) return;
    if (stepIndex === -1) {
      const t = setTimeout(() => setStepIndex(0), 500);
      return () => clearTimeout(t);
    }
    const delay = complete ? 3600 : 1500;
    const t = setTimeout(() => {
      setStepIndex((i) => (complete ? 0 : i + 1));
    }, delay);
    return () => clearTimeout(t);
  }, [inView, stepIndex, complete]);

  const switchScenario = (next: Scenario) => {
    setScenario(next);
    setStepIndex(0);
  };

  const visibleLogs = scenario.steps.slice(0, Math.max(stepIndex, 0) + 1);

  return (
    <div ref={containerRef}>
      {/* Scenario tabs */}
      <div
        role="tablist"
        aria-label="Example agent runs"
        className="mx-auto flex w-fit max-w-full flex-wrap justify-center gap-1.5 rounded-full border bg-card p-1.5"
      >
        {scenarios.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={scenario.id === s.id}
            onClick={() => switchScenario(s)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              scenario.id === s.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Replay window */}
      <div className="mx-auto mt-8 max-w-5xl overflow-hidden rounded-2xl border bg-card shadow-soft">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-secondary/50 px-5 py-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <UserCheck className="h-4 w-4 text-primary" aria-hidden />
            {scenario.agent}
          </span>
          <span>{scenario.trigger}</span>
          <span className="ml-auto flex items-center gap-1.5">
            {!complete ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden />
                Live replay
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-500" aria-hidden />
                Run complete — restarting shortly
              </>
            )}
          </span>
        </div>

        <div className="grid lg:grid-cols-2">
          {/* Steps */}
          <ol className="space-y-1 border-b p-5 lg:border-b-0 lg:border-r">
            {scenario.steps.map((step, i) => {
              const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "pending";
              return (
                <li
                  key={step.title}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    state === "active" && "bg-accent/70"
                  )}
                >
                  {state === "done" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                  ) : state === "active" ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
                  )}
                  <span
                    className={cn(
                      "transition-colors",
                      state === "pending" && "text-muted-foreground/50",
                      state === "done" && "text-muted-foreground"
                    )}
                  >
                    {step.title}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* Log console */}
          <div className="bg-zinc-950 p-5 font-mono text-xs leading-7 text-zinc-300 dark:bg-zinc-900/50">
            <p className="mb-3 flex items-center gap-2 text-zinc-500">
              <Terminal className="h-3.5 w-3.5" aria-hidden />
              run log — replayable forever
            </p>
            {visibleLogs.length === 0 && (
              <p className="text-zinc-600">waiting for run to begin…</p>
            )}
            {visibleLogs.map((step, i) => (
              <p key={`${scenario.id}-${i}`} className="animate-fade-in">
                <span className="text-zinc-600">$ </span>
                {step.log}
                {i === stepIndex && !complete && (
                  <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse-soft bg-emerald-400 align-middle" />
                )}
              </p>
            ))}
            {complete && (
              <p className="animate-fade-in text-emerald-400">
                $ exit 0 · evidence pack sealed · <RotateCcw className="inline h-3 w-3" aria-hidden />
              </p>
            )}
          </div>
        </div>

        {/* Footer stats */}
        <div className="grid grid-cols-1 divide-y border-t bg-secondary/30 text-center sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {scenario.stats.map((stat) => (
            <div key={stat.label} className="px-4 py-4">
              <p className="text-lg font-semibold tracking-tight">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-8 text-center">
        <Link
          href="/signup"
          className={cn(buttonVariants({ variant: "link" }), "text-base")}
        >
          Run your own workflow like this — free
        </Link>
      </p>
    </div>
  );
}

export function Demo() {
  return (
    <Section id="demo" className="bg-secondary/20">
      <SectionHeading
        eyebrow="See it work"
        title="Watch a run, not a ad"
        description="Every MoniClaw run is recorded like this: each action, each decision, each approval — replayable second by second. These are three real shapes of work our customers hand to agents every day."
      />
      <div className="mt-14">
        <RunReplay />
      </div>
    </Section>
  );
}
