import { z } from "zod";
import { CueError } from "../../errors";
import { defineAction, selectorArgSchema } from "./context";
import { describeCandidates, toLocator } from "../../selectors/resolve";
import { toSelectorQuery } from "../../selectors/types";

export const waitAction = defineAction({
  id: "wait",
  name: "Wait",
  description: "Pause execution for a fixed duration (use sparingly; prefer wait_for_selector/navigation).",
  category: "dom",
  permission: "read",
  risk: "low",
  schema: z.object({ ms: z.number().int().min(50).max(60_000) }),
  async execute(ctx, args) {
    ctx.assertPermission("read");
    await new Promise((resolve) => setTimeout(resolve, args.ms));
    return { data: { waitedMs: args.ms } };
  },
});

export const waitForSelectorAction = defineAction({
  id: "wait_for_selector",
  name: "Wait For Selector",
  description: "Wait until a selector reaches a state (visible/attached/hidden/detached), with fallback self-healing.",
  category: "dom",
  permission: "read",
  risk: "low",
  schema: z.object({
    selector: selectorArgSchema,
    state: z.enum(["visible", "attached", "hidden", "detached"]).default("visible"),
    timeoutMs: z.number().int().min(100).max(120_000).optional(),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("read");
    const timeout = args.timeoutMs ?? ctx.limits.actionTimeoutMs;
    const query = toSelectorQuery(args.selector as never);
    const candidates = [query.primary, ...query.fallbacks];
    const perCandidate = Math.max(500, Math.floor((query.timeoutMs ?? timeout) / candidates.length));
    for (const [index, spec] of candidates.entries()) {
      const locator = toLocator(ctx.handle.page(), spec);
      try {
        await locator.first().waitFor({ state: args.state, timeout: perCandidate });
      } catch {
        continue;
      }
      return {
        data: {
          state: args.state,
          selector: spec,
          ...(index > 0 ? { healedFrom: candidates[0] } : {}),
        },
      };
    }
    throw new CueError(
      "selector_not_found",
      `No selector reached state "${args.state}" within ${query.timeoutMs ?? timeout}ms (tried ${candidates.length}): ${describeCandidates(candidates)}`
    );
  },
});

export const waitForNavigationAction = defineAction({
  id: "wait_for_navigation",
  name: "Wait For Navigation",
  description: "Wait for the active tab to navigate (optionally matching a URL glob/regex) after another action triggered it.",
  category: "navigation",
  permission: "navigate",
  risk: "low",
  schema: z.object({
    url: z.string().min(1).max(500).optional(),
    waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).default("load"),
    timeoutMs: z.number().int().min(500).max(120_000).optional(),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("navigate");
    const page = ctx.handle.page();
    const timeout = args.timeoutMs ?? ctx.limits.actionTimeoutMs;
    await page.waitForURL(args.url ?? "**/*", { waitUntil: args.waitUntil, timeout });
    return { data: { url: page.url(), state: args.waitUntil } };
  },
});
