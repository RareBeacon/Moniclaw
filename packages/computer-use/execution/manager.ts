import { CueError, toCueError } from "../errors";
import type { ActionDefinition, ActionRunContext, PersistedArtifact } from "../browser-engine/actions/context";
import type { ActionArtifact } from "../types";
import type { SessionManager, AttachedSession } from "../sessions/manager";
import type { PermissionService } from "../permissions/service";
import type { RecoveryService } from "../recovery/service";
import { discoverSelectors } from "../selectors/discover";
import type {
  ActionEventRepository, ApprovalPort, ExecutionEventEmitter, ExecutionQueuePort,
  ExecutionRepository, ExecutionRow, PlanStep, PolicyRow,
} from "../ports";
import type { EngineLimits } from "../types";
import type { ActionPlanner, PlannedExecution, PlannedStep } from "./planner";
import { planToRows, type planStepInputSchema } from "./planner";
import type { z } from "zod";
import type { ScreenshotService, RecordingService } from "../recording/service";
import type { DownloadService, UploadService } from "../downloads/service";
import { CUE_AUDIT_ACTIONS, type AuditService } from "../audit/service";

type StepInput = z.infer<typeof planStepInputSchema>;

class ExecutionCancelled extends Error {
  constructor() { super("Execution cancelled."); this.name = "ExecutionCancelled"; }
}

export interface StartExecutionInput {
  workspaceId: string;
  userId?: string | null;
  sessionId: string;
  goal?: string;
  steps: StepInput[];
}

/**
 * ExecutionManager — the engine's pipeline:
 *
 *   start → validate(plan) → QUEUED → queue → attach session → PLANNING →
 *   RUNNING (per-step attempts with Recovery strategies + approval gates) →
 *   VALIDATING (recording finalize) → SUCCEEDED/FAILED/CANCELLED.
 *
 * Every action attempt writes a BrowserActionEvent row (the audit/replay
 * trail) and emits a live hint on the ExecutionEventEmitter (SSE).
 */
export class ExecutionManager {
  private queue: ExecutionQueuePort | null = null;
  private readonly cancelRequested = new Set<string>();

  constructor(
    private readonly deps: {
      sessions: SessionManager;
      executions: ExecutionRepository;
      events: ActionEventRepository;
      planner: ActionPlanner;
      recovery: RecoveryService;
      permissions: PermissionService;
      screenshots: ScreenshotService;
      recording: RecordingService;
      downloads: DownloadService;
      uploads: UploadService;
      emitter: ExecutionEventEmitter;
      approvals?: ApprovalPort | null;
      audit?: AuditService | null;
    }
  ) {}

