/**
 * Phase 8 · First-party template catalog (declarative worker packages).
 *
 * Curated here, seeded into `agent_templates` by scripts/seed-templates.mts
 * (idempotent slug upserts) so the runtime always reads from the DB. Every
 * manifest is validated by tests/agent-templates.test.ts against the SAME
 * resolvers the orchestrator uses (resolveToolPolicy / resolveBudget) — a
 * template that can't dispatch never ships.
 */

export interface TemplateManifest {
  status: "DRAFT" | "SHADOW";
  trigger: "MANUAL" | "SCHEDULE";
  schedule?: string;
  goal: string;
  instructions: string;
  skills: string[];
  toolPolicy: Record<string, unknown>;
  budget: { maxSteps: number; maxTokens: number; maxCostMicros: number; maxDurationMs: number };
}

export interface CatalogTemplate {
  slug: string;
  name: string;
  summary: string;
  description: string;
  category: "Research" | "Operations" | "Sales" | "Support";
  workerType: "research" | "ops" | "general";
  icon: string; // lucide key
  manifest: TemplateManifest;
}

const RESEARCH_BUDGET = { maxSteps: 14, maxTokens: 80_000, maxCostMicros: 750_000, maxDurationMs: 300_000 };
const OPS_BUDGET = { maxSteps: 10, maxTokens: 40_000, maxCostMicros: 400_000, maxDurationMs: 240_000 };

