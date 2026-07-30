import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { pricingTiers } from "@/lib/pricing";
import { Section, SectionHeading } from "@/components/shared/section";
import { RevealGroup, RevealItem } from "@/components/shared/reveal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PricingPreview() {
  const preview = pricingTiers.slice(0, 3);

  return (
    <Section className="bg-secondary/20">
      <SectionHeading
        eyebrow="Pricing"
        title="Pay for work done, not seats filled"
        description="Start free and prove the economics on a real workflow. Scale to a governed, multi-agent workforce when the ROI dashboard makes the case for you."
      />
      <RevealGroup className="mx-auto mt-16 grid max-w-5xl gap-6 lg:grid-cols-3">
        {preview.map((tier) => (
          <RevealItem key={tier.id}>
            <div
              className={cn(
                "relative flex h-full flex-col rounded-2xl border bg-card p-7",
                tier.highlighted && "border-primary/50 shadow-glow"
              )}
            >
              {tier.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold">{tier.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{tier.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tracking-tight">
                  ${tier.monthlyPrice}
                </span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {tier.limits.agents} · {tier.limits.credits}
              </p>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {tier.features.slice(0, 5).map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={tier.ctaHref}
                className={cn(
                  buttonVariants({
                    variant: tier.highlighted ? "default" : "outline",
                  }),
                  "mt-7"
                )}
              >
                {tier.cta}
              </Link>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
      <p className="mt-10 text-center">
        <Link href="/pricing" className={cn(buttonVariants({ variant: "link" }), "group text-base")}>
          Compare all plans and the full feature matrix
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </p>
    </Section>
  );
}
