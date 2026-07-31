import { z } from "zod";
import { defineAction } from "./context";

export const openTabAction = defineAction({
  id: "open_tab",
  name: "Open Tab",
  description: "Open a new tab, optionally navigating it to a URL, and make it active.",
  category: "tabs",
  permission: "navigate",
  risk: "low",
  schema: z.object({
    url: z.string().url().max(2000).optional(),
    waitUntil: z.enum(["load", "domcontentloaded", "commit"]).default("domcontentloaded"),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("navigate");
    const previous = ctx.handle.activeIndex();
    const { page, index } = await ctx.handle.openTab();
    if (args.url) await page.goto(args.url, { waitUntil: args.waitUntil, timeout: ctx.limits.actionTimeoutMs });
    return {
      data: { tabIndex: index, tabCount: ctx.handle.tabCount(), url: page.url() },
      rollbackState: { openedIndex: index, previous },
    };
  },
  async rollback(ctx, state) {
    const s = state as { openedIndex: number; previous: number };
    await ctx.handle.closeTab(s.openedIndex).catch(() => {});
    try { ctx.handle.setActive(Math.min(s.previous, ctx.handle.tabCount() - 1)); } catch { /* noop */ }
  },
});

export const closeTabAction = defineAction({
  id: "close_tab",
  name: "Close Tab",
  description: "Close a tab by index (defaults to the active tab). The next tab becomes active.",
  category: "tabs",
  permission: "interact",
  risk: "medium",
  schema: z.object({ index: z.number().int().min(0).max(49).optional() }),
  async execute(ctx, args) {
    ctx.assertPermission("interact");
    const index = args.index ?? ctx.handle.activeIndex();
    const { closedUrl, active } = await ctx.handle.closeTab(index);
    return {
      data: { closed: index, closedUrl, active, tabCount: ctx.handle.tabCount() },
      rollbackState: { closedUrl, index },
    };
  },
  async rollback(ctx, state) {
    const s = state as { closedUrl: string | null };
    if (!s.closedUrl || s.closedUrl === "about:blank") return;
    await ctx.handle.openTab(s.closedUrl).catch(() => {});
  },
});

export const switchTabAction = defineAction({
  id: "switch_tab",
  name: "Switch Tab",
  description: "Make another tab active by index.",
  category: "tabs",
  permission: "interact",
  risk: "low",
  schema: z.object({ index: z.number().int().min(0).max(49) }),
  async execute(ctx, args) {
    ctx.assertPermission("interact");
    const previous = ctx.handle.activeIndex();
    const page = ctx.handle.setActive(args.index);
    return {
      data: { active: args.index, url: page.url(), tabCount: ctx.handle.tabCount() },
      rollbackState: { previous },
    };
  },
  async rollback(ctx, state) {
    const s = state as { previous: number };
    try { ctx.handle.setActive(s.previous); } catch { /* tab may be gone */ }
  },
});
