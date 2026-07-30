export type PricingTier = {
  id: string;
  name: string;
  tagline: string;
  monthlyPrice: number | null; // null = custom
  annualPrice: number | null; // per month, billed annually
  priceNote?: string;
  cta: string;
  ctaHref: string;
  highlighted?: boolean;
  features: string[];
  limits: {
    agents: string;
    credits: string;
    seats: string;
  };
};

export const pricingTiers: PricingTier[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Prove the model on one real workflow.",
    monthlyPrice: 0,
    annualPrice: 0,
    cta: "Start for free",
    ctaHref: "/signup",
    features: [
      "1 deployed agent",
      "500 task credits / month",
      "Browser & web-app operation",
      "Human approval on every action",
      "7-day run history",
      "Community support",
    ],
    limits: { agents: "1 agent", credits: "500 credits/mo", seats: "1 seat" },
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "A small AI team for one department.",
    monthlyPrice: 290,
    annualPrice: 242,
    cta: "Start 14-day trial",
    ctaHref: "/signup",
    highlighted: true,
    features: [
      "5 deployed agents",
      "25,000 task credits / month",
      "Credential vault with per-action scoping",
      "Approval thresholds & budgets",
      "Schedules, triggers & webhooks",
      "Unlimited run history & replay",
      "Slack & email escalations",
      "Priority support",
    ],
    limits: { agents: "5 agents", credits: "25k credits/mo", seats: "10 seats" },
  },
  {
    id: "business",
    name: "Business",
    tagline: "Cross-functional operations, centrally governed.",
    monthlyPrice: 990,
    annualPrice: 825,
    cta: "Start 14-day trial",
    ctaHref: "/signup",
    features: [
      "25 deployed agents",
      "150,000 task credits / month",
      "SSO (Google, Microsoft, Okta)",
      "Roles, teams & org-wide policies",
      "Audit log export & SIEM streaming",
      "Custom agent skills (SDK)",
      "Regional data residency",
      "99.9% uptime SLA",
    ],
    limits: { agents: "25 agents", credits: "150k credits/mo", seats: "Unlimited" },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "A governed AI workforce at company scale.",
    monthlyPrice: null,
    annualPrice: null,
    priceNote: "Custom",
    cta: "Talk to sales",
    ctaHref: "/contact?topic=sales",
    features: [
      "Unlimited agents & seats",
      "Committed-use credit pricing",
      "SAML SSO & SCIM provisioning",
      "VPC or on-prem agent runners",
      "Custom DPA, BAAs & security review",
      "Dedicated success engineer",
      "Onboarding & workflow design",
    ],
    limits: { agents: "Unlimited", credits: "Committed use", seats: "Unlimited" },
  },
];

export type ComparisonSection = {
  title: string;
  rows: {
    label: string;
    values: (string | boolean)[];
    hint?: string;
  }[];
};

export const comparisonTable: ComparisonSection[] = [
  {
    title: "Workforce",
    rows: [
      { label: "Deployed agents", values: ["1", "5", "25", "Unlimited"] },
      {
        label: "Monthly task credits",
        values: ["500", "25,000", "150,000", "Committed use"],
        hint: "A credit is one unit of agent work — a browser action, API call, or reasoning step.",
      },
      { label: "Team seats", values: ["1", "10", "Unlimited", "Unlimited"] },
      { label: "Agent templates library", values: [true, true, true, true] },
      { label: "Custom agent skills (SDK)", values: [false, false, true, true] },
    ],
  },
  {
    title: "Control & safety",
    rows: [
      {
        label: "Human-in-the-loop approvals",
        values: ["Every action", "Threshold-based", "Policy-based", "Policy-based"],
      },
      { label: "Spend budgets & circuit breakers", values: [false, true, true, true] },
      { label: "Run replay & screenshots", values: ["7 days", "Unlimited", "Unlimited", "Unlimited"] },
      { label: "Audit log export / SIEM", values: [false, false, true, true] },
    ],
  },
  {
    title: "Platform",
    rows: [
      { label: "Schedules, triggers & webhooks", values: [false, true, true, true] },
      { label: "API & SDK access", values: [true, true, true, true] },
      { label: "SSO (Google, Microsoft)", values: [false, false, true, true] },
      { label: "SAML SSO & SCIM", values: [false, false, false, true] },
      { label: "Data residency options", values: [false, false, true, true] },
      { label: "VPC / on-prem runners", values: [false, false, false, true] },
    ],
  },
  {
    title: "Support & success",
    rows: [
      { label: "Support channel", values: ["Community", "Priority email", "Priority + Slack", "Dedicated CSM"] },
      { label: "Uptime SLA", values: [false, false, "99.9%", "99.95%"] },
      { label: "Workflow design reviews", values: [false, false, true, true] },
    ],
  },
];

export const creditExplainer = {
  title: "What is a task credit?",
  body: "Agents bill for work, not seats. One task credit covers a unit of work — opening a page and extracting data, calling an API, drafting and sending a message, or reconciling a record. A full workflow (say, processing one invoice end-to-end) typically consumes 8–14 credits. Unused credits don't roll over; overage is billed at your plan's per-credit rate or can be capped by policy.",
};
