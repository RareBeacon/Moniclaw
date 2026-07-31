import { z } from "zod";
import { zodToJsonSchema } from "./zod-to-json-schema";

/**
 * Universal tool framework.
 *
 * Every tool — built-in or future (browser, email, calendar, CRM, DB,
 * filesystem, HTTP, search, GitHub, Slack) — implements THIS interface and
 * nothing else. The planner, workflows, chat loop and SDK all execute tools
 * through the same ToolExecutor, so policy, permissions and auditing live
 * in exactly one place.
 */

export interface ToolContext {
  workspaceId: string;
  userId?: string | null;
  agentId?: string | null;
  /** Resolved RBAC role for permission-aware tools ("OWNER"…"VIEWER"). */
  role?: string;
  /** Per-workspace enablement map from AI settings ({ toolName: boolean }). */
  toolPermissions: Record<string, boolean>;
  signal?: AbortSignal;
  /** Extra carve-outs provided by the caller (e.g. workflow-scoped grants). */
  grants?: ReadonlyArray<string>;
}

export interface ToolMetadata {
  /** e.g. "network", "compute", "knowledge", "memory", "integration". */
  category: string;
  /** Whether the tool performs external side effects (audit emphasises it). */
  mutating: boolean;
  /** RBAC action required from the human context, if any. */
  requiredAction?: string;
  /** Suggested per-call timeout. */
  defaultTimeoutMs?: number;
  version: string;
}

export interface Tool<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = unknown,
> {
  readonly name: string;
  readonly description: string;
  /** Zod schema for arguments; converted to JSON Schema for providers. */
  readonly schema: TInput;
  readonly metadata: ToolMetadata;
  execute(input: z.infer<TInput>, ctx: ToolContext): Promise<TOutput>;
}

/** Provider-facing spec derived from a tool (JSON Schema parameters). */
export function toolSpec(tool: Tool): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  return {
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.schema),
  };
}

// ── Registry ─────────────────────────────────────────────────────────────

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool registration: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** All tools enabled for a context (respecting workspace permissions). */
  availableFor(ctx: Pick<ToolContext, "toolPermissions" | "grants">): Tool[] {
    return [...this.tools.values()].filter(
      (t) => isToolEnabled(t, ctx.toolPermissions, ctx.grants)
    );
  }

  specsFor(ctx: Pick<ToolContext, "toolPermissions" | "grants">) {
    return this.availableFor(ctx).map(toolSpec);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }
}

/**
 * Enablement rule: workspace setting wins; absence = default-enabled for
 * read-only tools, default-DISABLED for mutating ones (safe-by-default).
 * Explicit caller grants can only *enable* what the workspace enables.
 */
export function isToolEnabled(
  tool: Tool,
  permissions: Record<string, boolean>,
  grants?: ReadonlyArray<string>
): boolean {
  const setting = permissions[tool.name];
  if (setting !== undefined) return setting && (grants ? grants.includes(tool.name) || true : true);
  if (grants?.length && !grants.includes(tool.name)) return false;
  return !tool.metadata.mutating;
}

export class ToolExecutionError extends Error {
  constructor(
    readonly toolName: string,
    message: string,
    readonly code: "disabled" | "invalid_input" | "runtime" | "timeout"
  ) {
    super(message);
    this.name = "ToolExecutionError";
  }
}
