-- Phase 4: MoniClaw Computer Use Engine (MCUE)
-- 11 tables + indexes. HNSW DROP INDEX lines from migrate diff are
-- intentionally omitted (hand-kept vector indexes from Phase 3).
BEGIN;

-- CreateEnum
CREATE TYPE "BrowserKind" AS ENUM ('CHROMIUM', 'CHROME', 'MSEDGE', 'FIREFOX');

-- CreateEnum
CREATE TYPE "BrowserMode" AS ENUM ('HEADLESS', 'HEADED');

-- CreateEnum
CREATE TYPE "BrowserSessionKind" AS ENUM ('EPHEMERAL', 'PERSISTENT', 'INCOGNITO');

-- CreateEnum
CREATE TYPE "BrowserSessionStatus" AS ENUM ('STARTING', 'ACTIVE', 'IDLE', 'RECOVERING', 'CLOSED', 'ERROR', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "BrowserExecutionStatus" AS ENUM ('QUEUED', 'PLANNING', 'RUNNING', 'VALIDATING', 'RETRYING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'AWAITING_APPROVAL');

-- CreateEnum
CREATE TYPE "BrowserActionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'RECOVERED');

-- DropIndex

-- DropIndex

-- DropIndex

-- CreateTable
CREATE TABLE "browser_workspace_settings" (
    "workspaceId" TEXT NOT NULL,
    "defaultBrowser" "BrowserKind" NOT NULL DEFAULT 'CHROMIUM',
    "headless" BOOLEAN NOT NULL DEFAULT true,
    "actionTimeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "executionTimeoutMs" INTEGER NOT NULL DEFAULT 120000,
    "sessionIdleTimeoutSec" INTEGER NOT NULL DEFAULT 600,
    "maxConcurrentSessions" INTEGER NOT NULL DEFAULT 3,
    "dialogPolicy" TEXT NOT NULL DEFAULT 'dismiss',
    "screenshotOnFail" BOOLEAN NOT NULL DEFAULT true,
    "recordScreenshots" BOOLEAN NOT NULL DEFAULT true,
    "maxArtifactMB" INTEGER NOT NULL DEFAULT 25,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "browser_workspace_settings_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "browser_policies" (
    "workspaceId" TEXT NOT NULL,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "navigationOnly" BOOLEAN NOT NULL DEFAULT false,
    "allowJavascript" BOOLEAN NOT NULL DEFAULT false,
    "allowDownloads" BOOLEAN NOT NULL DEFAULT true,
    "allowUploads" BOOLEAN NOT NULL DEFAULT true,
    "allowClipboard" BOOLEAN NOT NULL DEFAULT false,
    "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blockedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confirmationDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultAllowed" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "browser_policies_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "browser_profiles" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "browser" "BrowserKind" NOT NULL DEFAULT 'CHROMIUM',
    "userAgent" TEXT,
    "viewport" JSONB,
    "storageStateEnc" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "browser_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_sessions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "profileId" TEXT,
    "browser" "BrowserKind" NOT NULL DEFAULT 'CHROMIUM',
    "mode" "BrowserMode" NOT NULL DEFAULT 'HEADLESS',
    "kind" "BrowserSessionKind" NOT NULL DEFAULT 'EPHEMERAL',
    "status" "BrowserSessionStatus" NOT NULL DEFAULT 'STARTING',
    "endpoint" TEXT,
    "currentUrl" TEXT,
    "currentTitle" TEXT,
    "tabCount" INTEGER NOT NULL DEFAULT 1,
    "activeTab" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "idleExpiresAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "browser_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_executions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,
    "goal" TEXT,
    "status" "BrowserExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "plan" JSONB,
    "result" JSONB,
    "error" TEXT,
    "approvalId" TEXT,
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "failedStep" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "browser_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_action_events" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "selector" JSONB,
    "args" JSONB,
    "status" "BrowserActionStatus" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "durationMs" INTEGER,
    "error" TEXT,
    "screenshotId" TEXT,
    "healedFrom" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "browser_action_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_recordings" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "screenshots" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "timeline" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "browser_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_binaries" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "browser_binaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_downloads" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionId" TEXT,
    "executionId" TEXT,
    "filename" TEXT NOT NULL,
    "suggestedName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "binaryId" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "scanDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "browser_downloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_uploads" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "uploaderId" TEXT,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "binaryId" TEXT NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "browser_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "browser_screenshots" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionId" TEXT,
    "executionId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'AUTO',
    "binaryId" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "browser_screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "browser_profiles_workspaceId_deletedAt_idx" ON "browser_profiles"("workspaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "browser_sessions_workspaceId_status_lastActivityAt_idx" ON "browser_sessions"("workspaceId", "status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "browser_executions_workspaceId_status_createdAt_idx" ON "browser_executions"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "browser_executions_sessionId_createdAt_idx" ON "browser_executions"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "browser_action_events_executionId_seq_attempt_idx" ON "browser_action_events"("executionId", "seq", "attempt");

-- CreateIndex
CREATE INDEX "browser_action_events_workspaceId_createdAt_idx" ON "browser_action_events"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "browser_recordings_executionId_key" ON "browser_recordings"("executionId");

-- CreateIndex
CREATE INDEX "browser_recordings_workspaceId_createdAt_idx" ON "browser_recordings"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "browser_binaries_workspaceId_sha256_idx" ON "browser_binaries"("workspaceId", "sha256");

-- CreateIndex
CREATE INDEX "browser_downloads_workspaceId_createdAt_idx" ON "browser_downloads"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "browser_uploads_workspaceId_createdAt_idx" ON "browser_uploads"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "browser_screenshots_workspaceId_createdAt_idx" ON "browser_screenshots"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "browser_workspace_settings" ADD CONSTRAINT "browser_workspace_settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_policies" ADD CONSTRAINT "browser_policies_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_profiles" ADD CONSTRAINT "browser_profiles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_profiles" ADD CONSTRAINT "browser_profiles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_sessions" ADD CONSTRAINT "browser_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_sessions" ADD CONSTRAINT "browser_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_sessions" ADD CONSTRAINT "browser_sessions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "browser_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_executions" ADD CONSTRAINT "browser_executions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_executions" ADD CONSTRAINT "browser_executions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_executions" ADD CONSTRAINT "browser_executions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "browser_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_action_events" ADD CONSTRAINT "browser_action_events_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "browser_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_recordings" ADD CONSTRAINT "browser_recordings_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "browser_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_binaries" ADD CONSTRAINT "browser_binaries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_downloads" ADD CONSTRAINT "browser_downloads_binaryId_fkey" FOREIGN KEY ("binaryId") REFERENCES "browser_binaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_downloads" ADD CONSTRAINT "browser_downloads_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "browser_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_uploads" ADD CONSTRAINT "browser_uploads_binaryId_fkey" FOREIGN KEY ("binaryId") REFERENCES "browser_binaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_uploads" ADD CONSTRAINT "browser_uploads_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_screenshots" ADD CONSTRAINT "browser_screenshots_binaryId_fkey" FOREIGN KEY ("binaryId") REFERENCES "browser_binaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "browser_screenshots" ADD CONSTRAINT "browser_screenshots_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "browser_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;


COMMIT;
