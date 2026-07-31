import { z } from "zod";
import { defineAction, jsonSafe, resolveTarget, selectorArgSchema, targetMeta } from "./context";

const limitSchema = z.number().int().min(1).max(1000).default(100);

export const extractTextAction = defineAction({
  id: "extract_text",
  name: "Extract Text",
  description: "Read visible text from the page or a target element (truncated at maxChars).",
  category: "dom",
  permission: "read",
  risk: "low",
  schema: z.object({
    selector: selectorArgSchema.optional(),
    maxChars: z.number().int().min(100).max(200_000).default(20_000),
    timeoutMs: z.number().int().min(100).max(60_000).optional(),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("read");
    if (args.selector) {
      const target = await resolveTarget(ctx, args.selector, args.timeoutMs);
      const text = await target.locator.innerText();
      return { data: { text: text.slice(0, args.maxChars), truncated: text.length > args.maxChars, ...targetMeta(target) } };
    }
    const raw = await ctx.handle.page().evaluate(() => document.body?.innerText ?? "");
    const text = String(raw);
    return { data: { text: text.slice(0, args.maxChars), truncated: text.length > args.maxChars, url: ctx.handle.url() } };
  },
});

export const extractLinksAction = defineAction({
  id: "extract_links",
  name: "Extract Links",
  description: "Collect anchor hrefs + text (optionally scoped to a container).",
  category: "dom",
  permission: "read",
  risk: "low",
  schema: z.object({
    selector: selectorArgSchema.optional(),
    limit: limitSchema,
    absolute: z.boolean().default(true),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("read");
    const scopeHandle = args.selector ? (await resolveTarget(ctx, args.selector)).locator : null;
    const locator = scopeHandle ? scopeHandle.locator("a[href]") : ctx.handle.page().locator("a[href]");
    const links = await locator.evaluateAll((anchors, a) =>
      anchors.slice(0, a.limit).map((el) => {
        const anchor = el as HTMLAnchorElement;
        return { href: a.absolute ? anchor.href : anchor.getAttribute("href"), text: (anchor.innerText ?? "").trim().slice(0, 200) };
      }), { limit: args.limit, absolute: args.absolute });
    return { data: { links: jsonSafe(links) as unknown, count: links.length } };
  },
});

export const extractTablesAction = defineAction({
  id: "extract_tables",
  name: "Extract Tables",
  description: "Parse HTML tables into row/column JSON structures.",
  category: "dom",
  permission: "read",
  risk: "low",
  schema: z.object({
    selector: selectorArgSchema.optional(),
    limit: limitSchema.default(10),
    maxRows: z.number().int().min(1).max(5000).default(500),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("read");
    const scopeHandle = args.selector ? (await resolveTarget(ctx, args.selector)).locator : null;
    const locator = scopeHandle ? scopeHandle.locator("table") : ctx.handle.page().locator("table");
    const tables = await locator.evaluateAll((tablesEls, a) =>
      tablesEls.slice(0, a.limit).map((table) => {
        const rows = Array.from((table as HTMLTableElement).rows).slice(0, a.maxRows);
        return rows.map((row) => Array.from(row.cells).map((cell) => (cell.innerText ?? "").trim()));
      }), { limit: args.limit, maxRows: args.maxRows });
    return { data: { tables: jsonSafe(tables, 128_000) as unknown, count: tables.length } };
  },
});

export const extractImagesAction = defineAction({
  id: "extract_images",
  name: "Extract Images",
  description: "List images with source, alt text and natural dimensions.",
  category: "dom",
  permission: "read",
  risk: "low",
  schema: z.object({ selector: selectorArgSchema.optional(), limit: limitSchema }),
  async execute(ctx, args) {
    ctx.assertPermission("read");
    const scopeHandle = args.selector ? (await resolveTarget(ctx, args.selector)).locator : null;
    const locator = scopeHandle ? scopeHandle.locator("img") : ctx.handle.page().locator("img");
    const images = await locator.evaluateAll((imgs, a) =>
      imgs.slice(0, a.limit).map((el) => {
        const img = el as HTMLImageElement;
        return { src: img.currentSrc || img.src, alt: img.alt ?? "", width: img.naturalWidth, height: img.naturalHeight };
      }), { limit: args.limit });
    return { data: { images: jsonSafe(images) as unknown, count: images.length } };
  },
});

export const evaluateDomAction = defineAction({
  id: "evaluate_dom",
  name: "Evaluate DOM",
  description: "Read-only DOM query: count, tag names, attributes and text sample for a CSS query. For arbitrary scripts use execute_javascript.",
  category: "dom",
  permission: "read",
  risk: "low",
  schema: z.object({
    query: z.string().min(1).max(500),
    attributes: z.array(z.string().min(1).max(60)).max(20).default([]),
    sample: z.number().int().min(0).max(50).default(5),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("read");
    const result = await ctx.handle.page().evaluate((a) => {
      const nodes = Array.from(document.querySelectorAll(a.query));
      return {
        count: nodes.length,
        sample: nodes.slice(0, a.sample).map((node) => ({
          tag: node.tagName.toLowerCase(),
          text: (node.textContent ?? "").trim().slice(0, 300),
          attributes: Object.fromEntries(a.attributes.map((name) => [name, node.getAttribute(name)])),
        })),
      };
    }, { query: args.query, attributes: args.attributes, sample: args.sample });
    return { data: { query: args.query, ...jsonSafe(result) as Record<string, unknown> } };
  },
});

export const readAttributesAction = defineAction({
  id: "read_attributes",
  name: "Read Attributes",
  description: "Read named attributes (plus value/text) from a target element.",
  category: "dom",
  permission: "read",
  risk: "low",
  schema: z.object({
    selector: selectorArgSchema,
    attributes: z.array(z.string().min(1).max(60)).min(1).max(20),
    timeoutMs: z.number().int().min(100).max(60_000).optional(),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("read");
    const target = await resolveTarget(ctx, args.selector, args.timeoutMs);
    const attributes = await target.locator.evaluate((el, names) => {
      const node = el as HTMLElement;
      const out: Record<string, string | null> = {};
      for (const name of names) out[name] = node.getAttribute(name);
      if ("value" in node) out.value = String((node as HTMLInputElement).value);
      return out;
    }, args.attributes);
    return { data: { attributes, ...targetMeta(target) } };
  },
});