  /** Wire the queue after construction (queue runner calls back into run). */
  attachQueue(queue: ExecutionQueuePort): void {
    this.queue = queue;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async start(input: StartExecutionInput): Promise<ExecutionRow> {
    const session = await this.deps.sessions.get(input.sessionId, input.workspaceId);
    if (!session) throw new CueError("session_not_found", `Session ${input.sessionId} not found in this workspace.`);
    if (session.status === "CLOSED" || session.status === "TIMEOUT") {
      throw new CueError("session_closed", `Session is ${session.status.toLowerCase()} — create a new session.`);
    }

    const planned = await this.deps.planner.plan(input.workspaceId, input.steps);
    const row = await this.deps.executions.create({
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      sessionId: input.sessionId,
      goal: input.goal ?? null,
      plan: planToRows(planned),
      stepCount: planned.steps.length,
    });

    await this.deps.audit?.record({
      workspaceId: input.workspaceId, actorId: input.userId ?? null,
      action: CUE_AUDIT_ACTIONS.executionStart, targetType: "execution", targetId: row.id,
      metadata: { sessionId: input.sessionId, steps: planned.steps.length, goal: input.goal ?? null },
    });
    this.deps.emitter.emit(row.id, { type: "status", data: { status: "QUEUED" } });
    if (!this.queue) throw new CueError("unknown", "Execution queue not attached.");
    await this.queue.enqueue(row.id);
    return row;
  }

  /** Ad-hoc single action (REST /actions) — same machinery, awaited inline. */
  async runInline(input: StartExecutionInput): Promise<ExecutionRow> {
    if (input.steps.length !== 1) throw new CueError("validation", "runInline expects exactly one step.");
    const session = await this.deps.sessions.get(input.sessionId, input.workspaceId);
    if (!session) throw new CueError("session_not_found", `Session ${input.sessionId} not found in this workspace.`);
    const planned = await this.deps.planner.plan(input.workspaceId, input.steps);
    const row = await this.deps.executions.create({
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      sessionId: input.sessionId,
      goal: input.goal ?? `ad-hoc ${planned.steps[0].action.id}`,
      plan: planToRows(planned),
      stepCount: 1,
    });
    await this.run(row.id);
    return (await this.deps.executions.get(row.id, input.workspaceId))!;
  }

  async cancel(executionId: string, workspaceId: string): Promise<ExecutionRow> {
    const row = await this.deps.executions.get(executionId, workspaceId);
    if (!row) throw new CueError("execution_not_found", "Execution not found in this workspace.");
    const terminal = ["SUCCEEDED", "FAILED", "CANCELLED"];
    if (terminal.includes(row.status)) {
      throw new CueError("invalid_state", `Cannot cancel a ${row.status.toLowerCase()} execution.`);
    }
    if (row.status === "QUEUED" || row.status === "AWAITING_APPROVAL") {
      await this.deps.executions.update(executionId, { status: "CANCELLED", finishedAt: new Date(), error: "Cancelled before start." });
    } else {
      this.cancelRequested.add(executionId);
      await this.deps.executions.update(executionId, { status: "CANCELLED" }).catch(() => {});
    }
    this.deps.emitter.emit(executionId, { type: "status", data: { status: "CANCELLED" } });
    await this.deps.audit?.record({
      workspaceId, actorId: row.userId, action: CUE_AUDIT_ACTIONS.executionCancel,
      targetType: "execution", targetId: executionId, metadata: { previousStatus: row.status },
    });
    return (await this.deps.executions.get(executionId, workspaceId))!;
  }

  /** Re-queue a parked execution once its approval gate was satisfied. */
  async resume(executionId: string, workspaceId: string): Promise<ExecutionRow> {
    const row = await this.deps.executions.get(executionId, workspaceId);
    if (!row) throw new CueError("execution_not_found", "Execution not found in this workspace.");
    if (row.status !== "AWAITING_APPROVAL") {
      throw new CueError("invalid_state", `Only parked (AWAITING_APPROVAL) executions can resume — current status ${row.status}.`);
    }
    const progress = readProgress(row);
    if (!progress) throw new CueError("invalid_state", "Parked execution has no resume cursor.");
    // The parked step's gate was satisfied by the approval — mark it so the
    // runner doesn't park again on the same gate.
    if (!progress.approvedGates.includes(progress.nextSeq)) {
      progress.approvedGates.push(progress.nextSeq);
    }
    await this.deps.executions.update(executionId, {
      status: "QUEUED",
      approvalId: null,
      result: { progress } as never,
    });
    if (!this.queue) throw new CueError("unknown", "Execution queue not attached.");
    await this.queue.enqueue(executionId);
    this.deps.emitter.emit(executionId, { type: "status", data: { status: "QUEUED", resumed: true } });
    return (await this.deps.executions.get(executionId, workspaceId))!;
  }

  // ── Runner (queue entry) ────────────────────────────────────────────────

  async run(executionId: string): Promise<void> {
    // The queue only knows an id; the runner is trusted and loads unscoped.
    const fresh = await this.deps.executions.getUnscoped(executionId);
    if (!fresh) return;
    if (fresh.status === "CANCELLED") return;
    if (!["QUEUED", "RETRYING"].includes(fresh.status)) return; // idempotency guard

    const planRows = (fresh.plan ?? []) as PlanStep[];
    if (planRows.length === 0) {
      await this.deps.executions.update(executionId, { status: "FAILED", error: "Execution has no plan.", finishedAt: new Date() });
      return;
    }

    let attached: AttachedSession | null = null;
    try {
      await this.deps.executions.update(executionId, { status: "RUNNING", startedAt: fresh.startedAt ?? new Date(), attempts: fresh.attempts + 1 });
      this.deps.emitter.emit(executionId, { type: "status", data: { status: "RUNNING" } });
      attached = await this.deps.sessions.attach(fresh.sessionId, fresh.workspaceId);
      const policy = await this.deps.permissions.policyFor(fresh.workspaceId);
      const planned = this.deps.planner.planAgainst(policy, planRows.map((p) => ({ action: p.action, args: p.args, ...(p.note ? { note: p.note } : {}) })));
      const progress = readProgress(fresh) ?? { nextSeq: 1, approvedGates: [], outputs: {} };
      const deadline = Date.now() + attached.limits.executionTimeoutMs;

      for (const step of planned.steps) {
        if (step.seq < progress.nextSeq) continue;
        if (Date.now() > deadline) throw new CueError("timeout", `Execution exceeded the ${Math.round(attached.limits.executionTimeoutMs / 1000)}s overall budget.`);
        if (this.cancelRequested.has(executionId)) throw new ExecutionCancelled();

        // Approval gate parked at this step?
        const gate = planned.gates.find((g) => g.seq === step.seq);
        if (gate && !progress.approvedGates.includes(step.seq)) {
          if (!this.deps.approvals) {
            throw new CueError("policy_denied", `Step ${step.seq} requires approval (confirmation domain) but the approvals bridge is not wired.`);
          }
          const approval = await this.deps.approvals.request({
            workspaceId: fresh.workspaceId,
            executionId,
            reason: gate.reason,
            detail: gate.detail,
            actionType: `browser.${step.action.id}`,
          });
          await this.deps.executions.update(executionId, {
            status: "AWAITING_APPROVAL",
            approvalId: approval.approvalId,
            result: { progress: { ...progress, nextSeq: step.seq } } as never,
          });
          this.deps.emitter.emit(executionId, { type: "gate", seq: step.seq, data: { approvalId: approval.approvalId, reason: gate.reason } });
          await this.deps.audit?.record({
            workspaceId: fresh.workspaceId, actorId: fresh.userId, action: CUE_AUDIT_ACTIONS.approvalRequest,
            targetType: "execution", targetId: executionId, metadata: { approvalId: approval.approvalId, seq: step.seq, reason: gate.reason },
          });
          return; // parked — the approvals route resumes on APPROVED.
        }

        const output = await this.runStep(step, attached, policy, fresh, executionId);
        progress.outputs[step.seq] = summarizeOutput(output);
        progress.nextSeq = step.seq + 1;
        // Persist the cursor between steps (crash-ish resilience within a warm process).
        await this.deps.executions.update(executionId, { result: { progress, outputs: progress.outputs } as never }).catch(() => {});
      }

      // Validation phase: session still live + recording finalize.
      await this.deps.executions.update(executionId, { status: "VALIDATING" });
      this.deps.emitter.emit(executionId, { type: "status", data: { status: "VALIDATING" } });
      const finalEvents = await this.deps.events.listForExecution(executionId);
      await this.deps.recording.finalize({
        executionId,
        workspaceId: fresh.workspaceId,
        events: finalEvents,
        startedAt: fresh.startedAt ?? new Date(),
        finishedAt: new Date(),
        pageUrlsBySeq: pageUrlsOf(finalEvents),
      });
      const summary = buildSummary(finalEvents, attached);
      await this.deps.executions.update(executionId, {
        status: "SUCCEEDED",
        result: { outputs: progress.outputs, summary } as never,
        finishedAt: new Date(),
      });
      this.deps.emitter.emit(executionId, { type: "status", data: { status: "SUCCEEDED", summary } });
      await this.deps.sessions.touch(fresh.sessionId).catch(() => {});
      await this.deps.audit?.record({
        workspaceId: fresh.workspaceId, actorId: fresh.userId, action: CUE_AUDIT_ACTIONS.executionFinish,
        targetType: "execution", targetId: executionId, metadata: { status: "SUCCEEDED", ...summary },
      });
    } catch (err) {
      await this.finishFailed(err, executionId, fresh, attached);
    } finally {
      this.cancelRequested.delete(executionId);
    }
  }

  private async runStep(
    step: PlannedStep,
    attached: AttachedSession,
    policy: PolicyRow,
    execution: ExecutionRow,
    executionId: string
  ): Promise<Record<string, unknown>> {
    const action = step.action;
    let args = step.args;
    let recovered = false;
    let healedFrom: unknown = undefined;
    const maxAttempts = 3; // recovery policy default; RecoveryService owns the table

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (this.cancelRequested.has(executionId)) throw new ExecutionCancelled();
      const eventRow = await this.deps.events.append({
        executionId,
        workspaceId: execution.workspaceId,
        seq: step.seq,
        action: action.id,
        selector: selectorOfArgs(args) as never,
        args: args as never,
        status: "RUNNING",
        attempt,
        durationMs: null,
        error: null,
        screenshotId: null,
        healedFrom: (healedFrom ?? null) as never,
        metadata: step.note ? ({ note: step.note } as never) : null,
      });
      this.deps.emitter.emit(executionId, { type: "step", seq: step.seq, data: { action: action.id, attempt, status: "RUNNING" } });
      const started = Date.now();

      try {
        this.deps.permissions.assertWith(policy, action.permission);
        if (action.id === "navigate" || action.id === "open_tab" || action.id === "download_file") {
          const url = typeof args.url === "string" ? args.url : null;
          if (url) this.deps.permissions.assertNavigation(policy, url); // blocked throws; confirm pre-gated at gate check
        }
        const ctx = this.buildContext(attached, policy, execution, executionId);
        const result = await action.execute(ctx, args as never);
        const durationMs = Date.now() - started;

        // Step screenshot (workspace setting) — the recording's visual trail.
        let screenshotId: string | null = result.artifacts?.find((a) => a.kind === "screenshot")?.id ?? null;
        if (!screenshotId && attached.limits.recordScreenshots && action.id !== "wait") {
          screenshotId = await this.captureStepScreenshot(attached, execution, executionId).catch(() => null);
        }

        await this.deps.events.update(eventRow.id, {
          status: recovered ? "RECOVERED" : "SUCCEEDED",
          durationMs,
          screenshotId,
          metadata: result.data ? ({ output: truncateOutput(result.data) } as never) : null,
        });
        this.deps.emitter.emit(executionId, {
          type: "step", seq: step.seq,
          data: { action: action.id, attempt, status: recovered ? "RECOVERED" : "SUCCEEDED", durationMs, output: truncateOutput(result.data ?? {}) },
        });
        return result.data ?? {};
      } catch (err) {
        if (err instanceof ExecutionCancelled) throw err;
        if (this.cancelRequested.has(executionId)) throw new ExecutionCancelled();
        const cue = toCueError(err, `${action.id} failed`);
        const durationMs = Date.now() - started;

        if (attempt >= maxAttempts || isImmediatelyFatal(cue)) {
          const failureShot = attached.limits.screenshotOnFail
            ? await this.captureFailureScreenshot(attached, execution, executionId).catch(() => null)
            : null;
          await this.deps.events.update(eventRow.id, {
            status: "FAILED", durationMs, error: `${cue.kind}: ${cue.message}`.slice(0, 500), screenshotId: failureShot,
          });
          this.deps.emitter.emit(executionId, { type: "step", seq: step.seq, data: { action: action.id, attempt, status: "FAILED", error: cue.message.slice(0, 300) } });
          throw new StepFailed(cue, step.seq, eventRow.id);
        }

        const decision = await this.deps.recovery.decide(
          { error: cue, attempt, actionId: action.id, args },
          this.recoveryHooks(attached, execution)
        );
        if (decision.strategy === "fail") {
          const failureShot = attached.limits.screenshotOnFail
            ? await this.captureFailureScreenshot(attached, execution, executionId).catch(() => null)
            : null;
          await this.deps.events.update(eventRow.id, {
            status: "FAILED", durationMs, error: `${cue.kind}: ${cue.message}`.slice(0, 500), screenshotId: failureShot,
          });
          this.deps.emitter.emit(executionId, { type: "step", seq: step.seq, data: { action: action.id, attempt, status: "FAILED", error: cue.message.slice(0, 300) } });
          throw new StepFailed(cue, step.seq, eventRow.id);
        }

        await this.deps.events.update(eventRow.id, {
          status: "FAILED", durationMs, error: `${cue.kind}: ${cue.message}`.slice(0, 400),
          metadata: { recovery: decision.strategy, reason: decision.reason } as never,
        });
        this.deps.emitter.emit(executionId, {
          type: "recovery", seq: step.seq,
          data: { action: action.id, attempt, strategy: decision.strategy, reason: decision.reason },
        });
        if (decision.healedSelector) {
          healedFrom = decision.healedFrom ?? selectorOfArgs(args); // OLD spec, before rewrite
          args = { ...args, selector: decision.healedSelector };
          recovered = true;
        } else if (decision.strategy === "refresh_retry" || decision.strategy === "session_recovery") {
          recovered = true;
        } else {
          recovered = recovered || decision.strategy === "dismiss_dialog_retry";
        }
        if (decision.delayMs > 0) await sleep(decision.delayMs);
        // next attempt
      }
    }
    // Unreachable by construction (loop either returns or throws).
    throw new CueError("unknown", "Step attempts exhausted unexpectedly.");
  }

