import { z } from "zod";
import { defineAction, resolveTarget, selectorArgSchema, targetMeta, type ActionRunContext } from "./context";

const clickBase = z.object({
  selector: selectorArgSchema,
  timeoutMs: z.number().int().min(100).max(60_000).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  force: z.boolean().default(false),
});

export const clickAction = defineAction({
  id: "click",
  name: "Click",
  description: "Click an element (left button by default). Resolves with self-healing selector fallbacks.",
  category: "mouse",
  permission: "interact",
  risk: "medium",
  schema: clickBase.extend({
    button: z.enum(["left", "middle", "right"]).default("left"),
    clickCount: z.number().int().min(1).max(3).default(1),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("interact");
    const target = await resolveTarget(ctx, args.selector, args.timeoutMs);
    await target.locator.click({
      button: args.button,
      clickCount: args.clickCount,
      position: args.position,
      force: args.force,
      timeout: args.timeoutMs ?? ctx.limits.actionTimeoutMs,
    });
    return { data: { clicked: true, ...targetMeta(target) } };
  },
});

export const doubleClickAction = defineAction({
  id: "double_click",
  name: "Double Click",
  description: "Double-click an element.",
  category: "mouse",
  permission: "interact",
  risk: "medium",
  schema: clickBase,
  async execute(ctx, args) {
    ctx.assertPermission("interact");
    const target = await resolveTarget(ctx, args.selector, args.timeoutMs);
    await target.locator.dblclick({ position: args.position, force: args.force, timeout: args.timeoutMs ?? ctx.limits.actionTimeoutMs });
    return { data: { clicked: true, count: 2, ...targetMeta(target) } };
  },
});

export const rightClickAction = defineAction({
  id: "right_click",
  name: "Right Click",
  description: "Open the context menu on an element.",
  category: "mouse",
  permission: "interact",
  risk: "medium",
  schema: clickBase,
  async execute(ctx, args) {
    ctx.assertPermission("interact");
    const target = await resolveTarget(ctx, args.selector, args.timeoutMs);
    await target.locator.click({ button: "right", position: args.position, force: args.force, timeout: args.timeoutMs ?? ctx.limits.actionTimeoutMs });
    return { data: { clicked: true, button: "right", ...targetMeta(target) } };
  },
});

export const hoverAction = defineAction({
  id: "hover",
  name: "Hover",
  description: "Move the pointer over an element (reveals hover menus/tooltips).",
  category: "mouse",
  permission: "interact",
  risk: "low",
  schema: clickBase.omit({ force: true }),
  async execute(ctx, args) {
    ctx.assertPermission("interact");
    const target = await resolveTarget(ctx, args.selector, args.timeoutMs);
    await target.locator.hover({ position: args.position, timeout: args.timeoutMs ?? ctx.limits.actionTimeoutMs });
    return { data: { hovered: true, ...targetMeta(target) } };
  },
});

export const focusAction = defineAction({
  id: "focus",
  name: "Focus",
  description: "Give keyboard focus to an element.",
  category: "mouse",
  permission: "interact",
  risk: "low",
  schema: z.object({ selector: selectorArgSchema, timeoutMs: z.number().int().min(100).max(60_000).optional() }),
  async execute(ctx, args) {
    ctx.assertPermission("interact");
    const target = await resolveTarget(ctx, args.selector, args.timeoutMs);
    await target.locator.focus();
    return { data: { focused: true, ...targetMeta(target) } };
  },
});

export const blurAction = defineAction({
  id: "blur",
  name: "Blur",
  description: "Remove keyboard focus from an element.",
  category: "mouse",
  permission: "interact",
  risk: "low",
  schema: z.object({ selector: selectorArgSchema, timeoutMs: z.number().int().min(100).max(60_000).optional() }),
  async execute(ctx, args) {
    ctx.assertPermission("interact");
    const target = await resolveTarget(ctx, args.selector, args.timeoutMs);
    await target.locator.evaluate((el) => (el as HTMLElement).blur());
    return { data: { blurred: true, ...targetMeta(target) } };
  },
});

const pointOrSelector = z.union([
  z.object({ x: z.number(), y: z.number() }),
  z.object({ selector: selectorArgSchema }),
]);

async function point(
  ctx: ActionRunContext,
  input: { x: number; y: number } | { selector: z.infer<typeof selectorArgSchema> }
): Promise<{ x: number; y: number }> {
  if ("x" in input) return { x: input.x, y: input.y };
  const target = await resolveTarget(ctx, input.selector);
  const box = await target.locator.boundingBox();
  if (!box) {
    // Fall back to the element's scroll-into-view center via DOM rect.
    const rect = await target.locator.evaluate((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    return { x: rect.x, y: rect.y };
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export const dragAction = defineAction({
  id: "drag",
  name: "Drag",
  description: "Press the mouse at a point/element and drag to a destination (drop with the `drop` action or automatically at the end).",
  category: "mouse",
  permission: "interact",
  risk: "medium",
  schema: z.object({
    from: pointOrSelector,
    to: pointOrSelector,
    steps: z.number().int().min(1).max(100).default(12),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("interact");
    const page = ctx.handle.page();
    const from = await point(ctx, args.from);
    const to = await point(ctx, args.to);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: args.steps });
    await page.mouse.up();
    return { data: { from, to, dropped: true } };
  },
  // No reliable inverse for a drag — documented irreversible.
});

export const dropAction = defineAction({
  id: "drop",
  name: "Drop",
  description: "Release a held drag at a point/element (pairs with a manual drag). In most flows prefer the single `drag` action.",
  category: "mouse",
  permission: "interact",
  risk: "medium",
  schema: z.object({ to: pointOrSelector }),
  async execute(ctx, args) {
    ctx.assertPermission("interact");
    const page = ctx.handle.page();
    const to = await point(ctx, args.to);
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
    return { data: { droppedAt: to } };
  },
});
