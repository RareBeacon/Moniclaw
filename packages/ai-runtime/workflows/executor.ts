import { z } from "zod";
import type { ModelRouter, RoutedRequestContext } from "../model-router/router";
import type { ToolExecutor } from "../tools/executor";
import type { ToolContext, ToolRegistry } from "../tools/tool";
import type { MemoryService } from "../memory/service";
import { renderPrompt } from "../prompts/renderer";
import { evaluateExpression } from "../tools/builtin/expression";

/**
 * Workflow executor (foundation).
 *
 * Executes a directed graph of typed nodes: prompt, condition, loop, wait,
 * http, ai, tool, memory, output. Data flows through a shared variable
 * scope; nodes reference each other via {{nodeId.path}} templates.
 * Model-independent (AI nodes go through the router); side-effect-free by
 * default (mutating tools respect workspace permissions + grants).
 */

// ── Definition schema ────────────────────────────────────────────────────

export const workflowNodeSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/i),
    type: z.literal("prompt"),
    config: z.object({
      template: z.string().min(1),
      /** Saved template id — rendered instead of inline template when set. */
      templateId: z.string().optional(),
      saveAs: z.string().optional(),
    }),
  }),
  z.object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/i),
    type: z.literal("ai"),
    config: z.object({
      system: z.string().optional(),
      message: z.string().min(1),
      model: z.string().optional(),
      json: z.boolean().default(false),
    }),
  }),
  z.object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/i),
    type: z.literal("tool"),
    config: z.object({
      tool: z.string(),
      arguments: z.record(z.string(), z.unknown()).default({}),
    }),
  }),
  z.object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/i),
    type: z.literal("http"),
    config: z.object({
      url: z.string(), // templated
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
      headers: z.record(z.string(), z.string()).optional(),
      body: z.string().optional(),
    }),
  }),
  z.object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/i),
    type: z.literal("condition"),
    config: z.object({
      /** Arithmetic/logic expression over variables, e.g. "{{count}} > 3". */
      expression: z.string().min(1),
    }),
  }),
  z.object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/i),
    type: z.literal("loop"),
    config: z.object({
      times: z.number().int().min(1).max(20).default(1),
      saveAs: z.string().default("iteration"),
    }),
  }),
  z.object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/i),
    type: z.literal("wait"),
    config: z.object({ seconds: z.number().min(0.1).max(30) }),
  }),
  z.object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/i),
    type: z.literal("memory"),
    config: z.object({
      action: z.enum(["read", "write"]),
      query: z.string().optional(),
      content: z.string().optional(),
      scope: z.enum(["WORKSPACE", "AGENT", "LONG_TERM"]).default("WORKSPACE"),
      limit: z.number().int().min(1).max(10).default(5),
    }),
  }),
  z.object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/i),
    type: z.literal("output"),
    config: z.object({ template: z.string().min(1) }),
  }),
]);
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export const workflowDefinitionSchema = z
  .object({
    nodes: z.array(workflowNodeSchema).min(1).max(50),
    edges: z
      .array(
        z.object({
          from: z.string(),
          to: z.string(),
          /** For condition node sources: "true" | "false". */
          when: z.enum(["true", "false"]).optional(),
        })
      )
      .max(100),
  })
  .superRefine((def, ctx) => {
    const ids = new Set<string>();
    for (const node of def.nodes) {
      if (ids.has(node.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate node id: ${node.id}` });
      }
      ids.add(node.id);
    }
    for (const edge of def.edges) {
      if (!ids.has(edge.from)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Edge from unknown node: ${edge.from}` });
      if (!ids.has(edge.to)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Edge to unknown node: ${edge.to}` });
    }
    const outputs = def.nodes.filter((n) => n.type === "output");
    if (outputs.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Workflow needs at least one output node." });
    } else if (outputs.length > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Exactly one output node is supported." });
    }
    // Reachability: every node must be reachable from a root.
    const incoming = new Map<string, number>();
    for (const e of def.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    const roots = def.nodes.filter((n) => !incoming.has(n.id)).map((n) => n.id);
    if (!roots.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Workflow has no start node (a node with no incoming edges)." });
      return;
    }
    const seen = new Set<string>();
    const queue = [...roots];
    while (queue.length) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const e of def.edges.filter((e) => e.from === id)) queue.push(e.to);
    }
    for (const node of def.nodes) {
      if (!seen.has(node.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unreachable node: ${node.id}` });
      }
    }
  });
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

// ── Execution ────────────────────────────────────────────────────────────

export interface NodeTrace {
  nodeId: string;
  type: WorkflowNode["type"];
  status: "succeeded" | "failed" | "skipped";
  startedAt: string;
  finishedAt: string;
  output?: unknown;
  error?: string;
}

export interface WorkflowRunResult {
  status: "succeeded" | "failed";
  output: string | null;
  variables: Record<string, unknown>;
  trace: NodeTrace[];
}

