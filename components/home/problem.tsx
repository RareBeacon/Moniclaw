import { Repeat2, Split, TrendingDown } from "lucide-react";

import { Section, SectionHeading } from "@/components/shared/section";
import { IconBadge } from "@/components/shared/icon-badge";
import { RevealGroup, RevealItem } from "@/components/shared/reveal";
import { Card, CardContent } from "@/components/ui/card";

const problems = [
  {
    icon: Repeat2,
    title: "Half the day is copy-paste",
    body: "Studies of knowledge work keep landing on the same number: roughly 40% of the workday goes to repetitive digital tasks — checking portals, updating records, moving data between systems that were each supposed to save time.",
  },
  {
    icon: Split,
    title: "Automation keeps breaking",
    body: "Rigid scripts snap when a vendor moves a button. Integration platforms only reach tools with clean APIs. So the long tail — the internal admin, the supplier portal, the legacy ERP — stays glued together with human attention.",
  },
  {
    icon: TrendingDown,
    title: "Headcount doesn't scale like software",
    body: "Every new customer adds linear operational load: more invoices, more tickets, more checks. Growth starts meaning 'hire more people to do the same clicks' — until margins and morale both notice.",
  },
];

export function Problem() {
  return (
    <Section>
      <SectionHeading
        eyebrow="The problem"
        title="The work isn't hard. It's endless."
        description="Your team wasn't hired to be the middleware between their tools. Yet that's where the hours go — work that needs doing perfectly, at volume, forever."
      />
      <RevealGroup className="mt-16 grid gap-6 md:grid-cols-3">
        {problems.map((problem) => (
          <RevealItem key={problem.title}>
            <Card className="h-full transition-shadow hover:shadow-soft">
              <CardContent className="flex h-full flex-col gap-4 p-7">
                <IconBadge icon={problem.icon} />
                <h3 className="text-lg font-semibold">{problem.title}</h3>
                <p className="text-[0.925rem] leading-7 text-muted-foreground">
                  {problem.body}
                </p>
              </CardContent>
            </Card>
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
