import { db } from "@/lib/db";
import { audit as auditLog } from "@/lib/audit";
import { ModelRouter } from "@runtime/model-router/router";
import { UsageTracker } from "@runtime/usage/tracker";
import { MemoryService } from "@runtime/memory/service";
import { KnowledgeService } from "@runtime/knowledge/service";
import { ToolRegistry } from "@runtime/tools/tool";
import { ToolExecutor } from "@runtime/tools/executor";
import { Planner } from "@runtime/planner/planner";
import { WorkflowExecutor } from "@runtime/workflows/executor";
import { calculatorTool, datetimeTool, jsonTransformTool } from "@runtime/tools/builtin/utility";
import { httpRequestTool } from "@runtime/tools/builtin/http";
import {
  createKnowledgeSearchTool,
  createMemoryRecallTool,
} from "@runtime/tools/builtin/contextual";
import { providerConfigSource } from "./settings";

/**
 * DI composition root — builds the runtime graph once per process.
 * Every layer beneath (router/memory/knowledge/tools/planner/workflows)
 * depends on ports; this module supplies the concrete Prisma/audit wiring.
 */

export interface RuntimeContainer {
  router: ModelRouter;
  usage: UsageTracker;
  memory: MemoryService;
  knowledge: KnowledgeService;
  tools: ToolRegistry;
  executor: ToolExecutor;
  planner: Planner;
  workflows: WorkflowExecutor;
}

let container: RuntimeContainer | null = null;

export function getRuntime(): RuntimeContainer {
  if (container) return container;

  const usage = new UsageTracker(db);
  const router = new ModelRouter(providerConfigSource(), {
    record: (event) => usage.record(event),
  });
  const memory = new MemoryService(db);
  const knowledge = new KnowledgeService(db, (workspaceId) => ({
    embed: (request) => router.embed({ workspaceId }, request),
  }));

  const tools = new ToolRegistry()
    .register(calculatorTool)
    .register(datetimeTool)
    .register(jsonTransformTool)
    .register(httpRequestTool)
    .register(createKnowledgeSearchTool(knowledge))
    .register(createMemoryRecallTool(memory));

  const executor = new ToolExecutor(
    tools,
    {
      log: async (entry) => {
        await auditLog({
          workspaceId: entry.workspaceId,
          actorId: entry.actorId,
          action: entry.action === "ai.tool.error" ? "ai.tool.error" : "ai.tool.execute",
          targetType: "ai_tool",
          targetId: entry.target,
          metadata: entry.metadata ?? {},
        });
      },
    },
    {
      recordToolCall: async (event) => {
        await usage.record({
          workspaceId: event.workspaceId,
          userId: event.userId,
          kind: "TOOL",
          status: event.ok ? "OK" : "ERROR",
          provider: "builtin",
          model: event.tool,
          usage: { latencyMs: event.latencyMs },
          toolCallCount: 1,
          errorCode: event.error,
        });
      },
    }
  );

  const planner = new Planner(router, tools, executor, {
    request: async ({ workspaceId, goal, step, stepIndex }) => {
      // Bridge plan gates into the shared Approval model (plan-derived rows
      // link to the workspace; run-derived rows keep linking to AgentRun).
      const approval = await db.approval.create({
        data: {
          workspaceId,
          actionType: "plan.step",
          requestedTo: "workspace.manager",
          detail: { goal: goal.slice(0, 180), step, stepIndex } as object,
          status: "PENDING",
        },
      });
      return { approvalId: approval.id };
    },
  });

  const workflows = new WorkflowExecutor({ router, tools, executor, memory });

  container = { router, usage, memory, knowledge, tools, executor, planner, workflows };
  return container;
}

/** Audit action names used by the AI layer (registered in audit catalog). */
export const AI_AUDIT_ACTIONS = {
  providerConfigCreate: "ai.provider.create",
  providerConfigUpdate: "ai.provider.update",
  providerConfigDelete: "ai.provider.delete",
  providerConfigTest: "ai.provider.test",
  settingsUpdate: "ai.settings.update",
  promptCreate: "ai.prompt.create",
  promptUpdate: "ai.prompt.update",
  promptPublish: "ai.prompt.publish",
  promptDelete: "ai.prompt.delete",
  memoryForget: "ai.memory.forget",
  knowledgeIngest: "ai.knowledge.ingest",
  knowledgeDelete: "ai.knowledge.delete",
  workflowCreate: "ai.workflow.create",
  workflowUpdate: "ai.workflow.update",
  workflowRun: "ai.workflow.run",
  workflowDelete: "ai.workflow.delete",
  apiKeyCreate: "ai.apikey.create",
  apiKeyRevoke: "ai.apikey.revoke",
} as const;
