import type { Metadata } from "next";
import Link from "next/link";
import {
  Compass,
  Eye,
  Handshake,
  Landmark,
  ShieldAlert,
  Timer,
} from "lucide-react";

import { siteConfig } from "@/lib/site";
import { Section, Eyebrow } from "@/components/shared/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/shared/reveal";
import { GridBackdrop, Glow } from "@/components/shared/backgrounds";
import { IconBadge } from "@/components/shared/icon-badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "About — software should finish jobs, not create them",
  description:
    "MoniClaw is the operating system for the AI workforce. We build agents businesses can trust with real work — and the governance to prove they deserve it.",
};

const values = [
  {
    icon: Eye,
    title: "Evidence over demos",
    body: "Anyone can stage twelve impressive minutes. We measure completion, grounding, safe-stop, and recovery — and publish the scorecards. If a claim can't be replayed, it isn't one.",
  },
  {
    icon: ShieldAlert,
    title: "Fail safe, then say so",
    body: "Uncertainty should stop a run, not spur a guess. We design for the stop, log the reason, and tell you plainly when something didn't work. Trust compounds through honest incident reports.",
  },
  {
    icon: Handshake,
    title: "Delegate outcomes",
    body: "Businesses don't want more tools to operate. They want jobs finished. We hold ourselves accountable to completed work — invoices processed, tickets resolved — not features shipped.",
  },
  {
    icon: Timer,
    title: "Boring reliability",
    body: "The frontier is thrilling; operations must not be. Uptime, audit trails, regression suites, and release notes that say when a number moved. The excitement belongs in your margins.",
  },
  {
    icon: Landmark,
    title: "Data is the customer's, period",
    body: "Never sold, never trained on, exportable always. A vendor confident in its value doesn't need your data hostage as a business model.",
  },
  {
    icon: Compass,
    title: "Craft in the details",
    body: "The approval email that's a pleasure to act on. The replay that answers the question in one click. Details are where enterprise software earns its keep — or loses its users.",
  },
];

const team = [
  { name: "Adaeze Okonkwo", role: "Co-founder & CEO", initials: "AO", bio: "Previously ran operations at a global logistics firm; lived the swivel-chair problem firsthand." },
  { name: "Tomas Lindqvist", role: "Co-founder & CTO", initials: "TL", bio: "Spent a decade building browser infrastructure and autonomous systems at scale." },
  { name: "Marion Delacroix", role: "Head of Product", initials: "MD", bio: "Ex-enterprise SaaS; obsessed with the governance layer that makes autonomy deployable." },
  { name: "Yusuf Al-Rashid", role: "Head of Engineering", initials: "YA", bio: "Distributed systems and agent reliability — author of our public evaluation framework." },
  { name: "Keiko Tanabe", role: "Head of Design", initials: "KT", bio: "Believes enterprise software should feel like a well-kept workshop, not a cockpit." },
  { name: "Rafael Mendes", role: "Head of Trust & Safety", initials: "RM", bio: "Former compliance lead; owns our SOC 2 program and the bar every agent must clear." },
];

const milestones = [
  { year: "2024", text: "Founded in San Francisco by operators who had automated the same workflows by hand one too many times." },
  { year: "2025", text: "First 100 design partners. The credential vault, shadow mode, and run replay ship — the governance layer before the hype." },
  { year: "2026", text: "MoniClaw 1.0, generally available. A million workflows later, the thesis holds: capability plus governance beats either alone." },
];

const openings = [
  { title: "Senior Agent Runtime Engineer", team: "Engineering", location: "Remote (US/EU)" },
  { title: "Product Designer, Governance", team: "Design", location: "San Francisco / Remote" },
  { title: "Forward-Deployed Operator", team: "Customer", location: "New York" },
];