  // ── Context construction (wires artifacts, uploads, permissions, emit) ──

  private buildContext(attached: AttachedSession, policy: PolicyRow, execution: ExecutionRow, executionId: string): ActionRunContext {
    const deps = this.deps;
    const manager = this;
    return {
      sessionId: attached.row.id,
      executionId,
      limits: attached.limits,
      handle: attached.handle,
      assertPermission(permission) {
        deps.permissions.assertWith(policy, permission);
      },
      async persistArtifact(artifact: ActionArtifact): Promise<PersistedArtifact> {
        if (artifact.kind === "screenshot") {
          const row = await deps.screenshots.persist({
            workspaceId: execution.workspaceId,
            data: artifact.data!,
            mime: (artifact.mime ?? "image/png") as "image/png" | "image/jpeg",
            kind: "MANUAL",
            sessionId: attached.row.id,
            executionId,
            maxBytes: attached.limits.artifactMaxBytes,
          });
          return { id: row.id, kind: "screenshot" };
        }
        const ingested = await deps.downloads.ingest({
          workspaceId: execution.workspaceId,
          sessionId: attached.row.id,
          executionId,
          suggestedFilename: artifact.suggestedFilename ?? "download.bin",
          mime: artifact.mime ?? (artifact.kind === "pdf" ? "application/pdf" : "application/octet-stream"),
          data: artifact.data,
          tempPath: artifact.tempPath,
          maxBytes: attached.limits.artifactMaxBytes,
        });
        await deps.audit?.record({
          workspaceId: execution.workspaceId, actorId: execution.userId, action: CUE_AUDIT_ACTIONS.downloadIngest,
          targetType: "download", targetId: ingested.row.id,
          metadata: { filename: ingested.row.filename, bytes: ingested.row.sizeBytes, scan: ingested.row.scanStatus },
        });
        return { id: ingested.row.id, kind: artifact.kind === "pdf" ? "pdf" : "download" };
      },
      resolveUploadPaths(uploadIds) {
        return deps.uploads.materialize(uploadIds, execution.workspaceId);
      },
      emit(event) {
        deps.emitter.emit(executionId, { type: "log", data: { source: "action", ...event.data } });
      },
    };
    void manager;
  }

