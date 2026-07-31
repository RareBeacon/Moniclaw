import { z } from "zod";
import type { CookieRecord } from "../../types";
import { defineAction } from "./context";

const cookieSchema = z.object({
  name: z.string().min(1).max(200),
  value: z.string().max(8192),
  domain: z.string().max(253).optional(),
  path: z.string().max(500).default("/"),
  expires: z.number().int().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
});

function sanitize(cookies: CookieRecord[]): CookieRecord[] {
  return cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expires,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
  }));
}

export const readCookiesAction = defineAction({
  id: "read_cookies",
  name: "Read Cookies",
  description: "List cookies visible to the session (optionally filtered by URL or names).",
  category: "cookies",
  permission: "cookies:read",
  risk: "low",
  schema: z.object({
    urls: z.array(z.string().url()).max(20).optional(),
    names: z.array(z.string().min(1).max(200)).max(100).optional(),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("cookies:read");
    const context = ctx.handle.context();
    const cookies = (await context.cookies(args.urls)) as CookieRecord[];
    const filtered = args.names ? cookies.filter((c) => args.names!.includes(c.name)) : cookies;
    return { data: { cookies: sanitize(filtered).slice(0, 500), count: filtered.length } };
  },
});

export const writeCookiesAction = defineAction({
  id: "write_cookies",
  name: "Write Cookies",
  description: "Set cookies on the session context (previous values captured for rollback).",
  category: "cookies",
  permission: "cookies:write",
  risk: "medium",
  schema: z.object({ cookies: z.array(cookieSchema).min(1).max(100) }),
  async execute(ctx, args) {
    ctx.assertPermission("cookies:write");
    const context = ctx.handle.context();
    // Snapshot pre-existing values for rollback.
    const names = new Set(args.cookies.map((c) => c.name));
    const before = ((await context.cookies()) as CookieRecord[]).filter((c) => names.has(c.name));
    const toSet = args.cookies.map((c) => ({
      ...c,
      // playwright requires url OR domain+path
      url: c.domain ? undefined : ctx.handle.url() ?? undefined,
      sameSite: c.sameSite,
    }));
    await context.addCookies(toSet as never);
    return { data: { written: args.cookies.length }, rollbackState: { before, names: [...names] } };
  },
  async rollback(ctx, state) {
    const s = state as { before: CookieRecord[]; names: string[] };
    try {
      const context = ctx.handle.context();
      for (const name of s.names) await context.clearCookies({ name });
      if (s.before.length > 0) await context.addCookies(s.before as never);
    } catch { /* best effort */ }
  },
});

export const deleteCookiesAction = defineAction({
  id: "delete_cookies",
  name: "Delete Cookies",
  description: "Delete cookies by name/domain, or clear the whole cookie jar (deleted cookies captured for rollback).",
  category: "cookies",
  permission: "cookies:write",
  risk: "medium",
  schema: z.object({
    names: z.array(z.string().min(1).max(200)).max(100).optional(),
    domain: z.string().max(253).optional(),
    all: z.boolean().default(false),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("cookies:write");
    const context = ctx.handle.context();
    const before = (await context.cookies()) as CookieRecord[];
    const removed = args.all
      ? before
      : before.filter((c) =>
          (args.names ? args.names.includes(c.name) : false) ||
          (args.domain ? c.domain === args.domain || c.domain === `.${args.domain}` : false));
    if (args.all) {
      await context.clearCookies();
    } else {
      for (const cookie of removed) {
        await context.clearCookies({ name: cookie.name, domain: cookie.domain, path: cookie.path });
      }
    }
    return { data: { deleted: removed.length, remaining: before.length - removed.length }, rollbackState: { removed: sanitize(removed) } };
  },
  async rollback(ctx, state) {
    const s = state as { removed: CookieRecord[] };
    try {
      if (s.removed.length > 0) await ctx.handle.context().addCookies(s.removed as never);
    } catch { /* best effort */ }
  },
});
