BEGIN;

-- CreateEnum
CREATE TYPE "EmailConnectionStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailProviderKind" AS ENUM ('SMTP', 'AMAZON_SES');

-- AlterEnum
ALTER TYPE "SalesDraftStatus" ADD VALUE 'SENDING';

-- AlterTable
ALTER TABLE "sales_drafts" ADD COLUMN     "emailConnectionId" TEXT,
ADD COLUMN     "sendAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sendError" TEXT;

-- CreateTable
CREATE TABLE "email_connections" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" "EmailProviderKind" NOT NULL DEFAULT 'SMTP',
    "label" TEXT NOT NULL,
    "senderName" TEXT,
    "senderEmail" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUsername" TEXT,
    "passwordEnc" TEXT,
    "region" TEXT,
    "status" "EmailConnectionStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_connections_workspaceId_isDefault_idx" ON "email_connections"("workspaceId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "email_connections_workspaceId_senderEmail_key" ON "email_connections"("workspaceId", "senderEmail");

-- CreateIndex
CREATE INDEX "sales_drafts_workspaceId_status_scheduledAt_idx" ON "sales_drafts"("workspaceId", "status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "sales_drafts" ADD CONSTRAINT "sales_drafts_emailConnectionId_fkey" FOREIGN KEY ("emailConnectionId") REFERENCES "email_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_connections" ADD CONSTRAINT "email_connections_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
