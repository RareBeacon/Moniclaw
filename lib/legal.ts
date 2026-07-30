export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  list?: string[];
};

export type LegalDoc = {
  title: string;
  lastUpdated: string;
  intro: string[];
  sections: LegalSection[];
  contactNote: string;
};

const CONTACT_NOTE =
  "Questions about this document? Contact our legal team at legal@moniclaw.com, or by post at MoniClaw, Inc., Attn: Legal, 548 Market St, Suite 62089, San Francisco, CA 94104, USA.";

export const privacyPolicy: LegalDoc = {
  title: "Privacy Policy",
  lastUpdated: "July 15, 2026",
  intro: [
    "MoniClaw, Inc. (\"MoniClaw\", \"we\", \"us\") operates moniclaw.com and the MoniClaw platform (the \"Service\") — an operating system for creating and managing AI employees that perform business tasks across browsers, software, and APIs.",
    "This Privacy Policy explains what personal data we collect, why we collect it, how long we keep it, and the rights you have over it. The short version: we collect what we need to run and secure a business service, we never sell personal data, and we never use your data to train AI models.",
  ],
  sections: [
    {
      id: "data-we-collect",
      title: "1. Data we collect",
      paragraphs: [
        "We collect personal data in three ways: data you give us, data the Service generates, and data we receive from integrations you connect.",
      ],
      list: [
        "Account data — your name, work email, password (hashed), company name, role, and billing details when you create an account or purchase a plan.",
        "Configuration data — the job descriptions, guardrails, approval policies, and workflow settings you define for your agents.",
        "Run data — records of agent activity, including action logs, screenshots, timestamps, reasoning summaries, and API payloads, which may incidentally contain personal data of your customers or counterparties.",
        "Credential data — secrets you store in the credential vault. These are encrypted with keys isolated per workspace and are never readable in plaintext by MoniClaw staff.",
        "Usage and device data — pages viewed, features used, browser type, IP address, and similar telemetry used for security and product improvement.",
        "Communications — messages you send to support, sales, or other MoniClaw addresses, and your communication preferences.",
      ],
    },
    {
      id: "how-we-use-data",
      title: "2. How we use data",
      paragraphs: ["We use personal data only for the following purposes:"],
      list: [
        "Operating the Service — authenticating you, provisioning agent environments, executing and recording runs, and enforcing your guardrails.",
        "Security — detecting abuse, fraud, and unauthorized access; rate limiting; and maintaining audit trails.",
        "Billing and administration — processing payments, sending invoices, and managing your plan.",
        "Service communications — security alerts, run escalations you configure, product updates, and administrative notices.",
        "Improving the Service — analyzing aggregated, de-identified usage patterns to improve reliability and design. Individual run contents are not used for this purpose.",
      ],
    },
    {
      id: "no-model-training",
      title: "3. We do not train AI models on your data",
      paragraphs: [
        "Your prompts, job descriptions, run data, documents, credentials, and any personal data within them are never used to train, fine-tune, or evaluate AI models — MoniClaw's or any third party's. Where we use third-party model providers to execute your runs, we contractually require the same prohibition and configure providers for zero retention where available.",
      ],
    },
    {
      id: "legal-bases",
      title: "4. Legal bases (EEA/UK users)",
      paragraphs: [
        "Where the GDPR or UK GDPR applies, we process personal data on the following bases: performance of our contract with you (operating the Service, billing); our legitimate interests in security and service improvement, balanced against your rights; compliance with legal obligations (tax, accounting, lawful requests); and, where required, your consent (for example, optional marketing emails), which you may withdraw at any time.",
      ],
    },
    {
      id: "sharing",
      title: "5. Who we share data with",
      paragraphs: [
        "We share personal data only with the categories of recipients below, each under written data protection terms:",
      ],
      list: [
        "Infrastructure providers — cloud hosting, storage, and networking vendors that run the Service.",
        "Model providers — to execute agent runs, as described in Section 3.",
        "Payment processors — to process transactions; card details never touch MoniClaw servers.",
        "Professional advisers — auditors, lawyers, and insurers, under confidentiality obligations.",
        "Authorities — where disclosure is required by law, regulation, or valid legal process, and where permitted we will notify you first.",
      ],
    },
    {
      id: "cookies",
      title: "6. Cookies and similar technologies",
      paragraphs: [
        "We use strictly necessary cookies for authentication and security, and preference cookies to remember settings such as your theme. We use privacy-respecting, aggregate product analytics that does not build cross-site profiles. Where required, non-essential cookies load only after consent, which you can change at any time from your account settings.",
      ],
    },
    {
      id: "retention",
      title: "7. Data retention",
      paragraphs: [
        "We retain account data for as long as your account is active. Run data retention is configurable per workspace (7 days on Starter, configurable on paid plans) and expires automatically. Billing records are kept for the period required by tax and accounting law (typically 7 years). When you delete your account, personal data is deleted or irreversibly anonymized within 30 days, except backups, which expire on a 30-day cycle — and anything we must retain by law.",
      ],
    },
    {
      id: "international-transfers",
      title: "8. International data transfers",
      paragraphs: [
        "MoniClaw is headquartered in the United States. Where personal data is transferred from the EEA, UK, or Switzerland, we rely on adequacy decisions where applicable and otherwise on Standard Contractual Clauses, supplemented by technical measures including encryption and per-workspace key isolation. Business plans and above may pin processing and storage to a specific region.",
      ],
    },
    {
      id: "security",
      title: "9. Security",
      paragraphs: [
        "We protect data with encryption in transit (TLS 1.3) and at rest (AES-256), per-workspace encryption key isolation, least-privilege internal access with hardware-key authentication, continuous monitoring, and independent penetration testing. No method of transmission or storage is perfectly secure; if an incident affects your data, we will notify you without undue delay and share what we know, what it means, and what we're doing about it.",
      ],
    },
    {
      id: "your-rights",
      title: "10. Your rights",
      paragraphs: [
        "Depending on your location, you may have the right to access, correct, delete, or port your personal data; to object to or restrict certain processing; to withdraw consent; and to lodge a complaint with a supervisory authority.",
        "You can exercise most rights directly in workspace settings, or by writing to privacy@moniclaw.com. We respond to verified requests within 30 days. California residents: we do not \"sell\" or \"share\" personal information as defined by the CCPA/CPRA, and we honor Global Privacy Control signals.",
      ],
    },
    {
      id: "children",
      title: "11. Children's privacy",
      paragraphs: [
        "The Service is a business product and is not directed at children under 16. We do not knowingly collect personal data from children. If you believe a child has provided us personal data, contact us and we will delete it.",
      ],
    },
    {
      id: "changes",
      title: "12. Changes to this policy",
      paragraphs: [
        "We may update this policy as the Service evolves. Material changes will be announced by email and in-product notice at least 14 days before they take effect, and the \"last updated\" date above will always reflect the current version.",
      ],
    },
  ],
  contactNote: CONTACT_NOTE,
};

