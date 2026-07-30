"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

import { pricingTiers } from "@/lib/pricing";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PricingCards() {
  const [annual, setAnnual] = React.useState(true);

  return (
    <div>
      {/* Billing period toggle */}
      <div className="flex items-center justify-center gap-3">
        <div
          role="group"
          aria-label="Billing period"
          className="flex items-center gap-1 rounded-full border bg-card p-1"
        >
          <button
            onClick={() => setAnnual(false)}
            aria-pressed={!annual}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              !annual
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            aria-pressed={annual}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              annual
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Annual
            <span
              className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold",
                annual ? "bg-white/20 text-white" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              )}
            >
              −20%
            </span>
          </button>
        </div>
      </div>

      <div className="mx-auto mt-12 grid max-w-6xl gap-6 lg:grid-cols-4">
        {pricingTiers.map((tier) => {
          const price = annual ? tier.annualPrice : tier.monthlyPrice;
          return (
            <div
              key={tier.id}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-7 transition-shadow",
                tier.highlighted
                  ? "border-primary/50 shadow-glow lg:-my-3 lg:py-10"
                  : "hover:shadow-soft"
              )}
            >
              {tier.highlighted && (
                <span className="absolute -top-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  Most popular
                </span>
              )}
              <h2 className="text-lg font-semibold">{tier.name}</h2>
              <p className="mt-1 min-h-[2.5rem] text-sm text-muted-foreground">
                {tier.tagline}
              </p>
              <div className="mt-5 flex items-baseline gap-1.5">
                {price !== null ? (
                  <>
                    <span className="text-4xl font-semibold tracking-tight">
                      ${price}
                    </span>
                    <span className="text-sm text-muted-foreground">/month</span>
                  </>
                ) : (
                  <span className="text-4xl font-semibold tracking-tight">
                    Custom
                  </span>
                )}
              </div>
              <p className="mt-1 h-4 text-xs text-muted-foreground">
                {price !== null && price > 0
                  ? annual
                    ? "billed annually"
                    : "billed monthly"
                  : tier.limits.credits}
              </p>
              <Link
                href={tier.ctaHref}
                className={cn(
                  buttonVariants({
                    variant: tier.highlighted ? "default" : "outline",
                  }),
                  "mt-6"
                )}
              >
                {tier.cta}
              </Link>
              <ul className="mt-7 flex flex-1 flex-col gap-2.5 border-t pt-6">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-[0.84rem]">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                      aria-hidden
                    />
                    <span className="leading-5 text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
