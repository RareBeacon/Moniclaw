import Link from "next/link";
import { MessagesSquare } from "lucide-react";

import { homeFaqs } from "@/lib/faq";
import { siteConfig } from "@/lib/site";
import { Section, SectionHeading } from "@/components/shared/section";
import { Reveal } from "@/components/shared/reveal";
import { Accordion } from "@/components/ui/accordion";

export function Faq() {
  return (
    <Section>
      <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading
            align="left"
            eyebrow="FAQ"
            title="Fair questions, straight answers"
            description="Everything operators, finance leads, and security teams ask before deploying their first agent."
          />
          <Reveal delay={0.1}>
            <div className="mt-8 rounded-xl border bg-card p-6">
              <MessagesSquare className="h-5 w-5 text-primary" aria-hidden />
              <p className="mt-3 font-medium">Something more specific?</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Our team answers every message personally — usually within one
                business day.
              </p>
              <Link
                href="/contact"
                className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Contact us
              </Link>
              <span className="mx-2 text-muted-foreground/40">·</span>
              <a
                href={`mailto:${siteConfig.emails.sales}`}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {siteConfig.emails.sales}
              </a>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.05}>
          <Accordion items={homeFaqs} />
        </Reveal>
      </div>
    </Section>
  );
}
