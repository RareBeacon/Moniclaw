/**
 * Ports — every external dependency of the orchestrator behind an interface.
 * App glue (lib/agents/) binds Prisma repositories; tests bind fakes.
 * Nothing in this package imports Next.js, Prisma implementations, or HTTP.
 */
import type { PlanRunResult, PlanSnapshot } from "@runtime/planner/planner";
import type { RunOutput, WorkerBudget, WorkerType } from "./types";

// ── Rows (minimal projections; implementations may return richer rows) ──

export interface AgentRow {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string;
  category: string | null;
  status: string; // AgentStatus enum string
  trigger: string; // TriggerType enum string
  schedule: string | null;
  skills: string[];
  workerType: WorkerType | string;
  goal: string | null;
  instructions: string | null;
  toolPolicy: unknown;
  budget: unknown;
  lastScheduledAt: Date | null;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type AgentRunStatus =
  | "QUEUED" | "RUNNING" | "NEEDS_APPROVAL" | "SUCCEEDED" | "FAILED" | "CANCELED";

export interface AgentRunRow {
  id: string;
  agentId: string;
  workspaceId: string;
  mode: string; // SHADOW | LIVE
  status: AgentRunStatus;
  triggerSource: string;
  creditsUsed: number;
  parentRunId: string | null;
  depth: number;
  plan: unknown;
  progress: unknown;
  budgetSnapshot: unknown;
  idempotencyKey: string | null;
  output: unknown;
  error: string | null;
  errorClass: string | null;
  cancelRequested: boolean;
  tokensUsed: number;
  stepsExecuted: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface AgentRunCreateInput {
  agentId: string;
  workspaceId: string;
  mode: "SHADOW" | "LIVE";
  triggerSource: string;
  parentRunId?: string | null;
  depth?: number;
  budgetSnapshot: WorkerBudget;
  goalSnapshot: string;
  idempotencyKey?: string | null;
  /** Seeded with { goal } so resume/summary paths can recompose cheaply. */
  progress?: Record<string, unknown>;
  id?: string;
}

export interface RunFinishPatch {
  status: AgentRunStatus;
  output?: RunOutput | null;
  error?: string | null;
  errorClass?: string | null;
  tokensUsed?: number;
  stepsExecuted?: number;
}

export interface RunEventRow {
  id: string;
  runId: string;
  ts: Date;
  type: string;
  message: string;
  payload: unknown;
}

// ── Repositories ────────────────────────────────────────────────────────

export interface AgentRepository {
  get(workspaceId: string, id: string): Promise<AgentRow | null>;
  getBySlug(workspaceId: string, slug: string): Promise<AgentRow | null>;
  list(workspaceId: string, opts?: { includeArchived?: boolean; take?: number }): Promise<AgentRow[]>;
  /** Agents eligible for the cron tick (SCHEDULE trigger, active status). */
  listSchedulable(now: Date): Promise<AgentRow[]>;
  touchLastScheduled(id: string, at: Date): Promise<void>;
  incrementRunCount(id: string, by?: number): Promise<void>;
}

export interface AgentRunRepository {
  create(input: AgentRunCreateInput): Promise<AgentRunRow>;
  get(workspaceId: string, id: string): Promise<AgentRunRow | null>;
  findByIdempotency(agentId: string, key: string): Promise<AgentRunRow | null>;
  list(workspaceId: string, opts?: {
    agentId?: string; status?: AgentRunStatus; parentRunId?: string | null;
    limit?: number; before?: Date;
  }): Promise<AgentRunRow[]>;
  listChildren(parentRunId: string): Promise<AgentRunRow[]>;
  countActiveByAgent(agentId: string): Promise<number>;
  /**
   * Unscoped lookup for orchestrator-owned queue jobs. Implementations MUST
   * only be reachable through executeRun (which re-validates before acting);
   * every HTTP-facing path uses the workspace-scoped `get`.
   */
  getInternal(id: string): Promise<AgentRunRow | null>;
  /** Atomic-ish status guard: only transitions from the expected state. */
  transition(id: string, from: AgentRunStatus[], to: AgentRunStatus, patch?: Partial<AgentRunRow>): Promise<boolean>;
  savePlan(id: string, plan: unknown): Promise<void>;
  saveProgress(id: string, progress: unknown): Promise<void>;
  setStepsExecuted(id: string, stepsExecuted: number): Promise<void>;
  requestCancel(workspaceId: string, id: string): Promise<boolean>;
  finish(id: string, patch: RunFinishPatch): Promise<void>;
}

export interface RunEventRepository {
  append(input: { runId: string; type: string; message: string; payload?: unknown }): Promise<RunEventRow>;
  list(runId: string, opts?: { afterTs?: Date; limit?: number }): Promise<RunEventRow[]>;
}

// ── Service ports ───────────────────────────────────────────────────────

export interface ApprovalBridgePort {
  create(input: {
    workspaceId: string;
    runId: string;
    agentName: string;
    goal: string;
    stepDescription: string;
    stepIndex: number;
  }): Promise<{ approvalId: string }>;
  statusOf(approvalId: string): Promise<"PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | null>;
}

export interface UsageQueryPort {
  sumByRequestId(workspaceId: string, requestId: string): Promise<{ tokens: number; costMicros: number }>;
}

export interface AuditSinkPort {
  log(input: {
    workspaceId: string;
    actorId?: string | null;
    action: string;
    target?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface AgentQueuePort {
  enqueue(runId: string, job: () => Promise<void>): void;
  drain(): Promise<void>;
  stats(): { queued: number; running: number; concurrency: number };
}

export interface AgentRateLimiterPort {
  check(key: string): Promise<void>;
}

export interface ClockPort {
  now(): Date;
}

/* ── Planner seam (Phase 3 engine behind a narrow interface) ────────── */

export interface PlannerPort {
  run(ctx: PlannerCtx, goal: string): Promise<PlanRunResult>;
  resume(ctx: PlannerCtx, snapshot: PlanSnapshot): Promise<PlanRunResult>;
}

export interface PlannerCtx {
  workspaceId: string;
  userId?: string | null;
  agentId?: string | null;
  requestId?: string;
  toolPermissions: Record<string, boolean>;
}

/* ── Research synthesis seam ─────────────────────────────────────────── */

export interface SynthesisInput {
  goal: string;
  stepDigest: string;
  sources: Array<{ url: string; title: string }>;
}

export interface SynthesizerPort {
  synthesize(ctx: PlannerCtx, input: SynthesisInput): Promise<RunOutput["report"] | null>;
}
