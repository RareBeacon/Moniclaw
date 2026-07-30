import {
  Headset,
  Landmark,
  LineChart,
  Megaphone,
  Search,
  TerminalSquare,
  UserRoundPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type AgentCategory = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  examples: string[];
};

export const agentCategories: AgentCategory[] = [
  {
    id: "sales",
    name: "Sales & Pipeline",
    description: "Keeps the CRM honest and the pipeline warm while reps sell.",
    icon: LineChart,
    examples: ["Lead enrichment", "CRM hygiene", "Outbound follow-up", "Quote prep"],
  },
  {
    id: "support",
    name: "Customer Support",
    description: "Resolves the tickets that follow a process, flags the ones that don't.",
    icon: Headset,
    examples: ["Ticket triage", "Refund processing", "Order lookups", "CSAT follow-up"],
  },
  {
    id: "finance",
    name: "Finance & Ops",
    description: "Closes the loop between invoices, portals, and the general ledger.",
    icon: Wallet,
    examples: ["Invoice processing", "AR follow-up", "Payout reconciliation", "Vendor onboarding"],
  },
  {
    id: "marketing",
    name: "Marketing & Content",
    description: "Ships the operational half of marketing that never fits the calendar.",
    icon: Megaphone,
    examples: ["Campaign QA", "Listing updates", "Report assembly", "Competitor tracking"],
  },
  {
    id: "hr",
    name: "HR & Recruiting",
    description: "Moves candidates and onboarding forward without the copy-paste.",
    icon: UserRoundPlus,
    examples: ["Candidate sourcing", "Interview scheduling", "ATS updates", "Onboarding checks"],
  },
  {
    id: "research",
    name: "Data & Research",
    description: "Turns the open web and your tools into structured, cited answers.",
    icon: Search,
    examples: ["Market scans", "Vendor comparisons", "Data normalization", "Weekly briefs"],
  },
  {
    id: "engineering",
    name: "Engineering & QA",
    description: "Handles the repetitive clicks between a pull request and production.",
    icon: TerminalSquare,
    examples: ["Regression passes", "Env provisioning", "Release checks", "Log triage"],
  },
  {
    id: "executive",
    name: "Executive Ops",
    description: "The chief-of-staff workload, minus the calendar Tetris.",
    icon: Landmark,
    examples: ["Board pack assembly", "KPI digests", "Inbox triage", "Expense audits"],
  },
];
