import { z } from "zod";
import { defineAction, selectorArgSchema, targetMeta, type ActionRunContext } from "./context";
import { resolveTarget } from "./context";

export const scrollAction = defineAction({
  id: "scroll",
  name: "Scroll",
  description: "Scroll the page or a specific element by a delta or to an edge/position.",
  category: "scroll",
  permission: "interact",
  risk: "low",
  schema: z.object({
    selector: selectorArgSchema.optional(),
    deltaX: z.number().min(-100_000).max(100_000).default(0),
    deltaY: z.number().min(-100_000).max(100_000).default(600),
    to: z.enum(["top", "bottom"]).optional(),
    timeoutMs: z.number().int().min(100).max(60_000).optional(),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("interact");
    const before = await scrollPosition(ctx);
    if (args.selector) {
      const target = await resolveTarget(ctx, args.selector, args.timeoutMs);
      await target.locator.evaluate((el, a) => {
        const node = el as HTMLElement;
        if (a.to === "top") node.scrollTop = 0;
        else if (a.to === "bottom") node.scrollTop = node.scrollHeight;
        else node.scrollBy(a.dx, a.dy);
      }, { to: args.to ?? null, dx: args.deltaX, dy: args.deltaY });
      const after = await scrollPosition(ctx);
      return { data: { ...targetMeta(target), before, after }, rollbackState: { selector: args.selector, before } };
    }
    const page = ctx.handle.page();
    await page.evaluate((a) => {
      if (a.to === "top") window.scrollTo(0, 0);
      else if (a.to === "bottom") window.scrollTo(0, document.scrollingElement?.scrollHeight ?? document.body.scrollHeight);
      else window.scrollBy(a.dx, a.dy);
    }, { to: args.to ?? null, dx: args.deltaX, dy: args.deltaY });
    const after = await scrollPosition(ctx);
    return { data: { before, after }, rollbackState: { before } };
  },
  async rollback(ctx, state) {
    const s = state as { before: { x: number; y: number }; selector?: unknown };
    try {
      if (s?.selector) {
        const target = await resolveTarget(ctx, s.selector as never, 5_000);
        await target.locator.evaluate((el, p) => { (el as HTMLElement).scrollTo(p.x, p.y); }, s.before);
      } else {
        await ctx.handle.page().evaluate((p) => window.scrollTo(p.x, p.y), s.before);
      }
    } catch { /* best effort */ }
  },
});

async function scrollPosition(ctx: ActionRunContext): Promise<{ x: number; y: number }> {
  return ctx.handle.page().evaluate(() => ({ x: window.scrollX, y: window.scrollY })).catch(() => ({ x: 0, y: 0 }));
}
