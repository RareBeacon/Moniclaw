export type PostBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "quote"; text: string; cite?: string };

export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readingTime: string;
  author: {
    name: string;
    role: string;
    initials: string;
  };
  featured?: boolean;
  body: PostBlock[];
};

export const posts: Post[] = [
  {
    slug: "the-end-of-swivel-chair-work",
    title: "The end of swivel-chair work",
    excerpt:
      "For forty years, software made individual people faster. The next decade belongs to software that does the whole job. A look at what changes when you can hire work itself.",
    category: "Perspective",
    date: "July 22, 2026",
    readingTime: "6 min read",
    featured: true,
    author: {
      name: "Adaeze Okonkwo",
      role: "Co-founder & CEO",
      initials: "AO",
    },
    body: [
      {
        type: "p",
        text: "There is a kind of work that never appears in a job description but consumes every team: moving data between systems that don't talk to each other, logging into portals to check a status, copying a number from an email into a spreadsheet into another email. Operations people call it \"swivel-chair work\" — the human middleware between applications that were each, individually, supposed to save time.",
      },
      {
        type: "p",
        text: "Estimates vary, but studies of knowledge work consistently land on the same uncomfortable number: somewhere between a third and half of the modern workday goes to coordination, switching, and repetition rather than judgment. We hired brilliant people and then asked them to be the glue between their tools.",
      },
      { type: "h2", text: "Tools were the wrong unit" },
      {
        type: "p",
        text: "Every wave of business software sold the same unit: a better tool. Better CRM, better helpdesk, better ERP. Each one genuinely improved the twenty minutes a day a person spent inside it — and did nothing about the two hours spent between them. Integration platforms helped, but only for the subset of software with clean APIs and pre-built connectors, and only for workflows simple enough to survive being drawn as a flowchart.",
      },
      {
        type: "p",
        text: "The unit that actually matters to a business is not the tool. It is the completed job: the invoice processed, the candidate scheduled, the books closed. That distinction sounds semantic. It isn't. Tools are bought; jobs are delegated. And delegation is a much older, much better understood management act — with goals, guardrails, reviews, and accountability.",
      },
      { type: "h2", text: "What AI employees change" },
      {
        type: "p",
        text: "AI employees — agents that can operate a browser, your software, and your APIs end-to-end — make it possible to delegate the job instead of buying another tool to assist with it. This is the bet behind MoniClaw, and we think it reorganizes three assumptions.",
      },
      {
        type: "ul",
        items: [
          "Capacity stops scaling linearly with headcount. A three-person ops team with six agents handles volume that used to need twelve people.",
          "Consistency becomes a property of the process, not the person. The 400th invoice of the month gets the same attention as the first.",
          "Institutional knowledge becomes explicit. To delegate a job you must describe it — and a described job survives turnover, audits, and reorganizations.",
        ],
      },
      {
        type: "quote",
        text: "The question is no longer \"which tool should this team use?\" It is \"which jobs should this team never do again?\"",
      },
      { type: "h2", text: "What changes for the humans" },
      {
        type: "p",
        text: "The teams we see succeed treat agents like staff, not magic. They onboard them, review their early work, tighten the guardrails, and then — this is the part that matters — they redeploy the hours. The finance lead who stopped chasing invoices starts negotiating payment terms. The support lead who stopped triaging tickets starts fixing the product issues that create tickets.",
      },
      {
        type: "p",
        text: "Swivel-chair work was never anyone's ambition. It was an accident of software that ended at the edge of each application. The next decade of business software will be judged by a simpler standard: not how it feels to use, but how much of the job it finishes. We're building MoniClaw for that standard, and we intend to be measured by it.",
      },
    ],
  },
  {
    slug: "how-we-evaluate-agent-reliability",
    title: "Autonomy is a spectrum: how we evaluate agent reliability",
    excerpt:
      "\"It works in the demo\" is where most agent projects die. Here's the evaluation framework we run every MoniClaw skill through — and the numbers we publish with each release.",
    category: "Engineering",
    date: "July 8, 2026",
    readingTime: "9 min read",
    author: {
      name: "Tomas Lindqvist",
      role: "VP of Engineering",
      initials: "TL",
    },
    body: [
      {
        type: "p",
        text: "An agent that completes a task nine times out of ten is not 90% reliable. If the tenth attempt silently corrupts a record or emails the wrong customer, it is 0% deployable. Reliability for autonomous software has to be defined around blast radius, not averages — and measured in a way that survives contact with the real web, where layouts shift weekly and every vendor portal is its own special biome.",
      },
      { type: "h2", text: "The four numbers that matter" },
      {
        type: "p",
        text: "Every skill in the MoniClaw library ships with a public scorecard. We don't publish a skill until it clears thresholds on four metrics, each measured across thousands of runs on live and adversarially-mutated environments:",
      },
      {
        type: "ul",
        items: [
          "Completion rate: the share of runs that reach the defined goal state — not \"didn't crash,\" but provably finished the job with verified side effects.",
          "Grounding rate: how often each action is causally tied to what is actually on screen, measured with held-out DOM mutations. This is the number that predicts survival through UI redesigns.",
          "Safe-stop rate: when the agent cannot proceed correctly, how often does it stop and escalate instead of guessing? We treat a confident wrong action as a critical failure; an uncertain stop is a success.",
          "Recovery rate: after an injected failure — a timeout, a 500, a moved button — how often does the run still complete within budget without human help?",
        ],
      },
      { type: "h2", text: "Shadow mode is not optional" },
      {
        type: "p",
        text: "Benchmarks on our environments establish a floor. Your environment is the ceiling test. That's why every MoniClaw deployment starts in shadow mode: the agent performs the full job against live data but its actions are simulated rather than committed. You review a diff of what it would have done — every form filled, every message drafted, every record updated.",
      },
      {
        type: "p",
        text: "The promotion path is explicit: shadow until decision agreement exceeds your threshold (most teams set 98%), then supervised autonomy inside tight budget caps, then full autonomy with approval thresholds. Agents earn autonomy the way employees earn authority — demonstrated, incremental, revocable.",
      },
      {
        type: "quote",
        text: "The failure mode to engineer against is not the agent that breaks. It is the agent that plausibly succeeds.",
      },
      { type: "h2", text: "Why we publish the numbers" },
      {
        type: "p",
        text: "The agent industry has a demo problem: tightly scripted walkthroughs that collapse in production. The only durable fix is boring — measured scorecards, versioned skills, regression suites that run against the live web every night, and release notes that say when a number moved and why. Trust compounds the same way uptime does: slowly, publicly, and one honest incident report at a time.",
      },
      {
        type: "p",
        text: "If you're evaluating agent platforms — ours included — ask for the scorecard before the demo. Any vendor serious about autonomy will have one.",
      },
    ],
  },
  {
    slug: "buyers-guide-to-ai-employees",
    title: "A buyer's guide to AI employees: 12 questions to ask any vendor",
    excerpt:
      "The gap between an impressive agent demo and a dependable AI workforce is mostly governance. Twelve questions — and the answers you should insist on — before you sign anything.",
    category: "Playbook",
    date: "June 19, 2026",
    readingTime: "8 min read",
    author: {
      name: "Marion Delacroix",
      role: "Head of Product",
      initials: "MD",
    },
    body: [
      {
        type: "p",
        text: "Every AI agent vendor can show you a compelling twelve-minute demo. Very few can tell you, precisely, what happens in month four when a supplier redesigns their portal, or when an agent is one ambiguous retry away from double-paying an invoice. The questions below are the ones sophisticated buyers ask us. We're publishing them because the whole category gets better when buyers ask them of everyone.",
      },
      { type: "h2", text: "Identity and access" },
      {
        type: "ul",
        items: [
          "1. Does each agent operate under its own identity — or under a shared service account? (Shared accounts make audits meaningless. Walk away.)",
          "2. How are credentials stored and injected? Look for per-action injection, domain scoping, and automatic revocation after runs — never passwords in prompts.",
          "3. Can an agent's access be reviewed and revoked through your existing IdP, with SSO and SCIM?",
        ],
      },
      { type: "h2", text: "Control and accountability" },
      {
        type: "ul",
        items: [
          "4. What exactly is recorded per run? Insist on screenshots, actions, reasoning, and API payloads — replayable, exportable, and retained to your policy.",
          "5. How are approval thresholds expressed? \"The agent asks when unsure\" is marketing. You want rules: dollar amounts, customer tiers, destinations, actions.",
          "6. When the agent is uncertain, what is the default — proceed or stop? The only safe default is stop-and-escalate.",
          "7. What stops a runaway loop? Budgets, circuit breakers, and anomaly detection should be platform features, not things you build.",
        ],
      },
      { type: "h2", text: "Reliability and economics" },
      {
        type: "ul",
        items: [
          "8. Ask for the scorecard: completion, grounding, safe-stop, and recovery rates — on what environments, over how many runs?",
          "9. What does shadow mode look like, and can you go live gradually, per workflow?",
          "10. How is work priced — per seat, per run, per outcome? Model your three most expensive manual workflows and compute cost per completed task.",
          "11. What happens to your data? \"We don't train on it\" must be contractual, with retention and region controls to match.",
          "12. What is your exit? Your run history, configs, and audit logs should export cleanly. A vendor confident in its value doesn't need lock-in.",
        ],
      },
      { type: "h2", text: "The meta-question" },
      {
        type: "p",
        text: "Behind all twelve is one test: does this vendor talk about agents as employees to be governed — identities, permissions, reviews, accountability — or as magic to be believed? Buy the governance. The capability is arriving either way; the difference between a workforce and a liability is everything around it.",
      },
      {
        type: "p",
        text: "We'll happily answer all twelve on a call — and so should anyone else you evaluate.",
      },
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}
