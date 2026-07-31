import { z } from "zod";
import { CueError } from "../errors";
import type { ActionDefinition } from "../browser-engine/actions/context";
import { actionById } from "../browser-engine/actions/catalog";
import type { PermissionService } from "../permissions/service";
import type { PlanStep, PolicyRow } from "../ports";

/** Steps the API/queue accepts: {action, args} with optional human note. */
export const planStepInputSchema = z.object({
  action: z.string().min(1).max(60),
  args: z.record(z.string(), z.unknown()).default({}),
  note: z.string().max(500).optional(),
});

export const executionStartSchema = z.object({
  sessionId: z.string().uuid(),
  goal: z.string().min(1).max(1000).optional(),
  steps: z.array(planStepInputSchema).min(1).max(100),
});

export interface PlannedStep {
  seq: number;
  action: ActionDefinition;
  args: Record<string, unknown>;
  note?: string;
}

export interface PlanGate {
  seq: number;
  actionId: string;
  reason: string;
  detail: Record<string, unknown>;
}

export interface PlannedExecution {
  steps: PlannedStep[];
  gates: PlanGate[];
}

/**
 * ActionPlanner — turns raw caller steps into a validated execution plan.
 *
 * This is deterministic on purpose: `steps` are the production input (REST,
 * SDK, AI-runtime tool calls). Natural-language goal decomposition is the
 * Phase 5+ AI planner's job (it emits steps into this exact same pipeline),
 * the optional `goal` field rides along for recordings/audit.
 *
 * Planning performs every static check available without a live browser:
 * catalog resolution, argument schema validation, workspace permission
 * pre-flight, and domain policy pre-flight for navigation steps (blocked
 * domains fail fast; confirmation domains become approval gates).
 */
export class ActionPlanner {
  constructor(private readonly permissions: PermissionService) {}

  async plan(workspaceId: string, rawSteps: Array<z.infer<typeof planStepInputSchema>>): Promise<PlannedExecution> {
    const policy = await this.permissions.policyFor(workspaceId);
    return this.planAgainst(policy, rawSteps);
  }

  /** Same planning against an already-loaded policy row. */
  planAgainst(policy: PolicyRow, rawSteps: Array<z.infer<typeof planStepInputSchema>>): PlannedExecution {
    const steps: PlannedStep[] = [];
    const gates: PlanGate[] = [];

    rawSteps.forEach((raw, index) => {
      const seq = index + 1;
      let definition: ActionDefinition;
      try {
        definition = actionById(raw.action);
      } catch (err) {
        throw new CueError("validation", `Step ${seq}: ${(err as Error).message}`);
      }

      // 1 · argument validation (zod via the definition itself)
      let args: Record<string, unknown>;
      try {
        args = definition.validate(raw.args) as Record<string, unknown>;
      } catch (err) {
        if (err instanceof CueError) throw new CueError("validation", `Step ${seq} (${definition.id}) → ${err.message}`);
        throw err;
      }

      // 2 · permission pre-flight
      const verdict = this.permissions.canWith(policy, definition.permission);
      if (!verdict.allowed) {
        throw new CueError("policy_denied", `Step ${seq} (${definition.id}) requires "${definition.permission}": ${verdict.reason ?? "denied by workspace policy"}`);
      }

      // 3 · domain pre-flight for steps that carry URLs
      for (const url of urlsInStep(definition.id, args)) {
        const domain = this.permissions.checkDomain(policy, url);
        if (domain.decision === "blocked") {
          throw new CueError("policy_denied", `Step ${seq} (${definition.id}) targets ${url}, blocked by workspace policy (rule: ${domain.matched}).`);
        }
        if (domain.decision === "confirm") {
          gates.push({
            seq,
            actionId: definition.id,
            reason: `Navigation to ${url} matches confirmation rule "${domain.matched}" — human approval required before this step runs.`,
            detail: { url, matchedRule: domain.matched },
          });
        }
      }

      steps.push({ seq, action: definition, args, ...(raw.note ? { note: raw.note } : {}) });
    });

    return { steps, gates };
  }
}

/** URL-bearing fields per action id (kept small and explicit). */
function urlsInStep(actionId: string, args: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) urls.push(value);
  };
  if (actionId === "navigate") push(args.url);
  if (actionId === "open_tab") push(args.url);
  if (actionId === "download_file") push(args.url);
  return urls;
}

/** Serialize a plan for BrowserExecution.plan (JSON column). */
export function planToRows(planned: PlannedExecution): PlanStep[] {
  return planned.steps.map((step) => ({
    seq: step.seq,
    action: step.action.id,
    args: step.args,
    ...(step.note ? { note: step.note } : {}),
  }));
}