export const termsOfService: LegalDoc = {
  title: "Terms of Service",
  lastUpdated: "July 15, 2026",
  intro: [
    "These Terms of Service (the \"Terms\") form a binding agreement between MoniClaw, Inc. (\"MoniClaw\", \"we\") and the customer identified on signup or in an order form (\"you\", \"Customer\"). By creating an account, clicking accept, or using the MoniClaw platform (the \"Service\"), you agree to these Terms. If you accept on behalf of an organization, you represent that you are authorized to bind that organization.",
  ],
  sections: [
    {
      id: "the-service",
      title: "1. The Service",
      paragraphs: [
        "MoniClaw provides an operating system for creating, deploying, and governing autonomous AI agents (\"Agents\") that perform business tasks across browsers, software, and APIs under your configuration and control.",
        "The Service includes the web dashboard, agent runtime, credential vault, agent skills library, APIs, SDKs, and documentation. We may modify features over time; we will not materially degrade the Service during a paid term without notice and an offer to terminate for a prorated refund.",
      ],
    },
    {
      id: "your-account",
      title: "2. Accounts and responsibilities",
      paragraphs: [
        "You must provide accurate registration information, keep credentials confidential, and promptly notify us of any unauthorized use. You are responsible for all activity under your account and for the actions of users you invite.",
        "You must be at least 18 years old and able to form a binding contract. One person or entity may not maintain multiple free accounts.",
      ],
    },
    {
      id: "agents-and-your-responsibility",
      title: "3. Agents act on your behalf",
      paragraphs: [
        "Agents perform actions as your agent in the legal sense: under your instructions, for your benefit, and within the permissions you grant. You remain responsible for actions taken by Agents under your account, as you would be for actions of employees or contractors.",
        "You are responsible for: (a) ensuring you have the right to access the third-party systems your Agents use; (b) configuring guardrails, approvals, and budgets appropriate to the risk of each workflow, including using shadow mode and supervision for high-impact actions; and (c) complying with the terms of the third-party services you access through Agents.",
        "You must not configure Agents to take actions that are unlawful, deceptive, or that you would not be permitted to take yourself — including unauthorized access, evading access controls, sending spam, or generating fraudulent records.",
      ],
    },
    {
      id: "acceptable-use",
      title: "4. Acceptable use",
      paragraphs: ["You will not, and will not permit Agents or users to:"],
      list: [
        "Violate any law, regulation, or third-party right, or access systems without authorization.",
        "Probe, scan, or test the vulnerability of the Service or any network, or interfere with other customers' use.",
        "Reverse engineer the Service except as permitted by law, or use it to build a competing product.",
        "Misrepresent Agent output as human work where disclosure is legally required.",
        "Exceed plan limits through technical circumvention, or resell the Service without a written agreement.",
      ],
    },
    {
      id: "plans-and-billing",
      title: "5. Plans, credits, and billing",
      paragraphs: [
        "The Service is offered under free and paid plans described on our pricing page. Paid plans bill in advance, monthly or annually, in US dollars, exclusive of taxes, which you are responsible for (excluding taxes on our income). Fees are non-refundable except as stated in these Terms or required by law.",
        "Plan usage is measured in task credits as described in the documentation. Overage, if enabled, bills at your plan's published rate. We may change pricing on renewal with at least 30 days' notice.",
        "You may cancel at any time; cancellation takes effect at the end of the current billing period. Annual plans may be terminated for a prorated refund within the first 60 days.",
      ],
    },
    {
      id: "data",
      title: "6. Your data",
      paragraphs: [
        "You retain all rights to data you submit to the Service (\"Customer Data\"), including configurations, run data, and content accessed through Agents in your environment. You grant us a limited license to process Customer Data solely to provide and secure the Service.",
        "We do not use Customer Data to train AI models. Our Privacy Policy and, where executed, our Data Processing Addendum govern processing of personal data and prevail over any conflicting term here.",
        "You may export your run history and configurations at any time during your subscription, and for 30 days after termination, after which we will delete Customer Data per the retention terms in the Privacy Policy.",
      ],
    },
    {
      id: "ip",
      title: "7. Intellectual property",
      paragraphs: [
        "We own the Service, including all software, skills, models we develop, branding, and documentation, and all improvements we make to them. These Terms grant you a limited, non-exclusive, non-transferable right to use the Service during your subscription.",
        "Skills, prompts, and workflow configurations you create are yours. If you give us feedback, you grant us a perpetual right to use it without obligation to you.",
      ],
    },
    {
      id: "third-party-services",
      title: "8. Third-party services",
      paragraphs: [
        "The Service interoperates with third-party websites, software, and APIs that are outside our control. Their availability, terms, and conduct are the responsibility of their providers. We are not liable for third-party services, including changes that affect Agent performance — though we work continuously to keep skills current.",
      ],
    },
    {
      id: "warranties",
      title: "9. Warranties and disclaimers",
      paragraphs: [
        "We warrant that the Service will materially conform to its documentation and that paid plans will meet the uptime SLA stated on the pricing page, with service credits as the exclusive remedy for SLA breaches.",
        "Except as stated here, the Service is provided \"as is\". We disclaim all other warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. Agents are probabilistic systems: we design them to fail safely, but we do not warrant that any individual Agent action will be correct — which is why guardrails and approval thresholds exist.",
      ],
    },
    {
      id: "limited-liability",
      title: "10. Limitation of liability",
      paragraphs: [
        "To the maximum extent permitted by law: neither party is liable for indirect, incidental, special, consequential, or punitive damages, or lost profits, revenues, data, or goodwill, even if advised of their possibility.",
        "Each party's total aggregate liability arising from these Terms is capped at the amounts you paid us in the 12 months preceding the claim (or $100 for free plans). These limits do not apply to your payment obligations, your breach of acceptable use, either party's indemnification obligations, or liability that cannot be limited by law.",
        "Given that Agents act on your instructions within your guardrails, you are responsible for reviewing and approving high-impact actions, and MoniClaw is not liable for losses arising from actions you approved or permitted within your configured policies.",
      ],
    },
    {
      id: "indemnification",
      title: "11. Indemnification",
      paragraphs: [
        "We will defend you against third-party claims that the Service, as provided by us and used per these Terms, infringes intellectual property rights, and will pay resulting damages and costs. If the Service is enjoined, we may modify it, procure rights, or terminate the affected subscription with a prorated refund.",
        "You will defend us against claims arising from your Customer Data, your use of Agents in violation of these Terms or law, or your access of third-party services without authorization.",
      ],
    },
    {
      id: "term-termination",
      title: "12. Term and termination",
      paragraphs: [
        "These Terms apply while you use the Service. Either party may terminate for material breach with 30 days' notice if the breach is not cured. We may suspend the Service immediately for security emergencies, legal risk, or abuse, and will notify you with as much detail as lawful.",
        "On termination, your right to use the Service ends, accrued obligations survive, and data is handled per Section 6.",
      ],
    },
    {
      id: "general",
      title: "13. General",
      paragraphs: [
        "These Terms are governed by the laws of the State of California, excluding conflict-of-law rules. Disputes will be resolved in the state or federal courts of San Francisco County, and the parties consent to their jurisdiction; nothing prevents either party from seeking injunctive relief or you from bringing claims in small claims court.",
        "These Terms, plus any order form and DPA, are the entire agreement. Changes must be in writing, except we may update these Terms with 30 days' notice for continued use — continuing to use the Service accepts the update. Neither party is liable for delays caused by events beyond reasonable control. You may not assign these Terms without our consent; we may assign them in connection with a merger, acquisition, or sale of assets. If a provision is unenforceable, the remainder continues. Failure to enforce a provision is not a waiver. Notices to MoniClaw: legal@moniclaw.com.",
      ],
    },
  ],
  contactNote: CONTACT_NOTE,
};
