import type { Locator, Page } from "playwright-core";
import { CueError } from "../errors";
import { scoreSelector } from "./score";
import { toSelectorQuery, type ResolvedSelector, type SelectorQuery, type SelectorSpec } from "./types";

/** Map a normalized spec to a playwright Locator (lazy — no DOM hit yet). */
export function toLocator(page: Page, spec: SelectorSpec): Locator {
  switch (spec.strategy) {
    case "css":
      return page.locator(spec.value);
    case "xpath":
      return page.locator(`xpath=${spec.value}`);
    case "text":
      return page.getByText(spec.value, { exact: spec.exact });
    case "role":
      return page.getByRole(spec.role as never, spec.name ? { name: spec.name } : {});
    case "aria":
      return page.locator(`[aria-label=${JSON.stringify(spec.value)}]`);
    case "label":
      return page.getByLabel(spec.value);
    case "placeholder":
      return page.getByPlaceholder(spec.value);
    case "testid":
      return page.getByTestId(spec.value);
  }
}

interface Probe { count: number; visible: boolean }

async function probe(locator: Locator): Promise<Probe> {
  const count = await locator.count().catch(() => 0);
  if (count === 0) return { count, visible: false };
  const visible = await locator.first().isVisible().catch(() => false);
  return { count, visible };
}

export interface SelectorResolution {
  locator: Locator;
  resolved: ResolvedSelector;
}

/**
 * Probe primary, then fallbacks in order — cheap DOM probes first (action
 * calls still get their own visibility wait via resolveStrict), so healing
 * decisions are made on real page state, not on guesswork.
 */
export async function resolveSelector(page: Page, queryInput: SelectorQuery | SelectorSpec): Promise<SelectorResolution> {
  const query = toSelectorQuery(queryInput);
  const candidates = [query.primary, ...query.fallbacks];
  for (const [index, spec] of candidates.entries()) {
    const locator = toLocator(page, spec);
    const { count, visible } = await probe(locator);
    if (count === 0) continue;
    const confidence = scoreSelector(spec, count, { visible });
    return {
      locator: count === 1 ? locator : locator.first(),
      resolved: {
        spec,
        healedFrom: index > 0 ? query.primary : undefined,
        confidence,
        matchCount: count,
      },
    };
  }
  throw new CueError("selector_not_found", `No selector matched (tried ${candidates.length}): ${describeCandidates(candidates)}`);
}

/**
 * Resolution + interaction wait in one step: the winning locator gets a
 * visibility wait bounded by the query/action timeout before returning.
 */
export async function resolveStrict(
  page: Page,
  queryInput: SelectorQuery | SelectorSpec,
  timeoutMs = 30_000
): Promise<SelectorResolution> {
  const query = toSelectorQuery(queryInput);
  const candidates = [query.primary, ...query.fallbacks];
  const perCandidate = Math.max(500, Math.floor((query.timeoutMs ?? timeoutMs) / candidates.length));

  for (const [index, spec] of candidates.entries()) {
    const locator = toLocator(page, spec);
    try {
      await locator.first().waitFor({ state: "visible", timeout: perCandidate });
    } catch {
      continue; // next fallback
    }
    const { count, visible } = await probe(locator);
    const confidence = scoreSelector(spec, count || 1, { visible: visible || true });
    return {
      locator: count && count > 1 ? locator.first() : locator,
      resolved: {
        spec,
        healedFrom: index > 0 ? query.primary : undefined,
        confidence,
        matchCount: count || 1,
      },
    };
  }
  throw new CueError(
    "selector_not_found",
    `No selector became visible within ${query.timeoutMs ?? timeoutMs}ms (tried ${candidates.length}): ${describeCandidates(candidates)}`
  );
}

export function describeCandidates(specs: SelectorSpec[]): string {
  return specs
    .map((s) => (s.strategy === "role" ? `role:${s.role}${s.name ? `(${s.name})` : ""}` : `${s.strategy}:${"value" in s ? s.value.slice(0, 40) : ""}`))
    .join(" → ");
}