  private recoveryHooks(attached: AttachedSession, execution: ExecutionRow) {
    return {
      healSelector: async (hint: string) => {
        try {
          return await discoverSelectors(attached.handle.page(), hint, 5);
        } catch {
          return null;
        }
      },
      refreshPage: async () => {
        await attached.handle.page().reload({ waitUntil: "domcontentloaded", timeout: attached.limits.actionTimeoutMs }).catch(() => {});
      },
      recoverSession: async () => {
        const recovered = await this.deps.sessions.attach(execution.sessionId, execution.workspaceId).catch(() => null);
        if (recovered) {
          attached.handle = recovered.handle;
        }
      },
    };
  }

  // ── Finishers ───────────────────────────────────────────────────────────

  private async captureStepScreenshot(attached: AttachedSession, execution: ExecutionRow, executionId: string): Promise<string | null> {
    const page = attached.handle.page();
    const data = await page.screenshot({ type: "jpeg", quality: 70, timeout: 10_000 });
    if (data.length > attached.limits.artifactMaxBytes) return null;
    const row = await this.deps.screenshots.persist({
      workspaceId: execution.workspaceId,
      data, mime: "image/jpeg", kind: "STEP",
      sessionId: attached.row.id, executionId,
      maxBytes: attached.limits.artifactMaxBytes,
    });
    return row.id;
  }

