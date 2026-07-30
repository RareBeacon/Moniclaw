import Link from "next/link";
import {
  Fingerprint,
  Globe2,
  KeyRound,
  Lock,
  Server,
  ShieldCheck,
} from "lucide-react";

import { Section } from "@/components/shared/section";
import { Reveal } from "@/components/shared/reveal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const controls = [
  {
    icon: Lock,
    title: "Encrypted everywhere",
    body: "TLS 1.3 in transit, AES-256 at rest, and per-workspace key isolation — credentials are injected per action and never readable in plaintext by anyone, including us.",
  },
  {
    icon: Fingerprint,
    title: "Least-privilege agent identities",
    body: "Every agent is a named identity with scoped access, working hours, and budgets — revoked in one click, reviewed like any employee's access.",
  },
  {
    icon: ShieldCheck,
    title: "Audited, not just asserted",
    body: "SOC 2 Type II program with continuous control monitoring, independent penetration tests, and a documented SDLC. Reports shared under NDA.",
  },
  {
    icon: Globe2,
    title: "Your data stays yours",
    body: "Never used to train models. Regional data residency on Business plans, GDPR-aligned processing, and DPAs backed by Standard Contractual Clauses.",
  },
];

const badges = ["SOC 2 Type II*", "GDPR aligned", "ISO 27001 controls", "AES-256", "TLS 1.3", "SSO / SAML / SCIM"];

export function Security() {
  return (
    <Section
      id="security"
      className="bg-zinc-950 text-zinc-50 dark:border-y dark:bg-zinc-900/30"
    >
      <div className="grid gap-14 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-violet-400">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              Security & trust
            </span>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[2.65rem] lg:leading-[1.15]">
              Built for the boardroom and the back office
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-400">
              An AI worker with access to your finance stack is held to the same
              bar as the employees who have it — higher, actually: every action
              recorded, every permission scoped, every secret sealed.
            </p>
          </Reveal>

          <div className="mt-9 flex flex-wrap gap-2.5">
            {badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-zinc-300"
              >
                {badge}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            *SOC 2 Type II observation window underway. Reports and the security
            whitepaper are available under NDA.
          </p>
          <Link
            href="/contact?topic=security"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "mt-7 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
            )}
          >
            Request the security whitepaper
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {controls.map((control) => (
            <Reveal key={control.title} delay={0.05}>
              <div className="flex h-full flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-6">
                <control.icon className="h-5 w-5 text-violet-400" aria-hidden />
                <h3 className="text-[0.95rem] font-semibold text-white">
                  {control.title}
                </h3>
                <p className="text-[0.85rem] leading-6 text-zinc-400">
                  {control.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}
