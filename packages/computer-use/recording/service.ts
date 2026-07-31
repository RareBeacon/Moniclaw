import { CueError } from "../errors";
import type {
  ActionEventRow, BinaryRepository, RecordingRepository,
  ScreenshotRepository, TimelineFrame,
} from "../ports";
import type { ActionEventStatus } from "../types";

/**
 * ScreenshotService — capture → bound → persist screenshots.
 * The DB binary table is the reference store (25MB cap); the BinaryStore
 * port documents the S3/R2 seam for bucket deployments.
 */
export class ScreenshotService {
  constructor(
    private readonly binaries: BinaryRepository,
    private readonly screenshots: ScreenshotRepository
  ) {}

  async persist(input: {
    workspaceId: string;
    data: Buffer;
    mime: "image/png" | "image/jpeg";
    kind: "AUTO" | "MANUAL" | "FAILURE" | "STEP";
    sessionId?: string | null;
    executionId?: string | null;
    maxBytes: number;
    width?: number | null;
    height?: number | null;
  }) {
    if (input.data.length > input.maxBytes) {
      throw new CueError("artifact_too_large", `Screenshot exceeds the ${(input.maxBytes / 1048576).toFixed(0)}MB artifact cap.`);
    }
    const binary = await this.binaries.put({ workspaceId: input.workspaceId, data: input.data, mime: input.mime });
    return this.screenshots.create({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId ?? null,
      executionId: input.executionId ?? null,
      kind: input.kind,
      binaryId: binary.id,
      width: input.width ?? null,
      height: input.height ?? null,
    });
  }

  list(workspaceId: string, opts?: { executionId?: string; sessionId?: string; limit?: number }) {
    return this.screenshots.list(workspaceId, opts);
  }

  async read(id: string, workspaceId: string) {
    const row = await this.screenshots.get(id, workspaceId);
    if (!row) return null;
    const binary = await this.binaries.get(row.binaryId, workspaceId);
    return binary ? { row, binary } : null;
  }

  async delete(id: string, workspaceId: string) {
    return this.screenshots.delete(id, workspaceId);
  }
}

/**
 * RecordingService — builds the replay timeline for an execution from its
 * action events. The recording row is the compact, replayable source of
 * truth consumed by the dashboard Recordings page + Replay API.
 */
export class RecordingService {
  constructor(private readonly recordings: RecordingRepository) {}

  /** Fold the execution's action-event trail into one recording row. */
  async finalize(input: {
    executionId: string;
    workspaceId: string;
    events: ActionEventRow[];
    startedAt: Date | null;
    finishedAt: Date | null;
    pageUrlsBySeq?: Record<number, string>;
  }) {
    const timeline: TimelineFrame[] = input.events.map((event) => ({
      seq: event.seq,
      action: event.action,
      status: event.status as ActionEventStatus,
      attempt: event.attempt,
      at: event.createdAt.toISOString(),
      durationMs: event.durationMs,
      screenshotId: event.screenshotId,
      url: input.pageUrlsBySeq?.[event.seq],
      ...(event.error ? { error: event.error.slice(0, 300) } : {}),
    }));
    const retries = input.events.filter((e) => e.attempt > 1 || e.status === "RECOVERED").length;
    const errors = input.events.filter((e) => e.status === "FAILED").length;
    const screenshots = input.events.filter((e) => e.screenshotId).length;
    const durationMs = input.startedAt && input.finishedAt
      ? input.finishedAt.getTime() - input.startedAt.getTime()
      : input.events.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
    return this.recordings.upsert({
      executionId: input.executionId,
      workspaceId: input.workspaceId,
      steps: input.events.length,
      screenshots,
      errors,
      retries,
      durationMs,
      timeline,
    });
  }

  getByExecution(executionId: string, workspaceId: string) {
    return this.recordings.getByExecution(executionId, workspaceId);
  }

  list(workspaceId: string, opts?: { limit?: number }) {
    return this.recordings.list(workspaceId, opts);
  }
}