  private async captureFailureScreenshot(attached: AttachedSession, execution: ExecutionRow, executionId: string): Promise<string | null> {
    try {
      const page = attached.handle.page();
      const data = await page.screenshot({ type: "jpeg", quality: 80, timeout: 10_000 });
      if (data.length > attached.limits.artifactMaxBytes) return null;
      const row = await this.deps.screenshots.persist({
        workspaceId: execution.workspaceId,
        data, mime: "image/jpeg", kind: "FAILURE",
        sessionId: attached.row.id, executionId,
        maxBytes: attached.limits.artifactMaxBytes,
      });
      return row.id;
    } catch {
      return null;
    }
  }

  private async finishFailed(err: unknown, executionId: string, execution: ExecutionRow, attached: AttachedSession | null): Promise<void> {
    if (err instanceof ExecutionCancelled) {
      await this.deps.executions.update(executionId, { status: "CANCELLED", finishedAt: new Date(), error: "Cancelled by user." });
      this.deps.emitter.emit(executionId, { type: "status", data: { status: "CANCELLED" } });
      return;
    }
    const stepErr = err instanceof StepFailed ? err : null;
    const cue = stepErr ? stepErr.cause2 : toCueError(err, "execution failed");
    await this.deps.executions.update(executionId, {
      status: "FAILED",
      error: `${cue.kind}: ${cue.message}`.slice(0, 500),
      failedStep: stepErr?.seq ?? null,
      finishedAt: new Date(),
    });
    // Recording still finalizes on failure — the replay shows how far it got.
    const finalEvents = await this.deps.events.listForExecution(executionId).catch(() => []);
    if (finalEvents.length > 0) {
      await this.deps.recording.finalize({
        executionId,
        workspaceId: execution.workspaceId,
        events: finalEvents,
        startedAt: execution.startedAt,
        finishedAt: new Date(),
        pageUrlsBySeq: pageUrlsOf(finalEvents),
      }).catch(() => {});
    }
    this.deps.emitter.emit(executionId, {
      type: "status",
      data: { status: "FAILED", error: cue.message.slice(0, 300), failedStep: stepErr?.seq ?? null },
    });
    if (attached) await this.deps.sessions.touch(execution.sessionId).catch(() => {});
    await this.deps.audit?.record({
      workspaceId: execution.workspaceId, actorId: execution.userId, action: CUE_AUDIT_ACTIONS.executionFinish,
      targetType: "execution", targetId: executionId,
      metadata: { status: "FAILED", error: cue.message.slice(0, 300), failedStep: stepErr?.seq ?? null },
    });
  }

