import { z } from "zod";

/** Normalized selector specification — strategy-tagged, JSON-serializable. */
export const selectorSpecSchema = z.discriminatedUnion("strategy", [
  z.object({ strategy: z.literal("css"), value: z.string().min(1).max(500) }),
  z.object({ strategy: z.literal("xpath"), value: z.string().min(1).max(1000) }),
  z.object({ strategy: z.literal("text"), value: z.string().min(1).max(300), exact: z.boolean().default(false) }),
  z.object({ strategy: z.literal("role"), role: z.string().min(1).max(60), name: z.string().max(200).optional() }),
  z.object({ strategy: z.literal("aria"), value: z.string().min(1).max(300) }), // aria-label
  z.object({ strategy: z.literal("label"), value: z.string().min(1).max(300) }), // associated <label> text
  z.object({ strategy: z.literal("placeholder"), value: z.string().min(1).max(300) }),
  z.object({ strategy: z.literal("testid"), value: z.string().min(1).max(200) }),
]);
export type SelectorSpec = z.infer<typeof selectorSpecSchema>;

export const selectorQuerySchema = z.object({
  primary: selectorSpecSchema,
  /** Ordered fallbacks — self-healing tries these after the primary fails. */
  fallbacks: z.array(selectorSpecSchema).max(6).default([]),
  timeoutMs: z.number().int().min(100).max(60_000).optional(),
});
export type SelectorQuery = z.infer<typeof selectorQuerySchema>;

/** Anything that can become a SelectorQuery (spec shorthand linted to a query). */
export function toSelectorQuery(input: SelectorSpec | SelectorQuery): SelectorQuery {
  if ("primary" in input) return input;
  return { primary: input, fallbacks: [] };
}

export interface ResolvedSelector {
  spec: SelectorSpec;
  /** Present when a fallback won — the original primary (self-healing trail). */
  healedFrom?: SelectorSpec;
  /** 0..1 — strategy strength × uniqueness × visibility (see score.ts). */
  confidence: number;
  /** How many elements the winning spec matched. */
  matchCount: number;
}

/** Candidate emitted by auto-selector discovery (see discover.ts). */
export interface SelectorCandidate {
  spec: SelectorSpec;
  confidence: number;
  reason: string;
}
