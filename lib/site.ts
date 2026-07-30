export const siteConfig = {
  name: "MoniClaw",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://moniclaw.com",
  tagline: "The AI Workforce Operating System",
  description:
    "MoniClaw lets you hire autonomous AI employees that operate your browsers, software, and APIs — with the approvals, audit trails, and controls a real business demands.",
  emails: {
    support: "support@moniclaw.com",
    sales: "sales@moniclaw.com",
    security: "security@moniclaw.com",
    press: "press@moniclaw.com",
  },
  social: {
    github: "https://github.com/moniclaw",
    x: "https://x.com/moniclaw",
    linkedin: "https://www.linkedin.com/company/moniclaw",
  },
  founded: 2024,
} as const;

export type SiteConfig = typeof siteConfig;