  // ── Read passthroughs ───────────────────────────────────────────────────

  async get(executionId: string, workspaceId: string) {
    const row = await this.deps.executions.get(executionId, workspaceId);
    if (!row) throw new CueError("execution_not_found", "Execution not found in this workspace.");
    return row;
  }

  list(workspaceId: string, opts?: Parameters<ExecutionRepository["list"]>[1]) {
    return this.deps.executions.list(workspaceId, opts);
  }

  events(executionId: string, opts?: Parameters<ActionEventRepository["listForExecution"]>[1]) {
    return this.deps.events.listForExecution(executionId, opts);
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

class StepFailed extends Error {
  constructor(readonly cause2: CueError, readonly seq: number, readonly eventId: string) {
    super(cause2.message);
    this.name = "StepFailed";
  }
}

interface RunProgress {
  nextSeq: number;
  approvedGates: number[];
  outputs: Record<number, unknown>;
}

function readProgress(row: ExecutionRow): RunProgress | null {
  const result = row.result as { progress?: { nextSeq?: number; approvedGates?: number[]; outputs?: Record<string, unknown> } } | null;
  if (!result?.progress?.nextSeq) return null;
  const outputs = (result.progress.outputs ?? {}) as Record<string, unknown>;
  const normalized: Record<number, unknown> = {};
  for (const [k, v] of Object.entries(outputs)) normalized[Number(k)] = v;
  return {
    nextSeq: result.progress.nextSeq,
    approvedGates: result.progress.approvedGates ?? [],
    outputs: normalized,
  };
}

function selectorOfArgs(args: Record<string, unknown>): unknown {
  return typeof args === "object" && args && "selector" in args ? (args as { selector: unknown }).selector : null;
}

function truncateOutput(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "selector" || key === "healedFrom" || key === "confidence" || key === "matchCount") continue;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    out[key] = text && text.length > 800 ? `${text.slice(0, 800)}…` : value;
  }
  return out;
}

