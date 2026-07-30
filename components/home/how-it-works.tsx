import { howItWorksSteps } from "@/lib/features";
import { Section, SectionHeading } from "@/components/shared/section";
import { RevealGroup, RevealItem } from "@/components/shared/reveal";

export function HowItWorks() {
  return (
    <Section>
      <SectionHeading
        eyebrow="How it works"
        title="From job description to deployed agent in four moves"
        description="No flowcharts to draw, no brittle scripts to babysit. The same discipline you'd apply to hiring a person — description, access, boundaries, review — applied to software."
      />
      <RevealGroup className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {howItWorksSteps.map((step, index) => (
          <RevealItem key={step.number}>
            <div className="relative flex h-full flex-col gap-4 rounded-xl border bg-card p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-medium text-primary">
                  {step.number}
                </span>
                {index < howItWorksSteps.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute -right-3 top-1/2 hidden h-px w-6 bg-border lg:block"
                  />
                )}
              </div>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="text-[0.9rem] leading-7 text-muted-foreground">
                {step.description}
              </p>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
