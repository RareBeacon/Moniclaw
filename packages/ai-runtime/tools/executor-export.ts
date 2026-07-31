/** Barrel merging tool-core + executor exports (avoids name clashes). */
export {
  ToolRegistry,
  ToolExecutionError,
  toolSpec,
  isToolEnabled,
  type Tool,
  type ToolContext,
  type ToolMetadata,
} from "./tool";
export { ToolExecutor, type AuditPort, type ToolUsagePort } from "./executor";
export { evaluateExpression } from "./builtin/expression";
export { zodToJsonSchema } from "./zod-to-json-schema";
