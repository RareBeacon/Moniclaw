import {
  CalendarClock,
  Gauge,
  History,
  KeyRound,
  Puzzle,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";

export type Feature = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  size?: "wide" | "normal";
};

export const features: Feature[] = [
  {
    id: "vault",
    title: "Credential vault",
    description:
      "Agents never see raw passwords. Credentials live in an encrypted vault and are injected per action, scoped to a domain, a destination, and a spending cap — and revoked the moment a run ends.",
    icon: KeyRound,
    size: "wide",
  },
  {
    id: "approvals",
    title: "Human-in-the-loop approvals",
    description:
      "Set the threshold once: agents act autonomously within policy and stop to ask a named human the moment a decision exceeds it — with the full context attached.",
    icon: SlidersHorizontal,
  },
  {
    id: "replay",
    title: "Run replay & audit trail",
    description:
      "Every click, keystroke, and API call is captured with screenshots and reasoning. Replay any run second-by-second, export logs to your SIEM, and answer 'what happened?' in one click.",
    icon: History,
    size: "wide",
  },
  {
    id: "budgets",
    title: "Budgets & circuit breakers",
    description:
      "Hard caps per agent, per workflow, per vendor. Anomaly detection pauses spend and pages a human before a loop becomes an invoice.",
    icon: Gauge,
  },
  {
    id: "schedules",
    title: "Schedules & triggers",
    description:
      "Run on a cron, on a webhook, on an email landing, or 24/7 watching a queue. Your agents keep hours you never could.",
    icon: CalendarClock,
  },
  {
    id: "library",
    title: "Agent skills library",
    description:
      "Start from hardened skills — browser operation, invoice processing, CRM updates, reconciliation — then teach your own with the SDK.",
    icon: Puzzle,
  },
  {
    id: "identity",
    title: "Identity & access",
    description:
      "Every agent is a first-class identity: named, permissioned, and auditable. SSO, SCIM, and role-based policies mean access reviews treat agents like staff.",
    icon: Users,
  },
  {
    id: "api",
    title: "API & webhooks",
    description:
      "Start runs, fetch results, and receive signed events for every approval, escalation, and completion. MoniClaw is infrastructure, not a walled garden.",
    icon: Webhook,
  },
  {
    id: "compliance",
    title: "Compliance by default",
    description:
      "SOC 2 controls, GDPR-aligned processing, regional data residency, and never — ever — training on your data. Security is the floor, not a tier.",
    icon: ShieldCheck,
  },
];

export type Step = {
  number: string;
  title: string;
  description: string;
};

export const howItWorksSteps: Step[] = [
  {
    number: "01",
    title: "Describe the job",
    description:
      "Write the role in plain language — the goal, the tools, the definition of done — or start from a template in the agent library. No flowcharts, no code.",
  },
  {
    number: "02",
    title: "Connect your stack",
    description:
      "Grant access through the credential vault. MoniClaw provisions a hardened browser, per-app identities, and API connectors — each scoped to exactly what the job needs.",
  },
  {
    number: "03",
    title: "Set the guardrails",
    description:
      "Define approval thresholds, budgets, working hours, and escalation paths. Dry-run the agent in shadow mode against live data until its decisions match yours.",
  },
  {
    number: "04",
    title: "Deploy and measure",
    description:
      "Go fully autonomous. Track throughput, accuracy, and cost per completed task on the ROI dashboard — and replay any run, second by second, whenever you want.",
  },
];
