import { z } from "zod";
import type { ModelRouter, RoutedRequestContext } from "../model-router/router";
import type { ToolExecutor } from "../tools/executor";
import type { ToolRegistry } from "../tools/tool";
import type { ToolContext } from "../tools/tool";

/**
 * Planning engine:  goal → decompose → select tools → execute → validate →
 * recover (bounded) → human-approval pauses → reflect → completion.
 *
 * The planner drives the model with JSON mode and validates EVERY artifact
 * against zod schemas — model output is treated as untrusted input.
 */

// ── Contracts ────────────────────────────────────────────────────────────

export const planStepSchema = z.object({
  description: z.string().min(3).max(500),
  tool: z.string().max(64).optional().describe("Registry tool name, if one is needed."),
  input: z.record(z.string(), z.unknown()).optional(),
  requiresApproval: z.boolean().default(false),
});
export const planSchema = z.object({
  reasoning: z.string().max(1000).optional(),
  steps: z.array(planStepSchema).min(1).max(12),
});
export type Plan = z.infer<typeof planSchema>;
export type PlanStep = z.infer<typeof planStepSchema>;

export interface StepTrace {
  step: PlanStep;
  status: "succeeded" | "failed" | "skipped" | "awaiting_approval";
  attempts: number;
  output?: unknown;
  error?: string;
}

export interface PlanRunResult {
  status: "completed" | "failed" | "awaiting_approval";
  goal: string;
  plan: Plan;
  trace: StepTrace[];
  /** Final reflection — absent when paused for approval. */
  reflection?: string;
  /** Set when paused; resumes via gate resolution. */
  approvalId?: string;
}

/** Durable checkpoint the caller persists between park and resume. */
export interface PlanSnapshot {
  goal: string;
  plan: Plan;
  trace: StepTrace[];
  /** Approval that paused the run; the caller consumes it before resume. */
  approvalId?: string;
}

/** How the planner requests human approval. Production bridges to the
 * existing Approval table; tests supply a fake. */
export interface ApprovalGate {
  request(input: {
    workspaceId: string;
    goal: string;
    step: PlanStep;
    stepIndex: number;
  }): Promise<{ approvalId: string }>;
}

// ── Engine ───────────────────────────────────────────────────────────────

const MAX_STEP_ATTEMPTS = 2;

export interface PlannerHooks {
  /** Before each step (awaited) — workers enforce budgets / kill-switch here. */
  onStepStart?(index: number, step: PlanStep): Promise<void> | void;
  /** After each step resolves (succeeded or failed). */
  onStepDone?(index: number, trace: StepTrace): Promise<void> | void;
}

export class Planner {
  constructor(
    private readonly router: ModelRouter,
    private readonly tools: ToolRegistry,
    private readonly executor: ToolExecutor,
    private readonly approvals: ApprovalGate,
    private readonly hooks: PlannerHooks = {}
  ) {}

  async run(
    ctx: RoutedRequestContext & Omit<ToolContext, "workspaceId" | "userId">,
    goal: string
  ): Promise<PlanRunResult> {
    const toolCtx: ToolContext = { ...ctx, workspaceId: ctx.workspaceId, userId: ctx.userId };
    const toolSpecs = this.tools.specsFor(toolCtx);

    // 1 · Decompose the goal into a validated plan.
    const plan = await this.decompose(ctx, goal, toolSpecs.map((t) => t.name));

    // 2 · Execute from the first step.
    return this.executeSteps(ctx, goal, plan, { trace: [], startIndex: 0, toolSpecs, toolCtx });
  }

  /**
   * Additive resume (Phase 5 workers): continue a plan that parked on a
   * human-approval gate. The caller owns the approval decision — when the
   * snapshot's last trace entry is `awaiting_approval` it is replaced by a
   * fresh execution of that same step (the gate counts as granted); all
   * earlier trace entries are kept untouched.
   */
  async resume(
    ctx: RoutedRequestContext & Omit<ToolContext, "workspaceId" | "userId">,
    snapshot: PlanSnapshot
  ): Promise<PlanRunResult> {
    const goal = snapshot?.goal;
    if (typeof goal !== "string" || !goal.trim()) {
      throw new Error("Cannot resume: snapshot goal is missing.");
    }
    const plan = planSchema.parse(snapshot.plan); // never trust persisted state blindly
    if (!Array.isArray(snapshot.trace)) {
      throw new Error("Cannot resume: snapshot trace is missing.");
    }
    const trace: StepTrace[] = snapshot.trace.map((t) => ({ ...t }));
    let skipGate = false;
    const last = trace[trace.length - 1];
    if (last && last.status === "awaiting_approval") {
      trace.pop(); // caller granted the gate — re-execute that step now
      skipGate = true;
    }
    const toolCtx: ToolContext = { ...ctx, workspaceId: ctx.workspaceId, userId: ctx.userId };
    const toolSpecs = this.tools.specsFor(toolCtx);
    return this.executeSteps(ctx, goal, plan, {
      trace,
      startIndex: trace.length,
      toolSpecs,
      toolCtx,
      skipGate,
    });
  }

