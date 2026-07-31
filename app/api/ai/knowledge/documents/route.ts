import { z } from "zod";
import { getRuntime } from "@/lib/ai/runtime";
import { getAiSettings } from "@/lib/ai/settings";
import { ok, fail, errorResponse } from "@/lib/ai/api";
import { requirePrincipal, resolveApiPrincipal } from "@/lib/api-auth";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { httpRequestTool } from "@runtime/tools/builtin/http";

/** GET  /api/ai/knowledge/documents — list ingested documents
 *  POST /api/ai/knowledge/documents — ingest a file (multipart) or URL (JSON) */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const urlSchema = z.object({ url: z.string().url().max(2048) });

export async function GET(request: Request) {
  try {
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "knowledge.read");
    if (guard) return guard;
    const runtime = getRuntime();
    const documents = await runtime.knowledge.listDocuments(principal!.workspace.id);
    return ok({ documents });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "knowledge.write");
    if (guard) return guard;

    const gate = rateLimit(
      `aiUpload:${principal!.workspace.id}`,
      RATE_LIMITS.aiUpload.limit,
      RATE_LIMITS.aiUpload.windowMs
    );
    if (!gate.success) {
      return fail(429, "rate_limited", `Upload quota hit. Retry in ${gate.retryAfterSeconds}s.`);
    }

    const settings = await getAiSettings(principal!.workspace.id);
    const limits = {
      maxDocuments: settings.knowledgeMaxDocuments,
      maxFileBytes: settings.knowledgeMaxFileMB * 1024 * 1024,
      maxChunksPerDoc: settings.knowledgeMaxChunksPerDoc,
    };
    const runtime = getRuntime();

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return fail(400, "validation", "multipart field `file` is required.");
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const document = await runtime.knowledge.ingestFile({
        workspaceId: principal!.workspace.id,
        filename: file.name || "document",
        mime: file.type || undefined,
        buffer,
        limits,
        createdById: principal!.userId,
      });
      return ok({ document: summarize(document) }, { status: 201 });
    }

    // JSON variant: ingest a public web page by URL (fetched through the SSRF guard).
    const parsed = urlSchema.parse(await request.json());
    const fetchResult = (await httpRequestTool.execute(
      { url: parsed.url, method: "GET", timeoutMs: 20_000 },
      { workspaceId: principal!.workspace.id, userId: principal!.userId, toolPermissions: {} }
    )) as { status: number; body: string };
    if (fetchResult.status >= 400) {
      return fail(422, "fetch_failed", `Could not fetch the page (HTTP ${fetchResult.status}).`);
    }
    const document = await runtime.knowledge.ingestWebPage({
      workspaceId: principal!.workspace.id,
      url: parsed.url,
      html: fetchResult.body ?? "",
      limits,
      createdById: principal!.userId,
    });
    return ok({ document: summarize(document) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

function summarize(document: {
  id: string; title: string; status: string; chunkCount: number; checksum: string; error: string | null;
}) {
  return {
    id: document.id,
    title: document.title,
    status: document.status,
    chunkCount: document.chunkCount,
    checksum: document.checksum.slice(0, 12),
    error: document.error,
  };
}
