import { z } from "zod";

/** Zod contracts for the browser dashboard server actions. */

export const sessionCreateSchema = z.object({
  kind: z.enum(["EPHEMERAL", "PERSISTENT", "INCOGNITO"]).default("EPHEMERAL"),
  profileId: z.string().uuid().nullish(),
  browser: z.enum(["CHROMIUM", "CHROME", "MSEDGE", "FIREFOX"]).nullish(),
  startUrl: z.union([z.literal(""), z.string().url().max(2000)]).nullish(),
});

export const profileCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(300).optional(),
  browser: z.enum(["CHROMIUM", "CHROME", "MSEDGE", "FIREFOX"]).default("CHROMIUM"),
});

export const quickActionSchema = z.object({
  sessionId: z.string().uuid(),
  preset: z.enum(["navigate", "screenshot", "extract_text", "extract_links"]),
  url: z.string().url().max(2000).optional(),
  fullPage: z.boolean().default(false),
});

export const planRunSchema = z.object({
  sessionId: z.string().uuid(),
  goal: z.string().max(500).optional(),
  stepsJson: z.string().min(2).max(20_000),
});

export const browserSettingsSchema = z.object({
  defaultBrowser: z.enum(["CHROMIUM", "CHROME", "MSEDGE", "FIREFOX"]),
  headless: z.boolean(),
  actionTimeoutMs: z.number().int().min(1000).max(120_000),
  executionTimeoutMs: z.number().int().min(5000).max(600_000),
  sessionIdleTimeoutSec: z.number().int().min(30).max(86_400),
  maxConcurrentSessions: z.number().int().min(1).max(10),
  dialogPolicy: z.enum(["dismiss", "accept"]),
  screenshotOnFail: z.boolean(),
  recordScreenshots: z.boolean(),
  maxArtifactMB: z.number().int().min(1).max(50),
});

const domainLine = z.string().max(20_000).default("");

export const browserPolicySchema = z.object({
  readOnly: z.boolean(),
  navigationOnly: z.boolean(),
  allowJavascript: z.boolean(),
  allowDownloads: z.boolean(),
  allowUploads: z.boolean(),
  allowClipboard: z.boolean(),
  allowedDomains: domainLine,
  blockedDomains: domainLine,
  confirmationDomains: domainLine,
  defaultAllowed: z.boolean(),
});

/** Parse a textarea of domains (one per line / comma separated). */
export function parseDomainLines(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 200);
}
