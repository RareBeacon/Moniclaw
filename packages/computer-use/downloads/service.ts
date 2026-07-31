import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { CueError } from "../errors";
import type { BinaryRepository, DownloadRepository, UploadRepository, VirusScannerPort } from "../ports";

export function sha256Of(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * DownloadService — capture → size-bound → hash → content-addressed store →
 * scan → serve. Dedupes identical payloads per workspace via sha256.
 */
export class DownloadService {
  constructor(
    private readonly binaries: BinaryRepository,
    private readonly downloads: DownloadRepository,
    private readonly scanner: VirusScannerPort
  ) {}

  async ingest(input: {
    workspaceId: string;
    sessionId?: string | null;
    executionId?: string | null;
    suggestedFilename: string;
    mime: string;
    data?: Buffer;
    tempPath?: string;
    maxBytes: number;
  }) {
    const data = input.data ?? (input.tempPath ? await readFile(input.tempPath) : null);
    if (!data) throw new CueError("unknown", "Download artifact carried neither data nor tempPath.");
    if (data.length > input.maxBytes) {
      throw new CueError("artifact_too_large", `Download "${input.suggestedFilename}" is ${(data.length / 1048576).toFixed(1)}MB — over the ${(input.maxBytes / 1048576).toFixed(0)}MB cap.`);
    }
    const sha256 = sha256Of(data);
    const existing = await this.downloads.findByHash(input.workspaceId, sha256);
    const filename = sanitizeFilename(input.suggestedFilename);
    if (existing) {
      // Content-addressed duplicate: return the existing record (no double store).
      return { row: existing, deduplicated: true };
    }
    const binary = await this.binaries.put({ workspaceId: input.workspaceId, data, mime: input.mime });
    const row = await this.downloads.create({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId ?? null,
      executionId: input.executionId ?? null,
      filename,
      suggestedName: filename,
      mime: input.mime || "application/octet-stream",
      sizeBytes: data.length,
      sha256,
      binaryId: binary.id,
      scanStatus: "PENDING",
      scanDetail: null,
    });
    const scan = await this.scanner.scan({ filename, mime: input.mime, data }).catch(() => ({ status: "CLEAN" as const, detail: "scanner unavailable — allowed by fail-open policy" }));
    await this.downloads.updateScan(row.id, scan.status, scan.detail ?? `scanner:${this.scanner.name}`);
    return { row: { ...row, scanStatus: scan.status, scanDetail: scan.detail ?? null }, deduplicated: false };
  }

  list(workspaceId: string, opts?: { limit?: number }) {
    return this.downloads.list(workspaceId, opts);
  }

  async read(id: string, workspaceId: string) {
    const row = await this.downloads.get(id, workspaceId);
    if (!row) return null;
    const binary = await this.binaries.get(row.binaryId, workspaceId);
    return binary ? { row, binary } : null;
  }

  async delete(id: string, workspaceId: string) {
    return this.downloads.delete(id, workspaceId);
  }
}

/**
 * UploadService — workspace file uploads used by the upload_file action.
 * Payloads live in the binary store; rows track usage (usedCount).
 */
export class UploadService {
  constructor(
    private readonly binaries: BinaryRepository,
    private readonly uploads: UploadRepository,
    private readonly materializer: UploadMaterializer
  ) {}

  async store(input: {
    workspaceId: string;
    uploaderId?: string | null;
    filename: string;
    mime: string;
    data: Buffer;
    maxBytes: number;
  }) {
    if (input.data.length === 0) throw new CueError("validation", "Empty upload rejected.");
    if (input.data.length > input.maxBytes) {
      throw new CueError("artifact_too_large", `Upload "${input.filename}" is ${(input.data.length / 1048576).toFixed(1)}MB — over the ${(input.maxBytes / 1048576).toFixed(0)}MB cap.`);
    }
    const sha256 = sha256Of(input.data);
    const existing = await this.uploads.findByHash(input.workspaceId, sha256);
    if (existing && existing.filename === sanitizeFilename(input.filename)) {
      return { row: existing, deduplicated: true };
    }
    const binary = await this.binaries.put({ workspaceId: input.workspaceId, data: input.data, mime: input.mime });
    const row = await this.uploads.create({
      workspaceId: input.workspaceId,
      uploaderId: input.uploaderId ?? null,
      filename: sanitizeFilename(input.filename),
      mime: input.mime || "application/octet-stream",
      sizeBytes: input.data.length,
      sha256,
      binaryId: binary.id,
    });
    return { row, deduplicated: false };
  }

  list(workspaceId: string, opts?: { limit?: number }) {
    return this.uploads.list(workspaceId, opts);
  }

  get(id: string, workspaceId: string) {
    return this.uploads.get(id, workspaceId);
  }

  /** Resolve ids to driver-readable local paths (upload_file action). */
  async materialize(ids: string[], workspaceId: string) {
    const resolved: Array<{ id: string; path: string; filename: string; mime: string }> = [];
    for (const id of ids) {
      const row = await this.uploads.get(id, workspaceId);
      if (!row || row.deletedAt) continue;
      const binary = await this.binaries.get(row.binaryId, workspaceId);
      if (!binary) continue;
      resolved.push({ id: row.id, path: await this.materializer.write(row, binary.data), filename: row.filename, mime: row.mime });
    }
    if (resolved.length > 0) await this.uploads.incrementUsed(resolved.map((r) => r.id));
    return resolved;
  }

  async delete(id: string, workspaceId: string) {
    return this.uploads.delete(id, workspaceId);
  }
}

/** Where upload payloads land so the browser driver can read them. */
export interface UploadMaterializer {
  write(row: { id: string; filename: string }, data: Buffer): Promise<string>;
}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "file";
  const clean = base.replace(/[^\w.\- ()]/g, "_").slice(0, 200);
  return clean || "file";
}
