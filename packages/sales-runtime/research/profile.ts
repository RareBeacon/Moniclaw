/**
 * Maps a Phase-5 research worker report (markdown + citations) into the
 * structured CompanyProfile the CRM stores. Pure and defensive: the worker
 * is asked to emit named sections, but any section that is missing or
 * unreadable degrades to `undefined` — we never invent company facts.
 */
import { companyProfileSchema, type CompanyProfile } from "../types";

/** Report shape mirrored from packages/agent-runtime (kept structural so the
 *  package boundary stays import-light). */
export interface ResearchReportLike {
  summary: string;
  markdown: string;
  citations: Array<{ url: string; title?: string }>;
}

/** Section headings the research worker goal instructs the model to emit.
 *  Matching is case-insensitive and tolerant of `#`/`##`/bold headings. */
const SECTION_KEYS: Array<{ field: keyof CompanyProfile; headings: string[] }> = [
  { field: "industry", headings: ["industry"] },
  { field: "size", headings: ["company size", "size", "employees"] },
  { field: "geography", headings: ["geography", "headquarters", "location"] },
  { field: "businessModel", headings: ["business model"] },
  { field: "productsServices", headings: ["products & services", "products and services", "products/services", "products", "services"] },
  { field: "targetMarket", headings: ["target market", "customers", "ideal customers"] },
  { field: "techStack", headings: ["tech stack", "technology stack", "technologies"] },
  { field: "socialLinks", headings: ["social links", "social profiles", "social"] },
];

function extractSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = markdown.split(/\r?\n/);
  let current: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (current) sections.set(current, buffer.join("\n").trim());
  };

  for (const line of lines) {
    // "## Industry" | "# Industry:" | "**Industry**"
    const match = line.match(/^\s{0,3}(?:#{1,4}\s*|\*\*)(.+?)(?:\*\*)?\s*:?\s*$/);
    if (match) {
      flush();
      current = match[1].toLowerCase().replace(/\*\*/g, "").trim();
      buffer = [];
    } else if (current !== null) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

function bodyFor(sections: Map<string, string>, headings: string[]): string | undefined {
  for (const heading of headings) {
    const body = sections.get(heading);
    if (body) return body;
  }
  return undefined;
}

/** First non-empty content line of a section body (skips bullets markers). */
function firstLine(body: string): string {
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/^[-*•]\s*/, "").trim();
    if (line) return line;
  }
  return "";
}

function bulletList(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((raw) => raw.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
}

const SOCIAL_HOSTS: Array<{ type: string; host: string }> = [
  { type: "linkedin", host: "linkedin.com" },
  { type: "x", host: "x.com" },
  { type: "twitter", host: "twitter.com" },
  { type: "facebook", host: "facebook.com" },
  { type: "instagram", host: "instagram.com" },
  { type: "youtube", host: "youtube.com" },
  { type: "github", host: "github.com" },
];

function socialLinksFrom(body: string | undefined, markdown: string): Array<{ type: string; url: string }> {
  const haystack = body ?? markdown;
  const urls = haystack.match(/https?:\/\/[^\s)\]"']+/g) ?? [];
  const links: Array<{ type: string; url: string }> = [];
  const seen = new Set<string>();
  for (const url of urls) {
    const clean = url.replace(/[.,;]+$/, "");
    const found = SOCIAL_HOSTS.find(({ host }) => clean.includes(host));
    if (found && !seen.has(found.type)) {
      seen.add(found.type);
      try {
        new URL(clean); // validate
        links.push({ type: found.type, url: clean });
      } catch { /* not a parseable URL — skip */ }
    }
    if (links.length >= 10) break;
  }
  return links;
}

/**
 * Build a validated CompanyProfile from a research report.
 * Returns null fields for anything absent — SalesCompany only writes the
 * fields that are set.
 */
export function profileFromReport(report: ResearchReportLike): CompanyProfile {
  const sections = extractSections(report.markdown);

  const scalar = (field: string): string | undefined => {
    const def = SECTION_KEYS.find((k) => k.field === field)!;
    const body = bodyFor(sections, def.headings);
    if (!body) return undefined;
    const value = firstLine(body);
    return value || undefined;
  };

  const techBody = bodyFor(sections, SECTION_KEYS.find((k) => k.field === "techStack")!.headings);
  const techStack = techBody
    ? bulletList(techBody).flatMap((line) => line.split(/,|·/).map((s) => s.trim()).filter(Boolean)).slice(0, 30)
    : undefined;

  const socialBody = bodyFor(sections, SECTION_KEYS.find((k) => k.field === "socialLinks")!.headings);
  const socialLinks = socialLinksFrom(socialBody, report.markdown);

  return companyProfileSchema.parse({
    summary: report.summary.slice(0, 4000),
    industry: scalar("industry"),
    size: scalar("size"),
    geography: scalar("geography"),
    businessModel: scalar("businessModel")?.slice(0, 400),
    productsServices: scalar("productsServices")?.slice(0, 1000),
    targetMarket: scalar("targetMarket")?.slice(0, 400),
    techStack: techStack?.length ? techStack : undefined,
    socialLinks: socialLinks.length ? socialLinks : undefined,
    sources: (report.citations ?? [])
      .map((c) => ({ url: c.url, title: c.title ?? "" }))
      .filter((c) => { try { new URL(c.url); return true; } catch { return false; } })
      .slice(0, 50),
  });
}
