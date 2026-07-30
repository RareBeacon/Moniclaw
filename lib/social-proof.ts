export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  company: string;
  initials: string;
  metric?: string;
  metricLabel?: string;
};

export const testimonials: Testimonial[] = [
  {
    quote:
      "We gave MoniClaw the workflow nobody wanted — invoice chasing, portal checks, reconciliation. Our books now close two days earlier and the team does the follow-ups that actually need a human.",
    name: "Renata Okafor",
    role: "VP of Finance",
    company: "Corebridge Logistics",
    initials: "RO",
    metric: "2 days",
    metricLabel: "faster monthly close",
  },
  {
    quote:
      "I was skeptical until I watched an agent recover from a vendor's site redesign on its own — it re-read the page, found the new layout, and flagged the change for review. That's when it stopped being a tool and started being staff.",
    name: "Daniel Mercer",
    role: "Head of Revenue Operations",
    company: "Heliotrope Systems",
    initials: "DM",
    metric: "31 hrs",
    metricLabel: "saved weekly across the team",
  },
  {
    quote:
      "The audit trail sold our security team before the productivity sold me. Every action is logged, replayable, and tied to an identity. We rolled agents into procurement without a single exception from compliance.",
    name: "Priya Anand",
    role: "Chief Operating Officer",
    company: "Meridian Health Group",
    initials: "PA",
    metric: "0",
    metricLabel: "compliance exceptions in rollout",
  },
];

export const logos: { name: string; wordmark: string }[] = [
  { name: "Corebridge", wordmark: "COREBRIDGE" },
  { name: "Heliotrope", wordmark: "heliotrope" },
  { name: "Meridian Health", wordmark: "Meridian" },
  { name: "Atlas Freight", wordmark: "ATLAS FREIGHT" },
  { name: "Nimbus Bank", wordmark: "nimbus·bank" },
  { name: "Framework Legal", wordmark: "Framework" },
];
