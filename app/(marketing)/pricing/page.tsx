import type { Metadata } from "next";
import { Check, Info, Minus } from "lucide-react";

import { comparisonTable, creditExplainer, pricingTiers } from "@/lib/pricing";
import { pricingFaqs } from "@/lib/faq";
import { Section, SectionHeading, Eyebrow } from "@/components/shared/section";
import { Reveal } from "@/components/shared/reveal";
import { GridBackdrop, Glow } from "@/components/shared/backgrounds";
import { PricingCards } from "@/components/pricing/pricing-client";
import { Accordion } from "@/components/ui/accordion";
import { FinalCta } from "@/components/home/final-cta";

export const metadata: Metadata = {
  title: "Pricing — pay for work done, not seats filled",
  description:
    "Start free, scale to a governed AI workforce. Transparent credit-based pricing with approval controls, budgets, and no lock-in.",
};

export default function PricingPage() {
  return (
    <>
      <section className="relative overflow-hidden py-20 sm:py-28">
        <GridBackdrop />
        <Glow className="left-1/2 top-[-12rem] h-[24rem] w-[46rem] -translate-x-1/2" />
        <div className="container relative">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow className="justify-center">Pricing</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">
              Priced like payroll-light, not enterprise software
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              Pay for completed work, measured in credits. Start free, prove the
              economics on one workflow, then scale when the ROI dashboard —
              not a salesperson — makes the case.
            </p>
          </div>
          <div className="mt-14">
            <PricingCards />
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            All plans include unlimited run replay retention on paid tiers, API
            access, and no training on your data. Overage available on Growth
            and Business at published per-credit rates.
          </p>
        </div>
      </section>

      {/* ── Credit explainer ─────────────────────────────────── */}
      <Section className="py-12">
        <Reveal>
          <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-2xl border bg-card p-8 sm:flex-row sm:items-start sm:gap-6">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Info className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-semibold">{creditExplainer.title}</h2>
              <p className="mt-2 leading-7 text-muted-foreground">
                {creditExplainer.body}
              </p>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ── Comparison matrix ────────────────────────────────── */}
      <Section className="py-16 sm:py-24">
        <SectionHeading
          eyebrow="Compare plans"
          title="The full feature matrix"
          description="Every plan, every control, side by side. If you can't tell which plan you need, you need Starter."
        />
        <div className="mx-auto mt-16 max-w-5xl overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b">
                <th scope="col" className="py-4 pr-4 font-semibold">
                  <span className="text-muted-foreground">Feature</span>
                </th>
                {pricingTiers.map((tier) => (
                  <th key={tier.id} scope="col" className="px-4 py-4 font-semibold">
                    {tier.name}
                    {tier.highlighted && (
                      <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[0.65rem] font-semibold text-accent-foreground">
                        Popular
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            {comparisonTable.map((section) => (
              <tbody key={section.title}>
                <tr className="border-b bg-secondary/40">
                  <th
                    colSpan={5}
                    scope="rowgroup"
                    className="px-1 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                  >
                    {section.title}
                  </th>
                </tr>
                {section.rows.map((row) => (
                  <tr key={row.label} className="border-b last:border-0">
                    <th scope="row" className="py-3.5 pr-4 font-medium text-foreground/90">
                      {row.label}
                      {row.hint && (
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          {row.hint}
                        </span>
                      )}
                    </th>
                    {row.values.map((value, i) => (
                      <td key={i} className="px-4 py-3.5">
                        {typeof value === "boolean" ? (
                          value ? (
                            <Check className="h-4 w-4 text-primary" aria-label="Included" />
                          ) : (
                            <Minus className="h-4 w-4 text-muted-foreground/40" aria-label="Not included" />
                          )
                        ) : (
                          <span className="text-muted-foreground">{value}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Section>

      {/* ── Pricing FAQ ──────────────────────────────────────── */}
      <Section className="pt-4">
        <SectionHeading
          eyebrow="Pricing FAQ"
          title="No surprise invoices"
        />
        <div className="mx-auto mt-12 max-w-3xl">
          <Accordion items={pricingFaqs} />
        </div>
      </Section>

      <FinalCta />
    </>
  );
}
