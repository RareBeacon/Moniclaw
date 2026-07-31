import { z } from "zod";
import { CueError } from "../../errors";
import { defineAction, type ActionRunContext } from "./context";

const waitUntilSchema = z.enum(["load", "domcontentloaded", "networkidle", "commit"]).default("domcontentloaded");

async function finishNavigation(ctx: ActionRunContext, page: { url(): string; title(): Promise<string> }) {
  return {
    url: page.url(),
    title: await page.title().catch(() => null),
    tabIndex: ctx.handle.activeIndex(),
    tabCount: ctx.handle.tabCount(),
  };
}

export const navigateAction = defineAction({
  id: "navigate",
  name: "Navigate",
  description: "Open a URL in the active tab (or a new one). Subject to the workspace domain policy.",
  category: "navigation",
  permission: "navigate",
  risk: "low",
  schema: z.object({
    url: z.string().url().max(2000),
    newTab: z.boolean().default(false),
    waitUntil: waitUntilSchema,
    timeoutMs: z.number().int().min(500).max(120_000).optional(),
    referer: z.string().url().optional(),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("navigate");
    const timeout = args.timeoutMs ?? ctx.limits.actionTimeoutMs;
    const previousUrl = ctx.handle.url();
    const page = args.newTab ? (await ctx.handle.openTab()).page : ctx.handle.page();
    try {
      await page.goto(args.url, { waitUntil: args.waitUntil, timeout, referer: args.referer });
    } catch (err) {
      throw navigationError(err, args.url);
    }
    return { data: await finishNavigation(ctx, page), rollbackState: { previousUrl, openedTab: args.newTab ? ctx.handle.activeIndex() : null } };
  },
  async rollback(ctx, state) {
    const s = state as { previousUrl: string | null; openedTab: number | null };
    try {
      if (s.openedTab != null) await ctx.handle.closeTab(s.openedTab);
      else if (s.previousUrl) await ctx.handle.page().goto(s.previousUrl, { waitUntil: "domcontentloaded", timeout: 10_000 });
    } catch { /* best-effort unwind */ }
  },
});

export const goBackAction = defineAction({
  id: "go_back",
  name: "Go Back",
  description: "Navigate one step back in the active tab's history.",
  category: "navigation",
  permission: "navigate",
  risk: "low",
  schema: z.object({ waitUntil: waitUntilSchema, timeoutMs: z.number().int().min(500).max(60_000).optional() }),
  async execute(ctx, args) {
    ctx.assertPermission("navigate");
    const page = ctx.handle.page();
    const response = await page.goBack({ waitUntil: args.waitUntil, timeout: args.timeoutMs ?? ctx.limits.actionTimeoutMs }).catch((err) => {
      throw navigationError(err, "history:back");
    });
    if (!response && page.url() === "about:blank") {
      throw new CueError("navigation", "No history entry to go back to.");
    }
    return { data: await finishNavigation(ctx, page) };
  },
  async rollback(ctx) {
    await ctx.handle.page().goForward({ waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {});
  },
});

export const goForwardAction = defineAction({
  id: "go_forward",
  name: "Go Forward",
  description: "Navigate one step forward in the active tab's history.",
  category: "navigation",
  permission: "navigate",
  risk: "low",
  schema: z.object({ waitUntil: waitUntilSchema, timeoutMs: z.number().int().min(500).max(60_000).optional() }),
  async execute(ctx, args) {
    ctx.assertPermission("navigate");
    const page = ctx.handle.page();
    const response = await page.goForward({ waitUntil: args.waitUntil, timeout: args.timeoutMs ?? ctx.limits.actionTimeoutMs }).catch((err) => {
      throw navigationError(err, "history:forward");
    });
    if (!response) throw new CueError("navigation", "No history entry to go forward to.");
    return { data: await finishNavigation(ctx, page) };
  },
  async rollback(ctx) {
    await ctx.handle.page().goBack({ waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {});
  },
});

export const refreshAction = defineAction({
  id: "refresh",
  name: "Refresh",
  description: "Reload the active tab.",
  category: "navigation",
  permission: "navigate",
  risk: "low",
  schema: z.object({ waitUntil: waitUntilSchema, timeoutMs: z.number().int().min(500).max(60_000).optional() }),
  async execute(ctx, args) {
    ctx.assertPermission("navigate");
    const page = ctx.handle.page();
    await page.reload({ waitUntil: args.waitUntil, timeout: args.timeoutMs ?? ctx.limits.actionTimeoutMs }).catch((err) => {
      throw navigationError(err, page.url());
    });
    return { data: await finishNavigation(ctx, page) };
  },
});

function navigationError(err: unknown, url: string): CueError {
  const message = err instanceof Error ? err.message : String(err);
  if (/timeout|timed out/i.test(message)) return new CueError("timeout", `Navigation to ${url} timed out: ${message.slice(0, 200)}`, { cause: err });
  return new CueError("navigation", `Navigation to ${url} failed: ${message.slice(0, 240)}`, { cause: err });
}
