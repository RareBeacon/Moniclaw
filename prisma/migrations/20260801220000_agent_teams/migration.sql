BEGIN;

-- Phase 7 — Multi-agent teams (additive only).
-- AlterTable
ALTER TABLE "agent_runs" ADD COLUMN     "teamId" TEXT;

-- CreateTable
CREATE TABLE "agent_teams" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "leaderAgentId" TEXT,
    "budget" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_team_members" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "promptHint" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_teams_workspaceId_slug_key" ON "agent_teams"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "agent_teams_workspaceId_idx" ON "agent_teams"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_team_members_teamId_agentId_key" ON "agent_team_members"("teamId", "agentId");

-- CreateIndex
CREATE INDEX "agent_team_members_agentId_idx" ON "agent_team_members"("agentId");

-- CreateIndex
CREATE INDEX "agent_runs_teamId_idx" ON "agent_runs"("teamId");

-- AddForeignKey
ALTER TABLE "agent_teams" ADD CONSTRAINT "agent_teams_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_teams" ADD CONSTRAINT "agent_teams_leaderAgentId_fkey" FOREIGN KEY ("leaderAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_teams" ADD CONSTRAINT "agent_teams_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_team_members" ADD CONSTRAINT "agent_team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "agent_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_team_members" ADD CONSTRAINT "agent_team_members_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "agent_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
