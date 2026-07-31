import { z } from "zod";
import { CueError } from "../../errors";
import { defineAction } from "./context";

export const takeScreenshotAction = defineAction({
  id: "take_screenshot",
  name: "Take Screenshot",
  description: "Capture a screenshot of the viewport (or full page) and store it as a workspace artifact.",
  category: "capture",
  permission: "read",
  risk: "low",
  schema: z.object({
    fullPage: z.boolean().default(false),
    format: z.enum(["png", "jpeg"]).default("png"),
    quality: z.number().int().min(10).max(100).default(80),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("read");
    const page = ctx.handle.page();
    const data = await page.screenshot({
      fullPage: args.fullPage,
      type: args.format,
      quality: args.format === "jpeg" ? args.quality : undefined,
      timeout: ctx.limits.actionTimeoutMs,
    });
    if (data.length > ctx.limits.artifactMaxBytes) {
      throw new CueError("artifact_too_large", `Screenshot is ${(data.length / 1048576).toFixed(1)}MB — over the ${(ctx.limits.artifactMaxBytes / 1048576).toFixed(0)}MB artifact cap.`);
    }
    const stored = await ctx.persistArtifact({ kind: "screenshot", data, mime: args.format === "jpeg" ? "image/jpeg" : "image/png" });
    return { data: { screenshotId: stored.id, bytes: data.length, format: args.format, fullPage: args.fullPage, url: ctx.handle.url() }, artifacts: [stored] };
  },
});

export const printPdfAction = defineAction({
  id: "print_pdf",
  name: "Print PDF",
  description: "Render the active page to PDF (Chromium headless only; stored as a workspace download).",
  category: "capture",
  permission: "read",
  risk: "low",
  schema: z.object({
    format: z.enum(["A4", "A3", "Letter", "Legal", "Tabloid"]).default("A4"),
    printBackground: z.boolean().default(true),
    landscape: z.boolean().default(false),
    scale: z.number().min(0.1).max(2).default(1),
    filename: z.string().min(1).max(200).regex(/^[\w.\- ]+$/).default("page.pdf"),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("read");
    const page = ctx.handle.page();
    if (typeof page.pdf !== "function") {
      throw new CueError("unsupported", "print_pdf is only available on Chromium-family drivers (Firefox does not support page.pdf).");
    }
    let data: Buffer;
    try {
      data = await page.pdf({ format: args.format, printBackground: args.printBackground, landscape: args.landscape, scale: args.scale });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/headless/i.test(message)) throw new CueError("unsupported", "print_pdf requires a headless Chromium session.", { cause: err });
      throw err;
    }
    if (data.length > ctx.limits.artifactMaxBytes) {
      throw new CueError("artifact_too_large", `PDF is ${(data.length / 1048576).toFixed(1)}MB — over the artifact cap.`);
    }
    const stored = await ctx.persistArtifact({ kind: "pdf", data, mime: "application/pdf", suggestedFilename: args.filename });
    return { data: { downloadId: stored.id, bytes: data.length, filename: args.filename }, artifacts: [stored] };
  },
});
