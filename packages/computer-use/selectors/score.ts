import type { SelectorSpec } from "./types";

/**
 * Confidence scoring — pure functions (unit-testable without a browser).
 *
 * score = base(strategy) × uniqueness(matchCount) × visibility
 *
 * Strategy bases reward determinism (testid > id-ish css > role+name …) and
 * penalize brittleness (xpath deep paths, positional css). Uniqueness decays
 * as a match set grows: a single visible match is worth far more than 12.
 */

const STRATEGY_BASE: Record<SelectorSpec["strategy"], number> = {
  testid: 0.98,
  aria: 0.92,
  label: 0.9,
  placeholder: 0.88,
  role: 0.9,
  text: 0.72,
  css: 0.6,
  xpath: 0.5,
};

export function strategyBase(spec: SelectorSpec): number {
  let base = STRATEGY_BASE[spec.strategy];
  if (spec.strategy === "role" && !spec.name) base -= 0.12; // unscoped role is vague
  if (spec.strategy === "css") {
    if (/#-?[_a-zA-Z]+[_a-zA-Z0-9-]*$/.test(spec.value)) base += 0.3; // id selector
    if (/:nth-of-type|:nth-child/.test(spec.value)) base -= 0.15; // positional
    if (spec.value.split(" ").length > 4) base -= 0.1; // over-qualified
  }
  if (spec.strategy === "xpath" && (spec.value.match(/\//g) ?? []).length > 5) base -= 0.1;
  return clamp01(base);
}

export function uniquenessFactor(matchCount: number): number {
  if (matchCount <= 0) return 0;
  if (matchCount === 1) return 1;
  return 1 / (1 + 0.35 * (matchCount - 1));
}

export function scoreSelector(
  spec: SelectorSpec,
  matchCount: number,
  opts: { visible?: boolean } = {}
): number {
  const base = strategyBase(spec);
  const unique = uniquenessFactor(matchCount);
  const visible = opts.visible === false ? 0.7 : 1;
  return clamp01(base * unique * visible);
}

/** Discover-time prior when no page probe ran yet (pure strategy strength). */
export function priorConfidence(spec: SelectorSpec): number {
  return clamp01(strategyBase(spec) * 0.9);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
}
