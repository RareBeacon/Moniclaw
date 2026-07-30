import type { Metadata } from "next";
import { Clock, Mail, MapPin, ShieldCheck } from "lucide-react";

import { siteConfig } from "@/lib/site";
import { Section, Eyebrow } from "@/components/shared/section";
import { GridBackdrop, Glow } from "@/components/shared/backgrounds";
import { ContactForm } from "@/components/contact/contact-form";

export const metadata: Metadata = {
  title: "Contact — talk to a human",
  description:
    "Questions about MoniClaw? Sales, support, security, or press — a human replies within one business day.",
};

const channels = [
  {
    icon: Mail,
    title: "Sales & pricing",
    note: "Walk through your workflows and get a credit model.",
    email: siteConfig.emails.sales,
  },
  {
    icon: Mail,
    title: "Support",
    note: "Run issues, billing, and account help.",
    email: siteConfig.emails.support,
  },
  {
    icon: ShieldCheck,
    title: "Security & compliance",
    note: "Whitepapers, SOC 2 reports, vendor reviews.",
    email: siteConfig.emails.security,
  },
];

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;

  return (
    <>
      <section className="relative overflow-hidden py-20 sm:py-24">
        <GridBackdrop />
        <Glow className="left-1/2 top-[-12rem] h-[22rem] w-[42rem] -translate-x-1/2" />
        <div className="container relative">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow className="justify-center">Contact</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
              Talk to a human about the non-human workforce
            </h1>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Whether you&apos;re scoping your first agent or reviewing us for
              the enterprise, you&apos;ll get a specific answer from a person —
              usually within one business day.
            </p>
          </div>
        </div>
      </section>

      <Section className="pt-0">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <aside className="flex flex-col gap-6">
            {channels.map((channel) => (
              <div
                key={channel.title}
                className="rounded-xl border bg-card p-5"
              >
                <h2 className="flex items-center gap-2.5 text-sm font-semibold">
                  <channel.icon className="h-4 w-4 text-primary" aria-hidden />
                  {channel.title}
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {channel.note}
                </p>
                <a
                  href={`mailto:${channel.email}`}
                  className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {channel.email}
                </a>
              </div>
            ))}
            <div className="rounded-xl border bg-card p-5">
              <h2 className="flex items-center gap-2.5 text-sm font-semibold">
                <Clock className="h-4 w-4 text-primary" aria-hidden />
                Response times
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Sales & support: within one business day.
                <br />
                Security reviews: within two business days.
                <br />
                Paid plans: in-product priority channels.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <h2 className="flex items-center gap-2.5 text-sm font-semibold">
                <MapPin className="h-4 w-4 text-primary" aria-hidden />
                Headquarters
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                548 Market St, Suite 62089
                <br />
                San Francisco, CA 94104
                <br />
                United States
              </p>
            </div>
          </aside>

          <ContactForm initialTopic={topic} key={topic ?? "default"} />
        </div>
      </Section>
    </>
  );
}
