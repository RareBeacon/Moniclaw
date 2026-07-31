import type { Page } from "playwright-core";
import { scanInteractiveElements, type ElementFingerprint } from "../selectors/discover";

/** Baseline page understanding built from the DOM — always available. */

export interface LayoutRegion {
  kind: "header" | "nav" | "main" | "footer" | "aside" | "section" | "unknown";
  label: string | null;
  bounds: { x: number; y: number; width: number; height: number } | null;
  textSample: string;
  interactiveCount: number;
}

export interface PageUnderstanding {
  url: string;
  title: string;
  viewport: { width: number; height: number } | null;
  regions: LayoutRegion[];
  interactive: ElementFingerprint[];
  interactiveCount: number;
  visibleTextChars: number;
  /** Short human/agent digest of what is on screen. */
  summary: string;
}

const LANDMARK_SELECTOR = "header, nav, main, footer, aside, [role='banner'], [role='navigation'], [role='main'], [role='contentinfo'], [role='complementary']";

export async function analyzePageLayout(page: Page): Promise<PageUnderstanding> {
  const [title, url, viewport, textChars, regions, interactive] = await Promise.all([
    page.title().catch(() => ""),
    Promise.resolve(page.url()),
    Promise.resolve(page.viewportSize()),
    page.evaluate(() => (document.body?.innerText ?? "").length).catch(() => 0),
    page.evaluate((selector) => {
      const kindFor = (el: Element): string => {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        if (tag === "header" || role === "banner") return "header";
        if (tag === "nav" || role === "navigation") return "nav";
        if (tag === "main" || role === "main") return "main";
        if (tag === "footer" || role === "contentinfo") return "footer";
        if (tag === "aside" || role === "complementary") return "aside";
        return "section";
      };
      return Array.from(document.querySelectorAll(selector)).slice(0, 24).map((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const interactives = el.querySelectorAll("a, button, input, select, textarea, [role='button'], [tabindex]").length;
        return {
          kind: kindFor(el),
          label: el.getAttribute("aria-label") ?? el.id ?? null,
          bounds: rect.width > 0 ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
          textSample: ((el as HTMLElement).innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 140),
          interactiveCount: interactives,
        };
      });
    }, LANDMARK_SELECTOR).then((rows) => rows as LayoutRegion[]).catch(() => [] as LayoutRegion[]),
    scanInteractiveElements(page).catch(() => [] as ElementFingerprint[]),
  ]);

  const kinds = [...new Set(regions.map((r) => r.kind))];
  const summary = [
    `${title || "(untitled page)"} — ${url}`,
    `${interactive.length} interactive elements, ${textChars} visible text chars`,
    kinds.length > 0 ? `landmarks: ${kinds.join(", ")}` : "no landmark regions detected",
  ].join("; ");

  return {
    url,
    title,
    viewport: viewport ? { width: viewport.width, height: viewport.height } : null,
    regions,
    interactive,
    interactiveCount: interactive.length,
    visibleTextChars: textChars,
    summary,
  };
}