function summarizeOutput(data: Record<string, unknown>): Record<string, unknown> {
  return truncateOutput(data);
}

function pageUrlsOf(events: Array<{ seq: number; metadata: unknown }>): Record<number, string> {
  const map: Record<number, string> = {};
  for (const e of events) {
    const url = (e.metadata as { output?: { url?: unknown } } | null)?.output?.url;
    if (typeof url === "string") map[e.seq] = url;
  }
  return map;
}

function buildSummary(events: Array<{ action: string; status: string; durationMs: number | null }>, attached: AttachedSession | null): Record<string, unknown> {
  const succeeded = events.filter((e) => e.status === "SUCCEEDED" || e.status === "RECOVERED").length;
  const recovered = events.filter((e) => e.status === "RECOVERED").length;
  const totalMs = events.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  return {
    actionsSucceeded: succeeded,
    actionsRecovered: recovered,
    totalActionMs: totalMs,
    finalUrl: attached?.handle.url() ?? null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const IMMEDIATELY_FATAL = new Set([
  "policy_denied", "validation", "unsupported", "quota", "approval_required", "artifact_too_large",
  "session_not_found", "session_closed", "invalid_state",
]);

function isImmediatelyFatal(err: CueError): boolean {
  return IMMEDIATELY_FATAL.has(err.kind);
}

