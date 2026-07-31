import type { Page } from "playwright-core";
import { priorConfidence } from "./score";
import type { SelectorCandidate, SelectorSpec } from "./types";

/** One interactive element as the page-side probe sees it. */
export interface ElementFingerprint {
  tag: string; id: string; testId: string; role: string; ariaLabel: string;
  name: string; placeholder: string; text: string; type: string;
  href: string; formAction: string; visible: boolean; nth: number;
}

/** Injected scan: fingerprints every potentially interactive element (cap 800). */
export async function scanInteractiveElements(page: Page): Promise<ElementFingerprint[]> {
  return page.evaluate(() => {
    const SELECTOR = [
      "a[href]", "button", "input", "select", "textarea",
      "[role='button']", "[role='link']", "[role='textbox']", "[role='checkbox']",
      "[role='radio']", "[role='combobox']", "[role='tab']", "[role='menuitem']",
      "[onclick]", "summary", "label",
    ].join(",");
    const els = Array.from(document.querySelectorAll(SELECTOR)).slice(0, 800);
    return els.map((el) => {
      const e = el as HTMLElement;
      const rect = e.getBoundingClientRect();
      const style = window.getComputedStyle(e);
      const implicit =
        e.tagName === "BUTTON" ? "button" :
        e.tagName === "A" ? "link" :
        e.tagName === "SELECT" ? "combobox" :
        e.tagName === "TEXTAREA" ? "textbox" :
        e.tagName === "INPUT"
          ? ({ checkbox: "checkbox", radio: "radio", submit: "button", button: "button" } as Record<string, string>)[
              (e as HTMLInputElement).type
            ] ?? "textbox"
          : "";
      const text = (e.innerText || (e as HTMLInputElement).value || "").replace(/\s+/g, " ").trim().slice(0, 120);
      const id = e.id;
      const nth =
        id || e.tagName === "BODY"
          ? 0
          : Array.prototype.indexOf.call(e.parentElement?.children ?? [], e) + 1;
      return {
        tag: e.tagName.toLowerCase(),
        id,
        testId: e.getAttribute("data-testid") || e.getAttribute("data-test-id") || "",
        role: e.getAttribute("role") || implicit,
        ariaLabel: e.getAttribute("aria-label") || "",
        name: e.getAttribute("name") || "",
        placeholder: (e as HTMLInputElement).placeholder || "",
        text,
        type: (e as HTMLInputElement).type || "",
        href: (e as HTMLAnchorElement).href || "",
        formAction: (e as HTMLFormElement).action || "",
        visible:
          rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none",
        nth,
      };
    });
  }) as Promise<ElementFingerprint[]>;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** CSS.escape equivalent (the browser global is unavailable in Node). */
function escapeIdent(value: string): string {
  return value.replace(/^\d/, (d) => `\\3${d} `).replace(/([^a-zA-Z0-9_\-\u00A0-\uFFFF])/g, (ch) => `\\${ch}`);
}

/** Pure ranker: description → best candidates with honest confidences. */
export function rankCandidates(
  description: string,
  elements: ElementFingerprint[],
  limit = 5
): SelectorCandidate[] {
  const query = norm(description);
  if (!query) return [];
  const terms = query.split(" ").filter(Boolean);
  const scored: SelectorCandidate[] = [];

  for (const el of elements) {
    if (!el.visible) continue;
    const specs: Array<{ spec: SelectorSpec; basis: string; hit: string }> = [];
    if (el.testId) specs.push({ spec: { strategy: "testid", value: el.testId }, basis: "data-testid", hit: el.testId });
    if (el.ariaLabel) specs.push({ spec: { strategy: "aria", value: el.ariaLabel }, basis: "aria-label", hit: el.ariaLabel });
    if (el.placeholder) specs.push({ spec: { strategy: "placeholder", value: el.placeholder }, basis: "placeholder", hit: el.placeholder });
    if (el.role && el.text) specs.push({ spec: { strategy: "role", role: el.role, name: el.text }, basis: `role ${el.role}`, hit: el.text });
    if (el.text) specs.push({ spec: { strategy: "text", value: el.text, exact: false }, basis: "text", hit: el.text });
    if (el.id) specs.push({ spec: { strategy: "css", value: `#${escapeIdent(el.id)}` }, basis: "id", hit: el.id });
    if (el.name) {
      specs.push({ spec: { strategy: "css", value: `${el.tag}[name=${JSON.stringify(el.name)}]` }, basis: "name", hit: el.name });
      specs.push({ spec: { strategy: "label", value: el.name }, basis: "name as label guess", hit: el.name });
    }

    for (const cand of specs) {
      const haystack = norm(`${cand.hit} ${el.text} ${el.ariaLabel} ${el.name}`);
      const matches = terms.every((t) => haystack.includes(t));
      if (!matches) continue;
      const exactBonus = norm(cand.hit) === query ? 0.12 : 0;
      const confidence = Math.min(1, priorConfidence(cand.spec) + exactBonus);
      scored.push({
        spec: cand.spec,
        confidence: Math.round(confidence * 1000) / 1000,
        reason: `matched ${cand.basis} "${cand.hit.slice(0, 60)}"`,
      });
    }
  }

  // Best candidate per spec serialization, then top-N by confidence.
  const best = new Map<string, SelectorCandidate>();
  for (const c of scored) {
    const key = JSON.stringify(c.spec);
    if ((best.get(key)?.confidence ?? 0) < c.confidence) best.set(key, c);
  }
  return [...best.values()].sort((a, b) => b.confidence - a.confidence).slice(0, limit);
}

/** Auto Selector Discovery: description → page probe → ranked specs. */
export async function discoverSelectors(
  page: Page,
  description: string,
  limit = 5
): Promise<SelectorCandidate[]> {
  const elements = await scanInteractiveElements(page);
  return rankCandidates(description, elements, limit);
}
