import { features } from "@/lib/features";
import { Section, SectionHeading } from "@/components/shared/section";
import { IconBadge } from "@/components/shared/icon-badge";
import { RevealGroup, RevealItem } from "@/components/shared/reveal";
import { cn } from "@/lib/utils";

/** Inline visual for the wide "credential vault" card. */
function VaultVisual() {
  const scopes = [
    { domain: "vendor-portal.com", scope: "read + submit ≤ $200" },
    { domain: "stripe.com", scope: "read-only" },
    { domain: "gmail.com", scope: "send · no delete" },
  ];
  return (
    <div className="mt-5 grid gap-2" aria-hidden>
      {scopes.map((row) => (
        <div
          key={row.domain}
          className="flex items-center justify-between rounded-lg border bg-background/80 px-3.5 py-2.5 font-mono text-[0.72rem]"
        >
          <span className="text-muted-foreground">{row.domain}</span>
          <span className="text-primary">{row.scope}</span>
        </div>
      ))}
    </div>
  );
}

/** Inline visual for the wide "run replay" card. */
function ReplayVisual() {
  return (
    <div className="mt-5" aria-hidden>
      <div className="flex items-center gap-3 rounded-lg border bg-background/80 px-3.5 py-3">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-primary/70 to-primary" />
        </div>
        <span className="font-mono text-[0.72rem] text-muted-foreground">09:46:31 / 09:47:05</span>
      </div>
    </div>
  );
}

export function FeaturesGrid() {
  return (
    <Section className="bg-secondary/20">
      <SectionHeading
        eyebrow="The platform"
        title="Everything around the agent, so the agent can work"
        description="Capability is table stakes. What makes an AI workforce deployable is the operating system around it — identity, permissions, evidence, and controls designed for auditors as much as operators."
      />
      <RevealGroup className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <RevealItem
            key={feature.id}
            className={cn(feature.size === "wide" && "sm:col-span-2")}
          >
            <div className="flex h-full flex-col rounded-xl border bg-card p-7 transition-shadow hover:shadow-soft">
              <IconBadge icon={feature.icon} />
              <h3 className="mt-4 font-semibold">{feature.title}</h3>
              <p className="mt-1.5 text-[0.9rem] leading-7 text-muted-foreground">
                {feature.description}
              </p>
              {feature.id === "vault" && <VaultVisual />}
              {feature.id === "replay" && <ReplayVisual />}
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
