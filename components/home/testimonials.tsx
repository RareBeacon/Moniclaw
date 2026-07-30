import { Quote } from "lucide-react";

import { testimonials } from "@/lib/social-proof";
import { Section, SectionHeading } from "@/components/shared/section";
import { RevealGroup, RevealItem } from "@/components/shared/reveal";
import { Card, CardContent } from "@/components/ui/card";

export function Testimonials() {
  return (
    <Section>
      <SectionHeading
        eyebrow="In production"
        title="Teams that stopped doing the busywork"
        description="From logistics to healthcare, operators trust MoniClaw agents with the workflows their businesses run on — because they can see, approve, and replay every move."
      />
      <RevealGroup className="mt-16 grid gap-6 lg:grid-cols-3">
        {testimonials.map((t) => (
          <RevealItem key={t.name}>
            <Card className="flex h-full flex-col">
              <CardContent className="flex h-full flex-col gap-6 p-7">
                <Quote className="h-6 w-6 text-primary/50" aria-hidden />
                <blockquote className="flex-1 text-[0.95rem] leading-7 text-foreground/90">
                  “{t.quote}”
                </blockquote>
                <div className="flex items-end justify-between gap-4 border-t pt-5">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-indigo-600/80 text-xs font-semibold text-white"
                    >
                      {t.initials}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.role}, {t.company}
                      </p>
                    </div>
                  </div>
                  {t.metric && (
                    <div className="text-right">
                      <p className="text-lg font-semibold text-primary">{t.metric}</p>
                      <p className="text-[0.68rem] leading-4 text-muted-foreground">
                        {t.metricLabel}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
