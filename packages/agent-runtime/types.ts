/**
 * Agent Runtime — shared contracts for AI Workers.
 *
 * Phase 5 builds ON the Phase 2 data model (Agent / AgentRun / RunEvent /
 * Approval) and the Phase 3 runtime (ModelRouter / Planner / ToolExecutor);
 * this package adds orchestration semantics without redesigning either.
 */
import { z } from "zod";

// ── Worker taxonomies ───────────────────────────────────────────────────

export const WORKER_TYPES = ["general", "research", "ops"] as const;
export type WorkerType = (typeof WORKER_TYPES)[number];
export const workerTypeSchema = z.enum(WORKER_TYPES);

// ── Budgets ─────────────────────────────────────────────────────────────

export const workerBudgetSchema = z.object({
  /** Hard cap on planner steps per run (repair attempts count inside a step). */
  maxSteps: z.number().int().min(1).max(200).default(25),
  /** Cumulative token cap (prompt + completion) per run. */
  maxTokens: z.number().int().min(1).max(10_000_000).default(400_000),
  /** Cumulative cost cap in millionths of a USD. */
  maxCostMicros: z.number().int().min(0).max(1_000_000_000).default(2_000_000),
  /** Wall-clock cap per run. */
  maxDurationMs: z.number().int().min(30_000).max(3_600_000).default(900_000),
  /** Concurrency cap per agent. */
  maxConcurrentRuns: z.number().int().min(1).max(20).default(3),
  /** Delegation nesting cap (0 disables delegation). */
  maxDepth: z.number().int().min(0).max(4).default(2),
});
export type WorkerBudget = z.infer<typeof workerBudgetSchema>;

// ── Tool policy ─────────────────────────────────────────────────────────

export const toolPolicySchema = z.object({
  /** When non-empty, ONLY these tools (by registry name) may be used. */
  allow: z.array(z.string().trim().min(1).max(80)).max(64).default([]),
  /** Always removed, even when present in allow. */
  deny: z.array(z.string().trim().min(1).max(80)).max(64).default([]),
  /** Permit this worker to delegate to other agents (agent_delegate tool). */
  allowDelegation: z.boolean().default(false),
});
export type ToolPolicy = z.infer<typeof toolPolicySchema>;

// ── Run input / output ──────────────────────────────────────────────────

export const runInputSchema = z.object({
  /** Goal override; falls back to the agent's own goal. */
  goal: z.string().trim().min(3).max(4_000).optional(),
  /** Opaque payload handed to the worker (seed queries, record ids, …). */
  data: z.record(z.string(), z.unknown()).optional(),
});
export type RunInput = z.infer<typeof runInputSchema>;

export const citationSchema = z.object({
  url: z.string().url().max(2_000),
  title: z.string().max(500).default(""),
});
export type Citation = z.infer<typeof citationSchema>;

export const researchReportSchema = z.object({
  title: z.string().min(3).max(300),
  summary: z.string().min(10).max(4_000),
  markdown: z.string().min(10).max(60_000),
  citations: z.array(citationSchema).max(50).default([]),
});
export type ResearchReport = z.infer<typeof researchReportSchema>;

export const runOutputSchema = z.object({
  /** Planner's final reflection. */
  reflection: z.string().max(10_000).optional(),
  /** Research workers only — structured, cited report. */
  report: researchReportSchema.optional(),
  /** Concise per-step digest for the dashboard. */
  steps: z.array(z.object({
    description: z.string().max(500),
    tool: z.string().max(80).optional(),
    status: z.enum(["succeeded", "failed", "skipped", "awaiting_approval"]),
    error: z.string().max(500).optional(),
  })).max(200).optional(),
  /** Delegated child runs, when the worker delegated. */
  delegatedRuns: z.array(z.object({
    runId: z.string(),
    agentId: z.string(),
    status: z.string(),
    summary: z.string().max(500).optional(),
  })).max(50).optional(),
});
export type RunOutput = z.infer<typeof runOutputSchema>;

// ── Run events (RunEvent.type vocabulary) ───────────────────────────────

export const RUN_EVENT = {
  runQueued: "run_queued",
  runStarted: "run_started",
  planReady: "plan_ready",
  stepStart: "step_start",
  stepDone: "step_done",
  approvalParked: "approval_parked",
  approvalResumed: "approval_resumed",
  delegateStart: "delegate_start",
  delegateDone: "delegate_done",
  budgetTripped: "budget_tripped",
  cancelRequested: "cancel_requested",
  runSucceeded: "run_succeeded",
  runFailed: "run_failed",
  runCanceled: "run_canceled",
  note: "note",
} as const;
export type RunEventType = (typeof RUN_EVENT)[keyof typeof RUN_EVENT];

// ── Dispatch contract ───────────────────────────────────────────────────

export const dispatchSchema = z.object({
  goal: z.string().trim().min(3).max(4_000).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  /** LIVE or SHADOW; DRAFT/SHADOW agents are forced into SHADOW. */
  mode: z.enum(["LIVE", "SHADOW"]).optional(),
  /** Client deduplication key (unique per agent). */
  idempotencyKey: z.string().trim().min(4).max(120).optional(),
});
export type DispatchInput = z.infer<typeof dispatchSchema>;
