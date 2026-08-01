import type { MoniClawClient } from "./client";

/**
 * Agents + Teams SDK namespace (Phase 5 workers, Phase 7 crews).
 * Mirrors the REST surface exactly — same envelopes, same guards.
 */

export interface AgentDto {
  id: string; workspaceId: string; name: string; slug: string; description: string;
  status: string; workerType: string; goal: string | null; runCount: number;
  createdAt: string; updatedAt: string;
}

export interface AgentRunDto {
  id: string; agentId: string; workspaceId: string; status: string; mode: string;
  triggerSource: string; teamId: string | null; parentRunId: string | null; depth: number;
  tokensUsed: number; stepsExecuted: number; errorClass: string | null;
  createdAt: string; startedAt: string | null; finishedAt: string | null;
}

export interface AgentTeamDto {
  id: string; name: string; slug: string; description: string | null;
  leader: { id: string; name: string; slug: string; status: string } | null;
  members: Array<{ agentId: string; name: string; slug: string; status: string; promptHint: string | null; position: number }>;
  budget: unknown; runCount: number; createdAt: string;
}

export interface TeamInputDto {
  name: string;
  slug?: string;
  description?: string | null;
  leaderAgentId?: string | null;
  members?: Array<{ agentId: string; promptHint?: string | null; position?: number }>;
  budget?: Partial<{ maxSteps: number; maxTokens: number; maxCostMicros: number; maxDurationMs: number; maxConcurrentRuns: number; maxDepth: number }>;
}

export class AgentsClient {
  readonly teams: TeamsClient;

  constructor(private readonly client: MoniClawClient) {
    this.teams = new TeamsClient(client);
  }

  list(opts?: { includeArchived?: boolean }) {
    return this.client.request<{ agents: AgentDto[] }>("GET", "/api/agents", undefined, {
      query: { includeArchived: opts?.includeArchived ? "1" : undefined },
    });
  }

  get(id: string) {
    return this.client.request<{ agent: AgentDto }>("GET", `/api/agents/${id}`);
  }

  create(input: Record<string, unknown>) {
    return this.client.request<{ agent: AgentDto }>("POST", "/api/agents", input);
  }

  /** Queue a run (202 on fresh dispatch; same idempotencyKey → deduped 200). */
  dispatch(id: string, input?: { goal?: string; data?: Record<string, unknown>; mode?: "LIVE" | "SHADOW"; idempotencyKey?: string }) {
    return this.client.request<{ run: AgentRunDto; deduplicated: boolean }>("POST", `/api/agents/${id}/dispatch`, input ?? {});
  }

  runs(opts?: { agentId?: string; status?: string; teamId?: string; limit?: number }) {
    return this.client.request<{ runs: AgentRunDto[] }>("GET", "/api/agents/runs", undefined, {
      query: {
        agentId: opts?.agentId, status: opts?.status, teamId: opts?.teamId,
        limit: opts?.limit,
      },
    });
  }

  cancelRun(runId: string) {
    return this.client.request<{ run: AgentRunDto }>("POST", `/api/agents/runs/${runId}/cancel`);
  }

  health() {
    return this.client.request<Record<string, unknown>>("GET", "/api/agents/health");
  }
}

class TeamsClient {
  constructor(private readonly client: MoniClawClient) {}

  list() {
    return this.client.request<{ teams: AgentTeamDto[] }>("GET", "/api/agent-teams");
  }

  get(id: string) {
    return this.client.request<{ team: AgentTeamDto }>("GET", `/api/agent-teams/${id}`);
  }

  create(input: TeamInputDto) {
    return this.client.request<{ team: AgentTeamDto }>("POST", "/api/agent-teams", input);
  }

  /** PATCH: partial fields; `members` (when present) replaces the whole roster. */
  update(id: string, patch: Partial<TeamInputDto>) {
    return this.client.request<{ team: AgentTeamDto }>("PATCH", `/api/agent-teams/${id}`, patch);
  }

  delete(id: string) {
    return this.client.request<{ deleted: boolean }>("DELETE", `/api/agent-teams/${id}`);
  }

  /** Dispatch the team (leader + composed briefing). 202 on a fresh run. */
  run(id: string, input: { goal: string; mode?: "LIVE" | "SHADOW"; idempotencyKey?: string }) {
    return this.client.request<{
      run: AgentRunDto;
      deduplicated: boolean;
      team: { id: string; name: string; slug: string };
    }>("POST", `/api/agent-teams/${id}/run`, input);
  }
}
