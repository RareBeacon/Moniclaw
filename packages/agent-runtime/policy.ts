/**
 * Tool policy — agents never get the raw workspace registry.
 *
 * Enforcement is three-layer and defense-in-depth:
 *   1. PolicyToolRegistry (this file) hides non-allowed tools at the registry
 *      level — the planner cannot plan them and the executor reports them as
 *      unknown tools, never as "denied" (no oracle on what exists).
 *   2. ctx.toolPermissions (workspace AI settings) still applies inside the
 *      executor — a worker can never exceed its workspace's enablement.
 *   3. SHADOW runs strip every `mutating` tool, so dry-runs can't touch the
 *      outside world even when the workspace enabled those tools.
 *
 * Capability tools injected by the orchestrator (e.g. `agent_delegate`) are
 * granted by explicit flags (allowDelegation) and bypass registry allowlists.
 */
import type { Tool, ToolContext, ToolRegistry } from "@runtime/tools/tool";
import { toolSpec } from "@runtime/tools/tool";
import { toolPolicySchema, type ToolPolicy } from "./types";

export function resolveToolPolicy(raw: unknown): ToolPolicy {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return toolPolicySchema.parse({});
  }
  return toolPolicySchema.parse(raw);
}

/** Default allowlist per worker type when the operator set none. */
export function defaultAllowlist(workerType: string): string[] {
  const browser = [
    "browser_session_create", "browser_session_status", "browser_session_close",
    "browser_execute", "browser_extract", "browser_screenshot",
  ];
  switch (workerType) {
    case "research":
      return [
        "calculator", "datetime", "json_transform", "http_request",
        "knowledge_search", "memory_recall", ...browser,
      ];
    case "ops":
      return [
        "calculator", "datetime", "json_transform", "http_request",
        "knowledge_search", "memory_recall",
      ];
    default:
      return ["calculator", "datetime", "json_transform", "knowledge_search", "memory_recall"];
  }
}

export class PolicyToolRegistry {
  constructor(
    private readonly base: ToolRegistry,
    private readonly policy: ToolPolicy,
    private readonly opts: { workerType: string; shadow: boolean; extraTools?: Tool[] } = { workerType: "general", shadow: false }
  ) {}

  private isCapability(tool: Tool): boolean {
    return !!this.opts.extraTools?.some((t) => t === tool);
  }

  private allowed(tool: Tool): boolean {
    if (this.isCapability(tool)) {
      return !(this.opts.shadow && tool.metadata.mutating);
    }
    if (this.policy.deny.includes(tool.name)) return false;
    const allow = this.policy.allow.length > 0
      ? this.policy.allow
      : defaultAllowlist(this.opts.workerType);
    if (!allow.includes(tool.name)) return false;
    if (this.opts.shadow && tool.metadata.mutating) return false;
    return true;
  }

  /** Structural ToolRegistry — planner + executor consume this shape. */
  get(name: string): Tool | undefined {
    const tool = this.opts.extraTools?.find((t) => t.name === name) ?? this.base.get(name);
    if (!tool) return undefined;
    return this.allowed(tool) ? tool : undefined;
  }

  availableFor(ctx: Pick<ToolContext, "toolPermissions" | "grants">): Tool[] {
    const base = this.base.availableFor(ctx);
    const extras = this.opts.extraTools ?? [];
    return [...base, ...extras].filter((t) => this.allowed(t));
  }

  specsFor(ctx: Pick<ToolContext, "toolPermissions" | "grants">) {
    return this.availableFor(ctx).map(toolSpec);
  }
}
