/**
 * MoniClaw AI Runtime — public API.
 * All business logic consumes these interfaces; adapters stay internal.
 */

// Core types + errors
export * from "./types";
export * from "./errors";

// Providers
export {
  PROVIDER_CATALOG,
  FREE_FIRST_ORDER,
  providerMeta,
  envFallbackProviders,
  type ProviderId,
  type ProviderMeta,
} from "./providers/registry";
export type {
  ChatProvider,
  EmbeddingProvider,
  ProviderCredentials,
} from "./providers/provider";

// Router
export {
  ModelRouter,
  defaultFreeFirstChain,
  type ProviderConfigSource,
  type ResolvedProviderConfig,
  type RoutedRequestContext,
  type RouterOptions,
  type UsageSink,
} from "./model-router/router";

// Prompts
export {
  renderPrompt,
  composeSystemPrompt,
  promptVariableSchema,
  promptVariablesSchema,
  PromptRenderError,
  type PromptVariable,
  type RenderResult,
} from "./prompts/renderer";

// Memory
export { MemoryService, type MemoryRecallItem } from "./memory/service";

// Knowledge
export { KnowledgeService, SUPPORTED_MIMES, type SearchHit, type KnowledgeLimits, type Embedder } from "./knowledge/service";
export { chunkText, estimateTokens } from "./knowledge/chunker";
export { extractText, extractHtml, sniffMime, ExtractionError } from "./knowledge/extract";

// Tools
export {
  ToolRegistry,
  ToolExecutor,
  ToolExecutionError,
  toolSpec,
  type Tool,
  type ToolContext,
  type ToolMetadata,
  type AuditPort,
  type ToolUsagePort,
} from "./tools/executor-export";
export { calculatorTool, datetimeTool, jsonTransformTool } from "./tools/builtin/utility";
export { httpRequestTool } from "./tools/builtin/http";
export { createKnowledgeSearchTool, createMemoryRecallTool } from "./tools/builtin/contextual";
export { evaluateExpression } from "./tools/builtin/expression";
export { zodToJsonSchema } from "./tools/zod-to-json-schema";

// Planner
export {
  Planner,
  planSchema,
  planStepSchema,
  type Plan,
  type PlanStep,
  type PlanRunResult,
  type StepTrace,
  type ApprovalGate,
} from "./planner/planner";

// Workflows
export {
  WorkflowExecutor,
  workflowDefinitionSchema,
  workflowNodeSchema,
  evaluateCondition,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowRunResult,
  type NodeTrace,
  type WorkflowPorts,
} from "./workflows/executor";

// Usage
export { UsageTracker, type UsageRecord } from "./usage/tracker";