  /** Shared step engine for run() and resume(). */
  private async executeSteps(
    ctx: RoutedRequestContext,
    goal: string,
    plan: Plan,
    carry: {
      trace: StepTrace[];
      startIndex: number;
      toolSpecs: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
      toolCtx: ToolContext;
      skipGate?: boolean;
    }
  ): Promise<PlanRunResult> {
    const { trace, startIndex, toolSpecs, toolCtx } = carry;
    let { skipGate = false } = carry;

    for (let index = startIndex; index < plan.steps.length; index++) {
      const step = plan.steps[index];
      await this.hooks.onStepStart?.(index, step);
      // Human-approval gate (mutating/sensitive steps)
      if (step.requiresApproval && !skipGate) {
        const approval = await this.approvals.request({
          workspaceId: ctx.workspaceId,
          goal,
          step,
          stepIndex: index,
        });
        trace.push({ step, status: "awaiting_approval", attempts: 0 });
        return { status: "awaiting_approval", goal, plan, trace, approvalId: approval.approvalId };
      }
      skipGate = false; // one-shot: only the caller-gated step skips once

      if (!step.tool) {
        // Reasoning-only step: mark succeeded (nothing to execute).
        const noopTrace: StepTrace = { step, status: "succeeded", attempts: 0, output: "no tool required" };
        trace.push(noopTrace);
        await this.hooks.onStepDone?.(index, noopTrace);
        continue;
      }

      const attemptTrace: StepTrace = { step, status: "failed", attempts: 0 };
      for (let attempt = 1; attempt <= MAX_STEP_ATTEMPTS; attempt++) {
        attemptTrace.attempts = attempt;
        const input = attempt === 1
          ? step.input ?? {}
          : await this.repairInput(ctx, goal, step, attemptTrace.error ?? "unknown error", toolSpecs);
        const result = await this.executor.execute(
          { id: `plan_${index}_${attempt}`, name: step.tool, arguments: input },
          toolCtx
        );
        let parsed: unknown = result.content;
        try {
          parsed = JSON.parse(result.content);
        } catch {
          /* keep raw string */
        }
        if (!result.isError && !(parsed as { error?: string })?.error) {
          attemptTrace.status = "succeeded";
          attemptTrace.output = parsed;
          break;
        }
        attemptTrace.error =
          (parsed as { error?: string })?.error ?? result.content.slice(0, 300);
      }
      trace.push(attemptTrace);
      await this.hooks.onStepDone?.(index, attemptTrace);
      if (attemptTrace.status === "failed") {
        // Recovery exhausted — fail the run with the full trace attached.
        const reflection = await this.reflect(ctx, goal, trace, false);
        return { status: "failed", goal, plan, trace, reflection };
      }
    }

    // 3 · Reflect on the whole run.
    const reflection = await this.reflect(ctx, goal, trace, true);
    return { status: "completed", goal, plan, trace, reflection };
  }

  private async decompose(
    ctx: RoutedRequestContext,
    goal: string,
    availableTools: string[]
  ): Promise<Plan> {
    const response = await this.router.chat(ctx, {
      messages: [
        {
          role: "system",
          content:
            "You are a planning engine. Decompose the user's goal into 1-12 concrete steps. " +
            "Use tools ONLY from this allowlist (omit `tool` for reasoning steps): " +
            `${availableTools.join(", ") || "(none available)"}. ` +
            "Mark requiresApproval=true for steps with external side effects " +
            "(sending, deleting, purchasing, publishing). Output ONLY the JSON plan.",
        },
        { role: "user", content: goal },
      ],
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 1500,
      requestId: ctx.requestId,
    });
    let raw: unknown;
    try {
      raw = JSON.parse(response.content);
    } catch {
      throw new Error(`Planner received non-JSON decomposition: ${response.content.slice(0, 200)}`);
    }
    const parsed = planSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `Planner decomposition failed validation: ${parsed.error.issues[0]?.message}`
      );
    }
    // Tool allowlist enforcement — never trust the model's choice blindly.
    for (const step of parsed.data.steps) {
      if (step.tool && !availableTools.includes(step.tool)) {
        throw new Error(`Planner selected unavailable tool: ${step.tool}`);
      }
    }
    return parsed.data;
  }

  /** Recovery: ask the model to fix tool input given the prior error. */
  private async repairInput(
    ctx: RoutedRequestContext,
    goal: string,
    step: PlanStep,
    error: string,
    toolSpecs: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
  ): Promise<Record<string, unknown>> {
    const spec = toolSpecs.find((t) => t.name === step.tool);
    const response = await this.router.chat(ctx, {
      messages: [
        {
          role: "system",
          content:
            `Repair tool-call arguments. Tool "${step.tool}" schema: ${JSON.stringify(spec?.parameters ?? {})}. ` +
            "Return ONLY a JSON object of corrected arguments.",
        },
        {
          role: "user",
          content:
            `Goal: ${goal}\nStep: ${step.description}\nPrevious arguments: ${JSON.stringify(step.input ?? {})}\nError: ${error}`,
        },
      ],
      jsonMode: true,
      temperature: 0.1,
      maxTokens: 600,
      requestId: ctx.requestId,
    });
    try {
      const parsed = JSON.parse(response.content);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return step.input ?? {};
    }
  }

  private async reflect(
    ctx: RoutedRequestContext,
    goal: string,
    trace: StepTrace[],
    success: boolean
  ): Promise<string> {
    const digest = trace
      .map((t, i) => `${i + 1}. [${t.status}] ${t.step.description}${t.error ? ` — ${t.error}` : ""}`)
      .join("\n");
    const response = await this.router.chat(ctx, {
      messages: [
        {
          role: "system",
          content:
            "You are a reflection engine. Given a goal and an execution trace, write a " +
            "3-sentence assessment: outcome, key evidence, and the single most important " +
            "next action (if any). Be precise, no marketing language.",
        },
        { role: "user", content: `Goal: ${goal}\nSucceeded overall: ${success}\nTrace:\n${digest}` },
      ],
      temperature: 0.3,
      maxTokens: 400,
      requestId: ctx.requestId,
    });
    return response.content;
  }
}
