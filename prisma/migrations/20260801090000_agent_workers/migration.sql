-- Phase 5 · AI Workers — additive only; no Phase 2/3/4 semantics touched.

-- Agent: worker definition columns
ALTER TABLE "agents" ADD COLUMN "workerType" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "agents" ADD COLUMN "goal" TEXT;
ALTER TABLE "agents" ADD COLUMN "instructions" TEXT;
ALTER TABLE "agents" ADD COLUMN "toolPolicy" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "agents" ADD COLUMN "budget" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "agents" ADD COLUMN "lastScheduledAt" TIMESTAMP(3);
ALTER TABLE "agents" ADD COLUMN "runCount" INTEGER NOT NULL DEFAULT 0;

-- AgentRun: orchestration columns
ALTER TABLE "agent_runs" ADD COLUMN "parentRunId" TEXT;
ALTER TABLE "agent_runs" ADD COLUMN "depth" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "agent_runs" ADD COLUMN "plan" JSONB;
ALTER TABLE "agent_runs" ADD COLUMN "progress" JSONB;
ALTER TABLE "agent_runs" ADD COLUMN "budgetSnapshot" JSONB;
ALTER TABLE "agent_runs" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "agent_runs" ADD COLUMN "output" JSONB;
ALTER TABLE "agent_runs" ADD COLUMN "errorClass" TEXT;
ALTER TABLE "agent_runs" ADD COLUMN "cancelRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agent_runs" ADD COLUMN "tokensUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "agent_runs" ADD COLUMN "stepsExecuted" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "agent_runs"
  ADD CONSTRAINT "agent_runs_parentRunId_fkey"
  FOREIGN KEY ("parentRunId") REFERENCES "agent_runs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "agent_runs_parentRunId_idx" ON "agent_runs"("parentRunId");
-- NULL idempotency keys never collide (Postgres distinct-NULL semantics).
CREATE UNIQUE INDEX "agent_runs_agentId_idempotencyKey_key" ON "agent_runs"("agentId", "idempotencyKey");

-- Usage attribution for worker cost accounting
ALTER TABLE "ai_usage_events" ADD COLUMN "requestId" TEXT;
CREATE INDEX "ai_usage_events_workspaceId_requestId_idx" ON "ai_usage_events"("workspaceId", "requestId");
