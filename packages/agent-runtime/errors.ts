/** Agent Runtime errors — mirrors the CueError contract from Phase 4. */

export type AgentErrorKind =
  | "validation"
  | "not_found"
  | "permission_denied"
  | "agent_unavailable"
  | "run_conflict"
  | "budget_exceeded"
  | "cancelled"
  | "needs_approval"
  | "delegation_denied"
  | "upstream_failed"
  | "internal";

export const AGENT_HTTP_STATUS: Record<AgentErrorKind, number> = {
  validation: 400,
  not_found: 404,
  permission_denied: 403,
  agent_unavailable: 409,
  run_conflict: 409,
  budget_exceeded: 402,
  cancelled: 409,
  needs_approval: 409,
  delegation_denied: 403,
  upstream_failed: 502,
  internal: 500,
};

export class AgentError extends Error {
  readonly kind: AgentErrorKind;
  readonly detail?: Record<string, unknown>;

  constructor(kind: AgentErrorKind, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "AgentError";
    this.kind = kind;
    this.detail = detail;
  }
}

export function toAgentError(err: unknown, fallback: AgentErrorKind = "internal"): AgentError {
  if (err instanceof AgentError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new AgentError(fallback, message);
}
