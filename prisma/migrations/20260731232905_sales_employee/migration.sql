BEGIN;

-- CreateEnum
CREATE TYPE "SalesResearchStatus" AS ENUM ('NONE', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SalesContactStatus" AS ENUM ('NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED', 'CUSTOMER', 'LOST');

-- CreateEnum
CREATE TYPE "SalesContactSource" AS ENUM ('MANUAL', 'RESEARCH', 'IMPORT');

-- CreateEnum
CREATE TYPE "SalesDealStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "SalesActivityType" AS ENUM ('NOTE', 'TASK', 'CALL', 'MEETING', 'EMAIL', 'REMINDER');

-- CreateEnum
CREATE TYPE "SalesCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SalesCampaignStepKind" AS ENUM ('DRAFT_EMAIL', 'LINKEDIN_CONNECT', 'TASK', 'WAIT');

-- CreateEnum
CREATE TYPE "SalesEnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'UNSUBSCRIBED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "SalesDraftChannel" AS ENUM ('EMAIL', 'LINKEDIN');

-- CreateEnum
CREATE TYPE "SalesDraftStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'SENT', 'FAILED', 'CANCELED');

-- DropIndex
DROP INDEX "embedding_cache_vector_hnsw";

-- DropIndex
DROP INDEX "knowledge_chunks_embedding_hnsw";

-- DropIndex
DROP INDEX "memory_records_embedding_hnsw";

-- CreateTable
CREATE TABLE "sales_companies" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "geography" TEXT,
    "businessModel" TEXT,
    "productsServices" TEXT,
    "targetMarket" TEXT,
    "techStack" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "socialLinks" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "researchStatus" "SalesResearchStatus" NOT NULL DEFAULT 'NONE',
    "lastResearchedAt" TIMESTAMP(3),
    "lastResearchRunId" TEXT,
    "icpFit" INTEGER,
    "fitScore" INTEGER NOT NULL DEFAULT 0,
    "priorityScore" INTEGER NOT NULL DEFAULT 0,
    "scoreReasons" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "segment" TEXT,
    "territory" TEXT,
    "ownerId" TEXT,
    "custom" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sales_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_contacts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "linkedinUrl" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "status" "SalesContactStatus" NOT NULL DEFAULT 'NEW',
    "source" "SalesContactSource" NOT NULL DEFAULT 'MANUAL',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ownerId" TEXT,
    "lastTouchedAt" TIMESTAMP(3),
    "custom" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sales_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_pipelines" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_pipeline_stages" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "winProbability" INTEGER NOT NULL DEFAULT 50,

    CONSTRAINT "sales_pipeline_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_deals" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "primaryContactId" TEXT,
    "pipelineId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "valueUsd" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "SalesDealStatus" NOT NULL DEFAULT 'OPEN',
    "expectedCloseAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "ownerId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "custom" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sales_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_activities" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "type" "SalesActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_campaigns" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "status" "SalesCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "dailyCap" INTEGER NOT NULL DEFAULT 20,
    "sendWindow" JSONB NOT NULL DEFAULT '{}',
    "knowledgeContext" TEXT,
    "createdById" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sales_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_campaign_steps" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "SalesCampaignStepKind" NOT NULL,
    "subject" TEXT,
    "bodyTemplate" TEXT,
    "delayValue" INTEGER NOT NULL DEFAULT 0,
    "delayUnit" TEXT NOT NULL DEFAULT 'DAYS',
    "condition" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_campaign_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_campaign_enrollments" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "companyId" TEXT,
    "status" "SalesEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "exitReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_campaign_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_drafts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "companyId" TEXT,
    "campaignEnrollmentId" TEXT,
    "channel" "SalesDraftChannel" NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "SalesDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "threadId" TEXT,
    "providerMessageId" TEXT,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "approvalId" TEXT,
    "agentRunId" TEXT,
    "personalization" JSONB NOT NULL DEFAULT '{}',
    "rejectionNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sales_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_saved_searches" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_companies_workspaceId_deletedAt_createdAt_idx" ON "sales_companies"("workspaceId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "sales_companies_workspaceId_priorityScore_idx" ON "sales_companies"("workspaceId", "priorityScore");

-- CreateIndex
CREATE UNIQUE INDEX "sales_companies_workspaceId_domain_key" ON "sales_companies"("workspaceId", "domain");

-- CreateIndex
CREATE INDEX "sales_contacts_workspaceId_companyId_idx" ON "sales_contacts"("workspaceId", "companyId");

-- CreateIndex
CREATE INDEX "sales_contacts_workspaceId_status_idx" ON "sales_contacts"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_contacts_workspaceId_email_key" ON "sales_contacts"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "sales_pipelines_workspaceId_name_key" ON "sales_pipelines"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "sales_pipeline_stages_pipelineId_order_idx" ON "sales_pipeline_stages"("pipelineId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "sales_pipeline_stages_pipelineId_name_key" ON "sales_pipeline_stages"("pipelineId", "name");

-- CreateIndex
CREATE INDEX "sales_deals_workspaceId_status_idx" ON "sales_deals"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "sales_deals_pipelineId_stageId_idx" ON "sales_deals"("pipelineId", "stageId");

-- CreateIndex
CREATE INDEX "sales_deals_companyId_idx" ON "sales_deals"("companyId");

-- CreateIndex
CREATE INDEX "sales_activities_workspaceId_dueAt_idx" ON "sales_activities"("workspaceId", "dueAt");

-- CreateIndex
CREATE INDEX "sales_activities_companyId_createdAt_idx" ON "sales_activities"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_activities_dealId_createdAt_idx" ON "sales_activities"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_campaigns_workspaceId_status_idx" ON "sales_campaigns"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_campaigns_workspaceId_name_key" ON "sales_campaigns"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "sales_campaign_steps_campaignId_order_idx" ON "sales_campaign_steps"("campaignId", "order");

-- CreateIndex
CREATE INDEX "sales_campaign_enrollments_campaignId_status_nextRunAt_idx" ON "sales_campaign_enrollments"("campaignId", "status", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "sales_campaign_enrollments_campaignId_contactId_key" ON "sales_campaign_enrollments"("campaignId", "contactId");

-- CreateIndex
CREATE INDEX "sales_drafts_workspaceId_status_createdAt_idx" ON "sales_drafts"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "sales_drafts_contactId_idx" ON "sales_drafts"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_saved_searches_workspaceId_name_key" ON "sales_saved_searches"("workspaceId", "name");

-- AddForeignKey
ALTER TABLE "sales_companies" ADD CONSTRAINT "sales_companies_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_companies" ADD CONSTRAINT "sales_companies_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_companies" ADD CONSTRAINT "sales_companies_lastResearchRunId_fkey" FOREIGN KEY ("lastResearchRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_contacts" ADD CONSTRAINT "sales_contacts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_contacts" ADD CONSTRAINT "sales_contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "sales_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_contacts" ADD CONSTRAINT "sales_contacts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_pipelines" ADD CONSTRAINT "sales_pipelines_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_pipeline_stages" ADD CONSTRAINT "sales_pipeline_stages_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "sales_pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_deals" ADD CONSTRAINT "sales_deals_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_deals" ADD CONSTRAINT "sales_deals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "sales_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_deals" ADD CONSTRAINT "sales_deals_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "sales_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_deals" ADD CONSTRAINT "sales_deals_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "sales_pipelines"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_deals" ADD CONSTRAINT "sales_deals_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "sales_pipeline_stages"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_deals" ADD CONSTRAINT "sales_deals_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "sales_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "sales_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "sales_deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_campaigns" ADD CONSTRAINT "sales_campaigns_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_campaigns" ADD CONSTRAINT "sales_campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_campaign_steps" ADD CONSTRAINT "sales_campaign_steps_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "sales_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_campaign_enrollments" ADD CONSTRAINT "sales_campaign_enrollments_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "sales_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_campaign_enrollments" ADD CONSTRAINT "sales_campaign_enrollments_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "sales_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_campaign_enrollments" ADD CONSTRAINT "sales_campaign_enrollments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "sales_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_drafts" ADD CONSTRAINT "sales_drafts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_drafts" ADD CONSTRAINT "sales_drafts_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "sales_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_drafts" ADD CONSTRAINT "sales_drafts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "sales_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_drafts" ADD CONSTRAINT "sales_drafts_campaignEnrollmentId_fkey" FOREIGN KEY ("campaignEnrollmentId") REFERENCES "sales_campaign_enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_drafts" ADD CONSTRAINT "sales_drafts_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_drafts" ADD CONSTRAINT "sales_drafts_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_drafts" ADD CONSTRAINT "sales_drafts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_saved_searches" ADD CONSTRAINT "sales_saved_searches_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_saved_searches" ADD CONSTRAINT "sales_saved_searches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
