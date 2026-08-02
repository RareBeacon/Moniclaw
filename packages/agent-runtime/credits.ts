import type { AgentRunStatus } from "./ports";

/**
 * Worker-credit accrual — pure, one source of truth.
 *
 * Credits price worker compute, not outcomes: any run that did real work
 * (executed a step or consumed tokens) costs `max(1, ⌈tokens/1000⌉)`.
 * Runs refused/canceled before work and mid-flight rows charge nothing.
 * The orchestrator writes this onto the run at finish time; the monthly
 * plan gate sums the same column — accrual and enforcement can never drift.
 */
export function creditsForRun(run: {
  stepsExecuted: number;
  tokensUsed?: number | null;
  status: AgentRunStatus;
}): number {
  if (run.status !== "SUCCEEDED" && run.status !== "FAILED") return 0;
  const tokens = run.tokensUsed ?? 0;
  if (run.stepsExecuted <= 0 && tokens <= 0) return 0;
  return Math.max(1, Math.ceil(tokens / 1000));
}