export default function AboutPage() {
  return (
    <>
      {/* ── Mission ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-20 sm:py-28">
        <GridBackdrop />
        <Glow className="left-1/2 top-[-12rem] h-[24rem] w-[46rem] -translate-x-1/2" />
        <div className="container relative">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow className="justify-center">About MoniClaw</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">
              Software should finish jobs, not create them
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              We&apos;re building the operating system for the AI workforce —
              agents businesses can trust with real work, and the governance to
              prove they deserve it.
            </p>
          </div>
        </div>
      </section>

      {/* ── Story ────────────────────────────────────────────── */}
      <Section className="border-y bg-secondary/20 py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Why we exist
            </h2>
          </Reveal>
          <div className="space-y-6 text-[1.02rem] leading-8 text-muted-foreground">
            <p>
              MoniClaw began with a spreadsheet — the unglamorous kind, tracking
              invoices across nine vendor portals, maintained by a talented
              finance lead who had started measuring her week in logins. Her
              company had bought tools to make her faster. What she needed was
              for the job to be <strong className="text-foreground">done</strong>.
            </p>
            <p>
              In {siteConfig.founded}, we started building the thing that should
              have existed: software you can hire, not just buy. Agents that
              operate the tools you already have, governed the way you&apos;d
              govern any employee — identity, permissions, supervision, and a
              paper trail — and measured on outcomes, not activity.
            </p>
            <p>
              Today, MoniClaw agents run production operations for logistics
              firms, healthcare groups, banks, and two-person startups. The
              common thread isn&apos;t industry — it&apos;s the decision to stop
              spending human attention on work that only needed human judgment
              partly, and human patience not at all.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Milestones ───────────────────────────────────────── */}
      <Section className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              The short history
            </h2>
          </Reveal>
          <ol className="mt-10 space-y-0">
            {milestones.map((m, i) => (
              <Reveal key={m.year} delay={i * 0.05}>
                <li className="relative flex gap-8 border-l pb-10 pl-8 last:pb-0">
                  <span
                    aria-hidden
                    className="absolute -left-[7px] top-1 h-3.5 w-3.5 rounded-full border-2 border-primary bg-background"
                  />
                  <span className="w-14 shrink-0 font-mono text-sm font-semibold text-primary">
                    {m.year}
                  </span>
                  <p className="leading-7 text-muted-foreground">{m.text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </Section>

      {/* ── Values ───────────────────────────────────────────── */}
      <Section className="border-y bg-secondary/20">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow className="justify-center">How we work</Eyebrow>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
            Principles we answer to
          </h2>
        </div>
        <RevealGroup className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {values.map((value) => (
            <RevealItem key={value.title}>
              <div className="flex h-full flex-col gap-3.5 rounded-xl border bg-card p-7">
                <IconBadge icon={value.icon} />
                <h3 className="font-semibold">{value.title}</h3>
                <p className="text-[0.9rem] leading-7 text-muted-foreground">
                  {value.body}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      {/* ── Team ─────────────────────────────────────────────── */}
      <Section>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow className="justify-center">The humans</Eyebrow>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
            The people behind the agents
          </h2>
          <p className="mt-4 text-muted-foreground">
            Thirty-eight of us across San Francisco, Lagos, and remote — operators,
            engineers, and designers who take the boring parts seriously.
          </p>
        </div>
        <RevealGroup className="mx-auto mt-14 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {team.map((member) => (
            <RevealItem key={member.name}>
              <div className="flex h-full flex-col gap-4 rounded-xl border bg-card p-6">
                <span
                  aria-hidden
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-indigo-600/80 text-sm font-semibold text-white"
                >
                  {member.initials}
                </span>
                <div>
                  <h3 className="font-semibold">{member.name}</h3>
                  <p className="text-sm text-primary">{member.role}</p>
                </div>
                <p className="text-[0.85rem] leading-6 text-muted-foreground">
                  {member.bio}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      {/* ── Careers ──────────────────────────────────────────── */}
      <Section id="careers" className="pt-4">
        <div className="mx-auto max-w-4xl rounded-2xl border bg-card p-8 sm:p-12">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <Eyebrow>Careers</Eyebrow>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                Build the workforce with us
              </h2>
              <p className="mt-4 leading-7 text-muted-foreground">
                Small team, unreasonably high bar, real enterprise stakes. If
                you want your work measured in hours returned to real people,
                introduce yourself.
              </p>
            </div>
            <div className="flex-1 space-y-3">
              {openings.map((job) => (
                <Link
                  key={job.title}
                  href="/contact?topic=careers"
                  className="group flex items-center justify-between gap-4 rounded-xl border bg-background px-5 py-4 transition-colors hover:border-primary/40"
                >
                  <div>
                    <p className="font-medium">{job.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {job.team} · {job.location}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Introduce yourself →
                  </span>
                </Link>
              ))}
              <p className="text-sm text-muted-foreground">
                Don&apos;t see your role? Exceptional people:{" "}
                <a
                  href={`mailto:${siteConfig.emails.sales}?subject=Careers`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  careers@moniclaw.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