export interface WorkflowPorts {
  router: ModelRouter;
  tools: ToolRegistry;
  executor: ToolExecutor;
  memory: MemoryService;
  /** Inline-template override from saved prompt templates (prompt nodes). */
  resolveTemplate?: (templateId: string, workspaceId: string) => Promise<string>;
}

export class WorkflowExecutor {
  constructor(private readonly ports: WorkflowPorts) {}

  async run(
    ctx: RoutedRequestContext & Omit<ToolContext, "workspaceId" | "userId">,
    definition: WorkflowDefinition,
    input: Record<string, unknown> = {}
  ): Promise<WorkflowRunResult> {
    const def = workflowDefinitionSchema.parse(definition);
    const nodes = new Map(def.nodes.map((n) => [n.id, n]));
    const variables: Record<string, unknown> = { input };
    const trace: NodeTrace[] = [];
    let output: string | null = null;
    const toolCtx: ToolContext = { ...ctx, workspaceId: ctx.workspaceId, userId: ctx.userId };

    const incoming = new Map<string, number>();
    for (const e of def.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    let frontier = def.nodes.filter((n) => !incoming.has(n.id)).map((n) => n.id);
    const visited = new Set<string>();
    const MAX_VISITS = 200; // loop guardrail
    let visits = 0;

    // Loop bookkeeping: loopNodeId → remaining iterations.
    const loopRemaining = new Map<string, number>();

    const render = (template: string) =>
      template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, path: string) => {
        const value = path.split(".").reduce<unknown>(
          (acc, seg) => (acc == null ? undefined : (acc as Record<string, unknown>)[seg]),
          variables
        );
        return value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
      });

    while (frontier.length) {
      const next: string[] = [];
      for (const nodeId of frontier) {
        if (++visits > MAX_VISITS) throw new Error("Workflow exceeded the 200 node-visit guardrail.");
        if (visited.size >= def.nodes.length * 20) break;
        visited.add(nodeId);
        const node = nodes.get(nodeId)!;
        const started = new Date();
        const record: NodeTrace = {
          nodeId,
          type: node.type,
          status: "succeeded",
          startedAt: started.toISOString(),
          finishedAt: started.toISOString(),
        };
        let edgeFilter: "true" | "false" | undefined;

        try {
          switch (node.type) {
            case "prompt": {
              const template = node.config.templateId
                ? await this.ports.resolveTemplate?.(node.config.templateId, ctx.workspaceId) ?? node.config.template
                : node.config.template;
              const rendered = renderPrompt(template, [], {});
              const value = render(rendered.rendered);
              variables[node.config.saveAs ?? node.id] = value;
              record.output = value.slice(0, 500);
              break;
            }
            case "ai": {
              const response = await this.ports.router.chat(ctx, {
                messages: [
                  ...(node.config.system ? [{ role: "system" as const, content: render(node.config.system) }] : []),
                  { role: "user" as const, content: render(node.config.message) },
                ],
                model: node.config.model,
                jsonMode: node.config.json,
                requestId: ctx.requestId,
              });
              const value: unknown = node.config.json ? safeJson(response.content) : response.content;
              variables[node.id] = { content: value, model: response.model, provider: response.provider };
              record.output = response.content.slice(0, 500);
              break;
            }
            case "tool": {
              const args = JSON.parse(render(JSON.stringify(node.config.arguments))) as Record<string, unknown>;
              const result = await this.ports.executor.execute(
                { id: `wf_${node.id}_${visits}`, name: node.config.tool, arguments: args },
                toolCtx
              );
              let parsed: unknown = result.content;
              try { parsed = JSON.parse(result.content); } catch { /* raw */ }
              variables[node.id] = { content: parsed, isError: result.isError ?? false };
              if (result.isError) {
                record.status = "failed";
                record.error = result.content.slice(0, 300);
              }
              record.output = typeof parsed === "string" ? parsed.slice(0, 500) : parsed;
              break;
            }
            case "http": {
              const result = await this.ports.executor.execute(
                {
                  id: `wf_${node.id}_${visits}`,
                  name: "http_request",
                  arguments: {
                    url: render(node.config.url),
                    method: node.config.method,
                    headers: node.config.headers,
                    body: node.config.body ? render(node.config.body) : undefined,
                  },
                },
                toolCtx
              );
              let parsed: unknown = result.content;
              try { parsed = JSON.parse(result.content); } catch { /* raw */ }
              variables[node.id] = { content: parsed, isError: result.isError ?? false };
              if (result.isError) {
                record.status = "failed";
                record.error = result.content.slice(0, 300);
              }
              record.output = typeof parsed === "string" ? parsed.slice(0, 500) : "[http result]";
              break;
            }
            case "condition": {
              const expr = render(node.config.expression)
                .replace(/\bAND\b/gi, "&&").replace(/\bOR\b/gi, "||")
                // Bare assignment-style "=" → comparison, without mangling
                // >=, <=, ==, !=, or SQL-style "<>".
                .replace(/(?<![<>=!])=(?![=])/g, "==")
                .replace(/<>/g, "!=");
              // Evaluate as arithmetic/comparison via the safe parser: supports
              // a > b | a >= b | a < b | a <= b | a == b | a != b
              const value = evaluateCondition(expr);
              variables[node.id] = { result: value };
              edgeFilter = value ? "true" : "false";
              record.output = value;
              break;
            }
            case "loop": {
              // `times` counts BODY iterations: the body arm fires exactly
              // `times` times, then one final visit routes the exit arm
              // (the iteration variable keeps its last value).
              const remaining = loopRemaining.get(node.id) ?? node.config.times;
              if (remaining <= 0) {
                loopRemaining.delete(node.id);
                edgeFilter = "false"; // exit arm
                record.output = { exit: true };
              } else {
                const iteration = node.config.times - remaining + 1;
                variables[node.config.saveAs] = iteration;
                loopRemaining.set(node.id, remaining - 1);
                edgeFilter = "true"; // body arm
                record.output = { iteration, remaining: loopRemaining.get(node.id) ?? 0 };
              }
              break;
            }
            case "wait": {
              await new Promise((r) => setTimeout(r, node.config.seconds * 1000));
              variables[node.id] = { waited: node.config.seconds };
              record.output = `${node.config.seconds}s`;
              break;
            }
            case "memory": {
              if (node.config.action === "read") {
                const items = await this.ports.memory.recall({
                  workspaceId: ctx.workspaceId,
                  scopes: [node.config.scope],
                  limit: node.config.limit,
                });
                const value = items.map((i) => i.content).join("\n---\n");
                variables[node.id] = { content: value, count: items.length };
                record.output = `${items.length} memories`;
              } else {
                if (!node.config.content) throw new Error("memory write node requires content.");
                const record_ = await this.ports.memory.remember({
                  workspaceId: ctx.workspaceId,
                  scope: node.config.scope,
                  content: render(node.config.content),
                  createdById: ctx.userId ?? null,
                });
                variables[node.id] = { id: record_.id };
                record.output = "stored";
              }
              break;
            }
            case "output": {
              output = render(node.config.template);
              variables[node.id] = { content: output };
              record.output = output.slice(0, 500);
              break;
            }
          }
        } catch (error) {
          record.status = "failed";
          record.error = (error as Error).message.slice(0, 300);
        } finally {
          record.finishedAt = new Date().toISOString();
          trace.push(record);
        }

        if (record.status === "failed") {
          return { status: "failed", output, variables, trace };
        }

        // Route to successors (condition/loop gates filter their arms).
        for (const edge of def.edges.filter((e) => e.from === nodeId)) {
          if (edgeFilter && edge.when !== edgeFilter) {
            // For loops: the "true" arm re-enters the body; "false" exits.
            if (node.type === "loop" || node.type === "condition") continue;
          }
          if (!edgeFilter && (node.type === "condition" || node.type === "loop") && edge.when) {
            // No decision recorded (shouldn't happen) — skip gated arms.
            continue;
          }
          next.push(edge.to);
        }
        // Loops re-queue themselves on the body arm's completion: handled by
        // having the body arm eventually route BACK to the loop node.
      }
      frontier = [...new Set(next)];
    }

