import { test } from "node:test";
import assert from "node:assert/strict";

import { AgentError } from "../packages/agent-runtime/errors";
import { BudgetMeter, resolveBudget } from "../packages/agent-runtime/budget";

test("resolveBudget applies safe defaults and partial overrides", () => {
  const d = resolveBudget({});
  assert.equal(d.maxSteps, 25);
  assert.equal(d.maxConcurrentRuns, 3);
  assert.equal(d.maxDepth, 2);
  assert.ok(d.maxDurationMs >= 60_000);

  const p = resolveBudget({ maxSteps: 5, maxTokens: 10_000 });
  assert.equal(p.maxSteps, 5);
  assert.equal(p.maxTokens, 10_000);
  assert.equal(p.maxConcurrentRuns, 3); // untouched → default

  // Non-object inputs fall back to defaults; invalid values throw.
  assert.deepEqual(resolveBudget(null).maxSteps, 25);
  assert.deepEqual(resolveBudget("junk").maxSteps, 25);
  assert.throws(() => resolveBudget({ maxSteps: 0 }));
  assert.throws(() => resolveBudget({ maxDepth: 99 }));
});

test("meter trips on steps, tokens, cost and duration", () => {
  const budget = resolveBudget({ maxSteps: 2, maxTokens: 100, maxCostMicros: 50, maxDurationMs: 60_000 });

  const steps = new BudgetMeter(budget);
  steps.recordStep(); steps.assertWithin();
  steps.recordStep(); steps.assertWithin();
  steps.recordStep();
  assert.throws(() => steps.assertWithin(), (e: unknown) => e instanceof AgentError && (e as AgentError).kind === "budget_exceeded");

  const tokens = new BudgetMeter(budget);
  tokens.recordUsage({ tokens: 60 }); tokens.assertWithin();
  tokens.recordUsage({ tokens: 41 });
  assert.throws(() => tokens.assertWithin(), /budget/i);

  const cost = new BudgetMeter(budget);
  cost.recordUsage({ costMicros: 25 }); cost.assertWithin();
  cost.recordUsage({ costMicros: 25 }); cost.assertWithin(); // exactly 50 ≤ 50
  cost.recordUsage({ costMicros: 1 });
  assert.throws(() => cost.assertWithin(), /budget/i);

  let now = 1_000;
  const clock = () => now;
  const duration = new BudgetMeter(budget, clock);
  now += 30_000; duration.assertWithin(clock);
  now += 31_000;
  assert.throws(() => duration.assertWithin(clock), AgentError);
});

test("shareForChild hands the child at most half of the remaining budget", () => {
  const meter = new BudgetMeter(resolveBudget({ maxTokens: 1_000, maxCostMicros: 600 }));
  assert.deepEqual(meter.shareForChild(), { maxTokens: 500, maxCostMicros: 300 });
  meter.recordUsage({ tokens: 400, costMicros: 500 });
  assert.deepEqual(meter.shareForChild(), { maxTokens: 300, maxCostMicros: 50 });
  meter.recordUsage({ tokens: 600, costMicros: 100 });
  assert.deepEqual(meter.shareForChild(), { maxTokens: 0, maxCostMicros: 0 });
});
