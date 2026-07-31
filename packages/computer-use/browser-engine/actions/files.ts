import { z } from "zod";
import { CueError } from "../../errors";
import { defineAction, resolveTarget, selectorArgSchema, targetMeta } from "./context";

export const downloadFileAction = defineAction({
  id: "download_file",
  name: "Download File",
  description: "Trigger and capture a download: either by clicking a target element, or by fetching a same-origin URL inside the page.",
  category: "files",
  permission: "files:download",
  risk: "medium",
  schema: z.object({
    selector: selectorArgSchema.optional(),
    url: z.string().url().max(2000).optional(),
    filename: z.string().min(1).max(200).regex(/^[\w.\- ()]+$/).optional(),
    timeoutMs: z.number().int().min(500).max(120_000).optional(),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("files:download");
    if (!args.selector && !args.url) {
      throw new CueError("validation", "download_file requires either a selector (click-to-download) or a url (in-page fetch).");
    }
    const page = ctx.handle.page();
    const timeout = args.timeoutMs ?? ctx.limits.actionTimeoutMs;

    if (args.url) {
      // Fetch through the page context so cookies/auth apply; returns base64.
      const fetched = await page.evaluate(async (a) => {
        const response = await fetch(a.url, { credentials: "include" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (blob.size > a.cap) throw new Error(`TOO_LARGE:${blob.size}`);
        const buffer = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < buffer.length; i += 0x8000) {
          binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
        }
        return {
          mime: blob.type || "application/octet-stream",
          base64: btoa(binary),
          disposition: response.headers.get("content-disposition") ?? "",
        };
      }, { url: args.url, cap: ctx.limits.artifactMaxBytes }).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith("TOO_LARGE")) throw new CueError("artifact_too_large", `Download exceeds the artifact cap (${message.split(":")[1]} bytes).`);
        throw new CueError("navigation", `download_file fetch failed: ${message.slice(0, 200)}`, { cause: err });
      });
      const data = Buffer.from(fetched.base64, "base64");
      const suggested = args.filename
        ?? /filename="?([^";]+)"?/.exec(fetched.disposition)?.[1]
        ?? args.url.split("/").pop()?.split("?")[0] ?? "download.bin";
      const stored = await ctx.persistArtifact({ kind: "download", data, mime: fetched.mime, suggestedFilename: suggested.slice(0, 200) });
      return { data: { downloadId: stored.id, filename: suggested, bytes: data.length, mime: fetched.mime }, artifacts: [stored] };
    }

    // Click-driven download: arm the event first, then click.
    const target = await resolveTarget(ctx, args.selector!);
    const downloadPromise = page.waitForEvent("download", { timeout });
    await target.locator.click({ timeout: ctx.limits.actionTimeoutMs });
    const download = await downloadPromise.catch((err) => {
      throw new CueError("timeout", `No download started within ${timeout}ms after clicking.`, { cause: err });
    });
    const failure = await download.failure();
    if (failure) throw new CueError("navigation", `Download failed: ${failure}`);
    const tempPath = await download.path();
    if (!tempPath) throw new CueError("navigation", "Download produced no local file.");
    const suggested = args.filename ?? download.suggestedFilename();
    const stored = await ctx.persistArtifact({
      kind: "download",
      tempPath,
      suggestedFilename: suggested.slice(0, 200),
      mime: "application/octet-stream",
    });
    return { data: { downloadId: stored.id, filename: suggested, ...targetMeta(target) }, artifacts: [stored] };
  },
});

export const uploadFileAction = defineAction({
  id: "upload_file",
  name: "Upload File",
  description: "Attach previously-uploaded workspace files to a file input on the page.",
  category: "files",
  permission: "files:upload",
  risk: "high",
  schema: z.object({
    selector: selectorArgSchema,
    uploadIds: z.array(z.string().uuid()).min(1).max(10),
    timeoutMs: z.number().int().min(100).max(60_000).optional(),
  }),
  async execute(ctx, args) {
    ctx.assertPermission("files:upload");
    const files = await ctx.resolveUploadPaths(args.uploadIds);
    if (files.length === 0) throw new CueError("validation", "upload_file: none of the uploadIds resolved to live workspace uploads.");
    const target = await resolveTarget(ctx, args.selector, args.timeoutMs);
    await target.locator.setInputFiles(files.map((f) => f.path), { timeout: args.timeoutMs ?? ctx.limits.actionTimeoutMs });
    return {
      data: {
        attached: files.map((f) => ({ id: f.id, filename: f.filename, mime: f.mime })),
        ...targetMeta(target),
      },
    };
  },
});
