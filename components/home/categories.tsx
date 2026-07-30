import Link from "next/link";

import { agentCategories } from "@/lib/agents";
import { Section, SectionHeading } from "@/components/shared/section";
import { IconBadge } from "@/components/shared/icon-badge";
import { RevealGroup, RevealItem } from "@/components/shared/reveal";

export function Categories() {
  return (
    <Section id="agent-library">
      <SectionHeading
        eyebrow="The agent library"
        title="Hire for any seat on the org chart"
        description="Purpose-built agent roles for every department — each starting from a hardened skill set, then shaped by your job description, your tools, and your guardrails."
      />
      <RevealGroup className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {agentCategories.map((category) => (
          <RevealItem key={category.id}>
            <Link
              href={`/features#agent-library`}
              className="group flex h-full flex-col gap-4 rounded-xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft"
            >
              <IconBadge icon={category.icon} />
              <div className="flex-1">
                <h3 className="font-semibold">{category.name}</h3>
                <p className="mt-1.5 text-[0.86rem] leading-6 text-muted-foreground">
                  {category.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {category.examples.slice(0, 3).map((example) => (
                  <span
                    key={example}
                    className="rounded-full bg-secondary px-2.5 py-1 text-[0.7rem] font-medium text-muted-foreground"
                  >
                    {example}
                  </span>
                ))}
              </div>
            </Link>
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
