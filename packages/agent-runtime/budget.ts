/**
 * Budget resolution + in-run metering.
 *
 * Budgets are workspace-operator controls: an agent's `budget` JSONB column
 * is validated at dispatch time, snapshotted onto the run (immutable for the
 * run's life), then enforced by the meter between steps and after every
 * usage report. Exceeding any cap fails the run with `budget_exceeded`.
 */
import { AgentError } from "./errors";
import { workerBudgetSchema, type WorkerBudget } from "./types";

export function resolveBudget(raw: unknown): WorkerBudget {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return workerBudgetSchema.parse({});
  }
  return workerBudgetSchema.parse(raw);
}

export interface BudgetMeterSnapshot {
  steps: number;
  tokens: number;
  costMicros: number;
  elapsedMs: number;
}

/** Mutable per-run meter; the orchestrator feeds it usage and steps. */
export class BudgetMeter {
  private steps = 0;
  private tokens = 0;
  private costMicros = 0;
  private readonly startedAt: number;

  constructor(
    private readonly budget: WorkerBudget,
    now: () => number = Date.now
  ) {
    this.startedAt = now();
  }

  snapshot(now: () => number = Date.now): BudgetMeterSnapshot {
    return {
      steps: this.steps,
      tokens: this.tokens,
      costMicros: this.costMicros,
      elapsedMs: now() - this.startedAt,
    };
  }

  recordStep(): void {
    this.steps += 1;
  }

  recordUsage(delta: { tokens?: number; costMicros?: number }): void {
    this.tokens += Math.max(0, Math.trunc(delta.tokens ?? 0));
    this.costMicros += Math.max(0, Math.trunc(delta.costMicros ?? 0));
  }

  /** Throws AgentError("budget_exceeded") when any cap is breached. */
  assertWithin(now: () => number = Date.now): void {
    const s = this.snapshot(now);
    if (s.steps > this.budget.maxSteps) {
      throw new AgentError("budget_exceeded", `Step budget exceeded (${s.steps}/${this.budget.maxSteps}).`, { snapshot: s });
    }
    if (s.tokens > this.budget.maxTokens) {
      throw new AgentError("budget_exceeded", `Token budget exceeded (${s.tokens}/${this.budget.maxTokens}).`, { snapshot: s });
    }
    if (s.costMicros > this.budget.maxCostMicros) {
      throw new AgentError("budget_exceeded", `Cost budget exceeded (${s.costMicros}µ$/${this.budget.maxCostMicros}µ$).`, { snapshot: s });
    }
    if (s.elapsedMs > this.budget.maxDurationMs) {
      throw new AgentError("budget_exceeded", `Duration budget exceeded (${s.elapsedMs}ms/${this.budget.maxDurationMs}ms).`, { snapshot: s });
    }
  }

  /** How much budget a delegated child may inherit at most (50% policy). */
  shareForChild(): Pick<WorkerBudget, "maxTokens" | "maxCostMicros"> {
    const remainingTokens = Math.max(0, this.budget.maxTokens - this.tokens);
    const remainingCost = Math.max(0, this.budget.maxCostMicros - this.costMicros);
    return {
      maxTokens: Math.floor(remainingTokens / 2),
      maxCostMicros: Math.floor(remainingCost / 2),
    };
  }
}
