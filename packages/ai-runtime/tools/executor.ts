import { z } from "zod";
import {
  ToolExecutionError,
  isToolEnabled,
  type Tool,
  type ToolContext,
  type ToolRegistry,
} from "./tool";
import type { ToolCallRequest, ToolCallResult } from "../types";

/**
 * Tool executor — the ONLY path through which tools run.
 * One place for: enablement policy, input validation, timeouts,
 * audit logging, and usage accounting.
 */

export interface AuditPort {
  log(entry: {
    workspaceId: string;
    actorId: string | null;
    action: string;
    target?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface ToolUsagePort {
  recordToolCall(event: {
    workspaceId: string;
    userId?: string | null;
    tool: string;
    ok: boolean;
    latencyMs: number;
    error?: string;
  }): Promise<void>;
}

const nullAudit: AuditPort = { async log() {} };
const nullUsage: ToolUsagePort = { async recordToolCall() {} };

export class ToolExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly audit: AuditPort = nullAudit,
    private readonly usage: ToolUsagePort = nullUsage
  ) {}

  /** Execute one validated tool call with policy enforcement. */
  async execute(call: ToolCallRequest, ctx: ToolContext): Promise<ToolCallResult> {
    const started = Date.now();
    const tool = ctx.grants?.length
      ? this.registry.availableFor(ctx).find((t) => t.name === call.name)
      : this.registry.get(call.name);

    const finalize = async (result: ToolCallResult, ok: boolean, error?: string) => {
      const latencyMs = Date.now() - started;
      await this.audit.log({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId ?? null,
        action: ok ? "ai.tool.execute" : "ai.tool.error",
        target: call.name,
        metadata: {
          arguments: summarizeArgs(call.arguments),
          latencyMs,
          error: error?.slice(0, 300),
        },
      });
      await this.usage.recordToolCall({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        tool: call.name,
        ok,
        latencyMs,
        error,
      });
      return result;
    };

    if (!tool) {
      return finalize(
        { id: call.id, name: call.name, content: JSON.stringify({ error: `Unknown tool: ${call.name}` }), isError: true },
        false,
        "unknown_tool"
      );
    }
    if (!isToolEnabled(tool, ctx.toolPermissions, ctx.grants)) {
      return finalize(
        { id: call.id, name: call.name, content: JSON.stringify({ error: `Tool disabled for this workspace: ${call.name}` }), isError: true },
        false,
        new ToolExecutionError(call.name, "disabled", "disabled").code
      );
    }

    // Validate arguments against the tool's own schema.
    let input: z.infer<typeof tool.schema>;
    try {
      input = tool.schema.parse(call.arguments);
    } catch (error) {
      const message = error instanceof z.ZodError
        ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "Invalid arguments";
      return finalize(
        { id: call.id, name: call.name, content: JSON.stringify({ error: message }), isError: true },
        false,
        new ToolExecutionError(call.name, message, "invalid_input").code
      );
    }

    // Execute with the tool's timeout.
    const timeoutMs = tool.metadata.defaultTimeoutMs ?? 30_000;
    try {
      const output = await Promise.race([
        tool.execute(input, ctx),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new ToolExecutionError(call.name, `Timed out after ${timeoutMs}ms`, "timeout")),
            timeoutMs
          )
        ),
      ]);
      return finalize(
        { id: call.id, name: call.name, content: stringify(output) },
        true
      );
    } catch (error) {
      const message = (error as Error).message.slice(0, 500);
      const code = error instanceof ToolExecutionError ? error.code : "runtime";
      return finalize(
        { id: call.id, name: call.name, content: JSON.stringify({ error: message }), isError: true },
        false,
        code
      );
    }
  }

  /** Execute a sequence of calls (assistant tool-loop step). */
  async executeAll(calls: ToolCallRequest[], ctx: ToolContext): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];
    for (const call of calls) results.push(await this.execute(call, ctx));
    return results;
  }
}

function stringify(value: unknown): string {
  const text = JSON.stringify(value, null, 0);
  return text.length > 12_000 ? `${text.slice(0, 12_000)}…[truncated]` : text;
}

/** Keep audit payloads small + scrub obvious secrets. */
function summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (/key|token|secret|password/i.test(key)) {
      out[key] = "[redacted]";
    } else if (typeof value === "string") {
      out[key] = value.length > 120 ? `${value.slice(0, 120)}…` : value;
    } else if (value !== null && typeof value === "object") {
      out[key] = "[object]";
    } else {
      out[key] = value;
    }
  }
  return out;
}
