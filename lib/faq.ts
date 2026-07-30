export type FaqItem = {
  question: string;
  answer: string;
};

export const homeFaqs: FaqItem[] = [
  {
    question: "What exactly can a MoniClaw agent do?",
    answer:
      "Anything a person can do through a screen: navigate websites and web apps, fill forms, extract and reconcile data, call APIs, move information between systems, draft and send communications, and follow multi-step procedures. Agents work through a hardened browser and controlled API connectors — no screen-scraping hacks, no shared passwords.",
  },
  {
    question: "How is this different from a chatbot, RPA, or Zapier?",
    answer:
      "Chatbots talk; MoniClaw agents do. RPA follows rigid scripts that break when a button moves; MoniClaw agents read the UI and reason about it, so they tolerate layout changes and edge cases. Zapier moves data between pre-built integrations; MoniClaw operates the tools themselves — including ones with no API — and handles judgment calls along the way, escalating to a human when confidence is low.",
  },
  {
    question: "How do I stay in control of what agents can do?",
    answer:
      "Every agent runs under its own identity with least-privilege credentials scoped from your vault. You set approval thresholds (e.g., auto-approve refunds under $50, require a human above it), budgets per workflow, and circuit breakers that pause an agent after anomalies. Every click, keystroke, and API call is recorded and replayable.",
  },
  {
    question: "What happens when an agent gets stuck or makes a mistake?",
    answer:
      "Agents are designed to fail safely: when confidence drops or a step fails repeatedly, the run pauses and escalates to a named human with full context — screenshots, the plan, and where it stopped. Mistakes trigger your review queue, and run replay lets you pinpoint what happened and adjust the job description or guardrails.",
  },
  {
    question: "Do you train AI models on my company's data?",
    answer:
      "No. Your prompts, runs, documents, and credentials are never used to train models — ours or anyone else's. Data is encrypted in transit and at rest, and Business plans and above can pin processing to a specific region.",
  },
  {
    question: "How quickly can I get value?",
    answer:
      "Most teams deploy their first agent in an afternoon using a template from the library, and reach steady-state automation of a full workflow within two weeks. Starter is free, so you can validate the economics on a real workflow before spending anything.",
  },
  {
    question: "Which tools does MoniClaw integrate with?",
    answer:
      "If it runs in a browser, an agent can operate it — Salesforce, HubSpot, NetSuite, Workday, Zendesk, your internal admin panels, and the long tail of tools with no API. We also ship first-class connectors for common APIs (Stripe, Slack, Gmail, Google Workspace, Notion, GitHub, and 60+ more) plus a REST API and webhooks for your own systems.",
  },
  {
    question: "How do I justify the cost vs. hiring?",
    answer:
      "Price against the work, not the headcount. A Growth plan at $290/month covers roughly 1,800 completed workflows — most teams replace 20–40 hours of weekly repetitive work. Customers typically report payback inside the first month and a fully-loaded cost per completed task that is 5–15x lower than manual processing.",
  },
];

export const pricingFaqs: FaqItem[] = [
  {
    question: "What counts as a task credit?",
    answer:
      "One credit is one unit of agent work: a browser action (open a page, extract a table, submit a form), an API call, or a reasoning step such as drafting a message. A complete workflow — like processing one invoice end-to-end — typically uses 8–14 credits. You can see per-run credit usage on every invoice and in the dashboard.",
  },
  {
    question: "What happens if I run out of credits?",
    answer:
      "Nothing breaks silently. Agents pause at 100% usage and notify you. You can enable automatic overage at your plan's per-credit rate, set a hard cap, or queue runs for next month. Circuit breakers let you stop any runaway workflow before it spends real money.",
  },
  {
    question: "Can I change plans or cancel anytime?",
    answer:
      "Yes. Upgrades apply immediately; downgrades and cancellations take effect at the end of the billing period. Annual plans are refundable on a prorated basis within the first 60 days. Your run history and agent configurations remain exportable forever — no lock-in.",
  },
  {
    question: "Do unused credits roll over?",
    answer:
      "Monthly plan credits reset each cycle. Committed-use Enterprise agreements can negotiate rollover and true-up terms. If you consistently under-use a tier, we'll recommend the smaller plan — our goal is utilization, not shelfware.",
  },
  {
    question: "Is there a discount for annual billing?",
    answer:
      "Yes — annual billing saves 20% across Growth and Business plans, and it's how most teams buy. Monthly billing stays available for teams that prefer flexibility.",
  },
  {
    question: "Do you offer plans for nonprofits or startups?",
    answer:
      "Registered nonprofits and early-stage startups (under 2 years old, under $2M raised) get 50% off Growth for the first year. Write to sales@moniclaw.com with proof of eligibility.",
  },
];