export const FIRST_PARTY_TEMPLATES: CatalogTemplate[] = [
  {
    slug: "research-prospect-deepdive",
    name: "Prospect Deep-Dive",
    summary: "Turn a company name into a cited prospect brief: what they do, pain signals, and the angle to open with.",
    description:
      "Give it a company (and optionally a contact) and it researches the public footprint — site, hiring, news, logistics footprint — then writes a cited brief with a concrete opening angle for your first touch.",
    category: "Sales",
    workerType: "research",
    icon: "Target",
    manifest: {
      status: "SHADOW",
      trigger: "MANUAL",
      goal: "Produce a cited prospect brief for the company I name, covering what the company does, recent signals (news, hiring, expansion), likely pains relevant to my offer, and a one-line opening angle.",
      instructions:
        "Cite every claim with a source URL. If the website is unreachable, say so and continue with other public sources. End with three suggested first-touch angles ranked by evidence strength. Never invent facts — mark unknowns explicitly.",
      skills: ["web-research", "company-profiling", "brief-writing"],
      toolPolicy: {},
      budget: RESEARCH_BUDGET,
    },
  },
  {
    slug: "research-competitor-watch",
    name: "Competitor Watch",
    summary: "A weekly cited digest of what your named competitors shipped, announced, and changed.",
    description:
      "Runs every Monday: for each competitor in your goal, it scans changelogs, blogs, and news, then distills what changed since last week into a short cited digest perfect for the team channel.",
    category: "Research",
    workerType: "research",
    icon: "Radar",
    manifest: {
      status: "SHADOW",
      trigger: "SCHEDULE",
      schedule: "0 8 * * 1",
      goal: "Compile this week's movement digest for the competitors I list: launches, pricing or policy changes, notable hires, and announcements — each item with a source and a one-line 'why it matters to us'.",
      instructions:
        "Group items by competitor, most important first. Link every claim. If a competitor had no detectable movement, write 'no notable movement' rather than padding. Keep the digest under 400 words per competitor.",
      skills: ["web-research", "competitive-analysis", "digest-writing"],
      toolPolicy: {},
      budget: RESEARCH_BUDGET,
    },
  },
  {
    slug: "ops-weekly-report",
    name: "Weekly Ops Reporter",
    summary: "Friday afternoon: your week's numbers and narrative, drafted from workspace data into one status report.",
    description:
      "Ends your week by pulling the workspace's own activity (runs closed, deals moved, drafts sent) into a crisp status report you can forward as-is.",
    category: "Operations",
    workerType: "ops",
    icon: "FileBarChart",
    manifest: {
      status: "SHADOW",
      trigger: "SCHEDULE",
      schedule: "0 16 * * 5",
      goal: "Draft this week's operations status report from the workspace's data: what moved, what's blocked, what's next. Use knowledge and memory where available; structure it for a busy reader.",
      instructions:
        "Lead with the three most important movements. Use short sections: Wins, In-flight, Blockers, Next week. Plain numbers over adjectives. If a section is empty, omit it.",
      skills: ["report-writing", "data-summaries", "ops-analysis"],
      toolPolicy: {},
      budget: OPS_BUDGET,
    },
  },
  {
    slug: "research-market-map",
    name: "Market Map Analyst",
    summary: "Map an industry niche: the players, segments, and where the whitespace actually is.",
    description:
      "Point it at a niche ('3PLs serving e-commerce in West Africa') and it builds a cited map of the players, how they segment, typical pricing anchors, and where an entrant has room.",
    category: "Research",
    workerType: "research",
    icon: "Map",
    manifest: {
      status: "SHADOW",
      trigger: "MANUAL",
      goal: "Build a cited market map for the niche I name: main players grouped by segment, their positioning, pricing anchors where public, and two or three defensible whitespace opportunities.",
      instructions:
        "Prefer primary sources (company sites, official filings) over listicles. Note the date of any pricing. End with an assumptions section listing what you could not verify.",
      skills: ["web-research", "market-analysis", "segmentation"],
      toolPolicy: {},
      budget: RESEARCH_BUDGET,
    },
  },
  {
    slug: "ops-data-entry-browser",
    name: "Portal Data Entry",
    summary: "Fill repetitive portal/browser forms from a structured brief — with screenshots as evidence of each step.",
    description:
      "For portals without an API: describe the records and the portal, and the worker drives a real browser to enter them, capturing screenshots so a human can audit every submission afterwards.",
    category: "Operations",
    workerType: "general",
    icon: "MonitorSmartphone",
    manifest: {
      status: "SHADOW",
      trigger: "MANUAL",
      goal: "Enter the records I provide into the web portal I describe, step by step in the browser, and return a submission ledger: record → status → screenshot reference.",
      instructions:
        "Never submit a payment or legally binding form — stop and ask. Capture a screenshot before and after each submission blob. If a field is ambiguous, leave it blank and flag it rather than guessing.",
      skills: ["browser-automation", "data-entry", "form-filling"],
      toolPolicy: {},
      budget: OPS_BUDGET,
    },
  },
  {
    slug: "general-inbox-triage",
    name: "Inbox Triage Drafter",
    summary: "Turn a pile of pasted threads into a prioritized triage list with ready-to-edit reply drafts.",
    description:
      "Paste your threads (or describe the inbox): it classifies each by urgency and intent, then drafts the replies you'd want to start from — nothing ever sends itself.",
    category: "Support",
    workerType: "general",
    icon: "Inbox",
    manifest: {
      status: "SHADOW",
      trigger: "MANUAL",
      goal: "Triage the email threads I provide: classify each by intent and urgency, extract the actual ask, and draft a reply in my tone that I can edit and send.",
      instructions:
        "Order output by urgency. Keep drafts under 120 words, direct, and specific to the ask. If a thread needs information I don't have, draft the clarifying question instead. Flag anything that smells like a phishing or legal risk instead of drafting a reply.",
      skills: ["email-drafting", "classification", "prioritization"],
      toolPolicy: {},
      budget: OPS_BUDGET,
    },
  },
  {
    slug: "general-meeting-crm-notes",
    name: "Meeting Notes → CRM",
    summary: "Paste raw meeting notes; get structured CRM-ready fields: contacts, pains, commitments, next steps.",
    description:
      "After a call, paste messy notes: it extracts the companies and contacts mentioned, the pains and numbers they volunteered, the commitments each side made, and a follow-up checklist.",
    category: "Sales",
    workerType: "general",
    icon: "NotebookPen",
    manifest: {
      status: "SHADOW",
      trigger: "MANUAL",
      goal: "Convert my raw meeting notes into structured CRM fields: companies, contacts with roles, stated pains with any numbers mentioned, commitments by side, and suggested next steps with owners.",
      instructions:
        "Quote exact figures and dates the other side gave — never round. Mark anything ambiguous with [verify]. Output JSON-safe structure first, then a 5-line human summary.",
      skills: ["note-structuring", "crm-hygiene", "follow-up-planning"],
      toolPolicy: {},
      budget: OPS_BUDGET,
    },
  },
  {
    slug: "ops-invoice-chaser",
    name: "Invoice Chaser Drafts",
    summary: "Courteous, firm, escalating dunning drafts for the overdue invoices you list.",
    description:
      "Give it your overdue invoices (client, amount, days late) and it writes the reminder sequence — polite nudge, firm follow-up, final notice — calibrated so you stay professional and get paid.",
    category: "Operations",
    workerType: "ops",
    icon: "ReceiptText",
    manifest: {
      status: "SHADOW",
      trigger: "MANUAL",
      goal: "Draft dunning emails for the overdue invoices I provide: one courteous nudge, one firm follow-up, and one final notice per invoice, each quoting invoice number, amount, and days overdue.",
      instructions:
        "No threats, no guilt trips — professional and specific. Escalate firmness across the sequence. Include payment-link placeholders as {payment_link} so nothing fake is invented.",
      skills: ["email-drafting", "collections", "client-relations"],
      toolPolicy: {},
      budget: OPS_BUDGET,
    },
  },
];
