import { ArrowDown, Check, FileText, ShieldCheck, Sparkles } from "lucide-react";

import { Section, SectionHeading } from "@/components/shared/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/shared/reveal";

const outcomes = [
  {
    title: "Delegate outcomes, not steps",
    body: "Describe the definition of done — 'every invoice under 30 days is chased weekly' — and MoniClaw plans the clicks, reads the screens, and handles the exceptions.",
  },
  {
    title: "Works in the tools you already have",
    body: "Agents operate real browsers and your real apps — no rip-and-replace, no year of API projects. If your team could click it, an agent can run it.",
  },
  {
    title: "Authority that scales with trust",
    body: "Start in shadow mode, promote to supervised, then autonomous — with dollar thresholds, budgets, and named approvers at every stage.",
  },
];

function DelegationVisual() {
  return (
    <div className="relative flex flex-col items-center gap-0" aria-hidden>
      <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-soft">
        <div className="flex items-center gap-2.5 text-xs font-medium text-muted-foreground">
          <FileText className="h-4 w-4 text-primary" />
          Job description
        </div>
        <p className="mt-3 rounded-lg bg-secondary/70 p-3 text-[0.8rem] leading-6 text-foreground/90">
          “Every Monday, reconcile last week&apos;s Stripe payouts against
          NetSuite. Flag any variance over $25 to Finance, draft the
          correction entries, and post the summary in #close.”
        </p>
      </div>

      <ArrowDown className="my-3 h-4 w-4 text-muted-foreground/60" />

      <div className="flex w-full max-w-sm items-center justify-center gap-2">
        {["Vault access", "Thresholds", "Budgets"].map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            {chip}
          </span>
        ))}
      </div>

      <ArrowDown className="my-3 h-4 w-4 text-muted-foreground/60" />

      <div className="w-full max-w-sm rounded-xl border bg-gradient-to-b from-accent to-card p-5 shadow-glow">
        <div className="flex items-center gap-2.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Monday, 06:00 — done before standup
        </div>
        <ul className="mt-3 space-y-2">
          {[
            "214 payouts reconciled, zero variance missed",
            "3 anomalies flagged with evidence attached",
            "12 correction entries drafted for approval",
          ].map((line) => (
            <li key={line} className="flex items-start gap-2 text-[0.8rem]">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Solution() {
  return (
    <Section className="bg-secondary/20">
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <div>
          <SectionHeading
            align="left"
            eyebrow="The MoniClaw way"
            title="Stop managing steps. Start delegating jobs."
            description="MoniClaw turns a written job description into a governed, autonomous agent — one that keeps working through redesigns, edge cases, and 3 a.m. queues, and that asks before it acts beyond the authority you give it."
          />
          <RevealGroup className="mt-10 space-y-7">
            {outcomes.map((item) => (
              <RevealItem key={item.title}>
                <div className="flex gap-4">
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
                  </div>
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1.5 text-[0.925rem] leading-7 text-muted-foreground">
                      {item.body}
                    </p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>

        <Reveal delay={0.15} className="lg:justify-self-end">
          <DelegationVisual />
        </Reveal>
      </div>
    </Section>
  );
}
