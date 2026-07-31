import { z } from "zod";
import { CueError } from "../../errors";
import type { ActionArtifact, ActionCategory, ActionPermission, EngineLimits, RiskTier } from "../../types";
import type { SessionPageHandle } from "../handle";
import { selectorQuerySchema, selectorSpecSchema, type SelectorSpec, type SelectorQuery } from "../../selectors/types";
import { resolveStrict, type SelectorResolution } from "../../selectors/resolve";

/** Uniform selector argument: a single spec or a full query with fallbacks. */
export const selectorArgSchema = z.union([selectorSpecSchema, selectorQuerySchema]);
export type SelectorArg = z.infer<typeof selectorArgSchema>;

/** Upload resolved to a driver-readable local path. */
export interface ResolvedUpload {
  id: string;
  path: string;
  filename: string;
  mime: string;
}

export interface PersistedArtifact {
  /** Row id in the kind-appropriate table (screenshots/downloads/binaries). */
  id: string;
  kind: ActionArtifact["kind"];
}

/**
 * Everything an action may touch — assembled by the execution layer per run.
 * Policy is enforced twice on purpose: the planner pre-flights the plan, and
 * each action re-asserts before it executes (defense in depth).
 */
export interface ActionRunContext {
  readonly sessionId: string;
  readonly executionId: string | null;
  readonly limits: EngineLimits;
  readonly handle: SessionPageHandle;
  /** Throws policy_denied when the workspace policy blocks `permission`. */
  assertPermission(permission: ActionPermission): void;
  /** Throws artifact_too_large etc.; returns the persisted row id. */
  persistArtifact(artifact: ActionArtifact): Promise<PersistedArtifact>;
  /** Resolve workspace upload rows to local paths (upload_file action). */
  resolveUploadPaths(uploadIds: string[]): Promise<ResolvedUpload[]>;
  /** Live progress/logging hints (never throws). */
  emit(event: { type: string; data?: Record<string, unknown> }): void;
}

export interface ActionResult {
  /** JSON-serializable output recorded on the action event + result map. */
  data?: Record<string, unknown>;
  /** Opaque checkpoint handed to rollback() on unwind. */
  rollbackState?: unknown;
  artifacts?: PersistedArtifact[];
}

/**
 * Universal browser-action contract (id/name/description/permission/schema/
 * validate/execute/rollback/metadata) — one definition per action id.
 */
export interface ActionDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: ActionCategory;
  readonly permission: ActionPermission;
  readonly risk: RiskTier;
  readonly schema: TSchema;
  validate(raw: unknown): z.infer<TSchema>;
  execute(ctx: ActionRunContext, args: z.infer<TSchema>): Promise<ActionResult>;
  rollback?(ctx: ActionRunContext, state: unknown): Promise<void>;
}

export function defineAction<TSchema extends z.ZodTypeAny>(definition: {
  id: string;
  name: string;
  description: string;
  category: ActionCategory;
  permission: ActionPermission;
  risk: RiskTier;
  schema: TSchema;
  execute(ctx: ActionRunContext, args: z.infer<TSchema>): Promise<ActionResult>;
  rollback?(ctx: ActionRunContext, state: unknown): Promise<void>;
}): ActionDefinition<TSchema> {
  return {
    ...definition,
    validate(raw: unknown): z.infer<TSchema> {
      const parsed = definition.schema.safeParse(raw ?? {});
      if (!parsed.success) {
        const issues = parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".") || "args"}: ${i.message}`)
          .join("; ");
        throw new CueError("validation", `${definition.id}: invalid arguments — ${issues}`.slice(0, 500));
      }
      return parsed.data;
    },
  };
}

/** Shared helper — resolve a selector argument against the active page. */
export async function resolveTarget(
  ctx: ActionRunContext,
  selector: SelectorArg,
  timeoutMs?: number
): Promise<SelectorResolution> {
  ctx.emit({ type: "resolve", data: { selector: describeSelectorArg(selector) } });
  return resolveStrict(ctx.handle.page(), selector as SelectorQuery | SelectorSpec, timeoutMs ?? ctx.limits.actionTimeoutMs);
}

export function describeSelectorArg(selector: SelectorArg): string {
  const spec: SelectorSpec = "primary" in selector ? selector.primary : selector;
  if (spec.strategy === "role") return `role:${spec.role}`;
  return `${spec.strategy}:${"value" in spec ? String(spec.value).slice(0, 60) : ""}`;
}

/** Target metadata stamped onto results for event/self-healing persistence. */
export function targetMeta(resolution: SelectorResolution): Record<string, unknown> {
  return {
    selector: resolution.resolved.spec,
    confidence: Math.round(resolution.resolved.confidence * 1000) / 1000,
    matchCount: resolution.resolved.matchCount,
    ...(resolution.resolved.healedFrom ? { healedFrom: resolution.resolved.healedFrom } : {}),
  };
}

/** JSON-safe serialization for script/dom outputs (capped). */
export function jsonSafe(value: unknown, cap = 64_000): unknown {
  try {
    const text = JSON.stringify(value);
    if (!text) return value ?? null;
    if (text.length <= cap) return value;
    return { truncated: true, preview: text.slice(0, cap) };
  } catch {
    return String(value).slice(0, cap);
  }
}
