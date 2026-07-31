import { z } from "zod";
import { CueError } from "../../errors";
import { defineAction, resolveTarget, selectorArgSchema, targetMeta, type ActionRunContext } from "./context";

const targetArgs = z.object({
  selector: selectorArgSchema,
  timeoutMs: z.number().int().min(100).max(60_000).optional(),
});

async function currentValue(locator: { evaluate: (fn: (el: Element) => unknown) => Promise<unknown> }): Promise<string | null> {
  return (await locator.evaluate((el) => {
    const node = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    return "value" in node ? String(node.value) : null;
  }).catch(() => null)) as string | null;
}

interface InputRollbackState {
  selector: z.infer<typeof selectorArgSchema>;
  previousValue?: string | null;
  previous?: string[] | null | boolean;
}

/** Restore a captured pre-write value/selection/checked state (best effort). */
async function restoreInput(ctx: ActionRunContext, state: unknown, restore: (locator: Awaited<ReturnType<typeof resolveTarget>>["locator"]) => Promise<void>) {
  const s = state as InputRollbackState;
  if (!s?.selector) return;
  try {
    const target = await resolveTarget(ctx, s.selector, 5_000);
    await restore(target.locator);
  } catch { /* element may be gone after later steps — best-effort unwind */ }
}

export const typeAction = defineAction({
  id: "type",
  name: "Type",
  description: "Enter text into an input/textarea/contenteditable. mode=fill replaces instantly; mode=type simulates keystrokes.",
  category: "input",
  permission: "input",
  risk: "medium",
  schema: targetArgs.extend({
    text: z.string().max(20_000),
    mode: z.enum(["fill", "type"]).default("fill"),
    clear: z.boolean().default(true),
    delayMs: z.number().int().min(0).max(500).default(0),
    pressEnter: z.boolean().default(false),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("input");
    const target = await resolveTarget(ctx, args.selector, args.timeoutMs);
    const previousValue = await currentValue(target.locator);
    if (args.mode === "fill") {
      await target.locator.fill(args.text, { timeout: args.timeoutMs ?? ctx.limits.actionTimeoutMs });
    } else {
      if (args.clear) await target.locator.fill("", { timeout: args.timeoutMs ?? ctx.limits.actionTimeoutMs });
      await target.locator.pressSequentially(args.text, { delay: args.delayMs, timeout: args.timeoutMs ?? ctx.limits.actionTimeoutMs });
    }
    if (args.pressEnter) await target.locator.press("Enter");
    return { data: { typed: args.text.length, mode: args.mode, ...targetMeta(target) }, rollbackState: { selector: args.selector, previousValue } };
  },
  async rollback(ctx, state) {
    const s = state as InputRollbackState;
    await restoreInput(ctx, state, (locator) => locator.fill(s.previousValue ?? "", { timeout: 5_000 }));
  },
});

export const clearInputAction = defineAction({
  id: "clear_input",
  name: "Clear Input",
  description: "Empty an input or textarea (previous value is captured for rollback).",
  category: "input",
  permission: "input",
  risk: "medium",
  schema: targetArgs,
  async execute(ctx, args) {
    ctx.assertPermission("input");
    const target = await resolveTarget(ctx, args.selector, args.timeoutMs);
    const previousValue = await currentValue(target.locator);
    await target.locator.fill("", { timeout: args.timeoutMs ?? ctx.limits.actionTimeoutMs });
    return { data: { cleared: true, hadValue: previousValue != null && previousValue !== "", ...targetMeta(target) }, rollbackState: { selector: args.selector, previousValue } };
  },
  async rollback(ctx, state) {
    const s = state as InputRollbackState;
    if (s.previousValue == null) return;
    await restoreInput(ctx, state, (locator) => locator.fill(s.previousValue ?? "", { timeout: 5_000 }));
  },
});

export const selectOptionAction = defineAction({
  id: "select_option",
  name: "Select Option",
  description: "Select option(s) in a <select> by value/label/index.",
  category: "input",
  permission: "input",
  risk: "medium",
  schema: targetArgs.extend({
    values: z.array(z.string().max(500)).min(1).max(50),
    by: z.enum(["value", "label", "index"]).default("value"),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("input");
    const target = await resolveTarget(ctx, args.selector, args.timeoutMs);
    const previous = (await target.locator.evaluate((el) => {
      const select = el as HTMLSelectElement;
      return select.selectedOptions ? Array.from(select.selectedOptions).map((o) => o.value) : [];
    }).catch(() => [] as string[])) as string[];
    const mapped = args.by === "value" ? args.values
      : args.by === "label" ? args.values.map((label) => ({ label }))
      : args.values.map((v) => ({ index: Number.parseInt(v, 10) }));
    if (args.by === "index" && mapped.some((m) => Number.isNaN((m as { index: number }).index))) {
      throw new CueError("validation", "select_option: by=index requires numeric values.");
    }
    const selected = await target.locator.selectOption(mapped as string[], { timeout: args.timeoutMs ?? ctx.limits.actionTimeoutMs });
    return { data: { selected, ...targetMeta(target) }, rollbackState: { selector: args.selector, previous } };
  },
  async rollback(ctx, state) {
    const s = state as InputRollbackState;
    if (!Array.isArray(s.previous)) return;
    const values = s.previous;
    await restoreInput(ctx, state, (locator) => locator.selectOption(values, { timeout: 5_000 }).then(() => {}));
  },
});

export const checkboxAction = defineAction({
  id: "checkbox",
  name: "Checkbox",
  description: "Set a checkbox to checked/unchecked (previous state is captured for rollback).",
  category: "input",
  permission: "interact",
  risk: "medium",
  schema: targetArgs.extend({ checked: z.boolean().default(true) }),
  async execute(ctx, args) {
    ctx.assertPermission("interact");
    const target = await resolveTarget(ctx, args.selector, args.timeoutMs);
    const previous = await target.locator.isChecked().catch(() => null);
    await target.locator.setChecked(args.checked, { timeout: args.timeoutMs ?? ctx.limits.actionTimeoutMs });
    return { data: { checked: args.checked, previous, ...targetMeta(target) }, rollbackState: { selector: args.selector, previous } };
  },
  async rollback(ctx, state) {
    const s = state as InputRollbackState;
    if (typeof s.previous !== "boolean") return;
    const checked = s.previous;
    await restoreInput(ctx, state, (locator) => locator.setChecked(checked, { timeout: 5_000 }));
  },
});

export const radioAction = defineAction({
  id: "radio",
  name: "Radio",
  description: "Select a radio option (checking a radio unchecks its siblings).",
  category: "input",
  permission: "interact",
  risk: "medium",
  schema: targetArgs,
  async execute(ctx, args) {
    ctx.assertPermission("interact");
    const target = await resolveTarget(ctx, args.selector, args.timeoutMs);
    const previous = await target.locator.isChecked().catch(() => null);
    await target.locator.check({ timeout: args.timeoutMs ?? ctx.limits.actionTimeoutMs });
    return { data: { checked: true, previous, ...targetMeta(target) } };
  },
});
