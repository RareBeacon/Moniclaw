/**
 * Delegation — the multi-agent seam.
 *
 * A worker whose tool policy sets allowDelegation=true receives the
 * `agent_delegate` tool (injected by the orchestrator, not in the global
 * registry — delegation is a capability, not a default). A delegation call
 * creates and synchronously runs a CHILD AgentRun against another agent in
 * the SAME workspace, with:
 *   - depth tracking (parent.run.depth + 1, capped by budget.maxDepth)
 *   - budget share (child inherits at most 50% of remaining budget)
 *   - cycle prevention (no self- or ancestor-delegation)
 *   - the child's status/mode re-validated like any dispatch
 *
 * The parent step output is the child's terminal output — the parent stays
 * blocked on the delegate tool call, which keeps reasoning coherent.
 */
import { z } from "zod";
import type { Tool } from "@runtime/tools/tool";
import { AgentError } from "./errors";

export const DELEGATE_TOOL_NAME = "agent_delegate";

export const delegateArgsSchema = z.object({
  agent: z.string().trim().min(2).max(80).describe("Slug or id of the agent to delegate to."),
  goal: z.string().trim().min(3).max(2000).describe("Self-contained sub-goal for the child run."),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type DelegateArgs = z.infer<typeof delegateArgsSchema>;

export interface DelegationHandle {
  delegate(parent: { runId: string; agentId: string; workspaceId: string }, args: DelegateArgs): Promise<{
    runId: string;
    agentId: string;
    status: string;
    summary: string;
  }>;
}

export function createDelegateTool(handle: DelegationHandle, parent: { runId: string; agentId: string; workspaceId: string }): Tool {
  return {
    name: DELEGATE_TOOL_NAME,
    description:
      "Delegate a self-contained sub-goal to another agent in this workspace. " +
      "Runs synchronously: you get the child run's outcome as the tool result. " +
      "Use sparingly — delegation consumes budget.",
    schema: delegateArgsSchema,
    metadata: { category: "orchestration", mutating: false, version: "1.0.0" },
    async execute(raw) {
      const args = delegateArgsSchema.parse(raw);
      try {
        const result = await handle.delegate(parent, args);
        return JSON.stringify(result);
      } catch (err) {
        if (err instanceof AgentError) {
          return JSON.stringify({ error: err.kind, message: err.message });
        }
        throw err;
      }
    },
  };
}