    return { status: "succeeded", output, variables, trace };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Safe comparison evaluation: splits on one comparator and compares
 * numbers via the arithmetic evaluator; strings lexically. */
export function evaluateCondition(expr: string): boolean {
  const match = expr.match(/^(.*?)(>=|<=|==|!=|>|<)(.*)$/s);
  if (!match) {
    // Truthiness fallback for bare variable conditions.
    const value = expr.trim();
    return value !== "" && value !== "0" && value.toLowerCase() !== "false";
  }
  const [, lhs, op, rhs] = match;
  const leftRaw = lhs.trim();
  const rightRaw = rhs.trim();
  const leftNum = numeric(leftRaw);
  const rightNum = numeric(rightRaw);
  if (leftNum !== null && rightNum !== null) {
    switch (op) {
      case ">": return leftNum > rightNum;
      case "<": return leftNum < rightNum;
      case ">=": return leftNum >= rightNum;
      case "<=": return leftNum <= rightNum;
      case "==": return leftNum === rightNum;
      case "!=": return leftNum !== rightNum;
    }
  }
  const a = stripQuotes(leftRaw);
  const b = stripQuotes(rightRaw);
  switch (op) {
    case "==": return a === b;
    case "!=": return a !== b;
    case ">": return a > b;
    case "<": return a < b;
    case ">=": return a >= b;
    case "<=": return a <= b;
  }
  return false;
}

function numeric(value: string): number | null {
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (/^[\d\s+\-*/%^().]+$/.test(value) && /\d/.test(value)) {
    try {
      return evaluateExpression(value);
    } catch {
      return null;
    }
  }
  return null;
}

function stripQuotes(value: string): string {
  const m = value.match(/^"(.*)"$/) ?? value.match(/^'(.*)'$/);
  return m ? m[1] : value;
}
