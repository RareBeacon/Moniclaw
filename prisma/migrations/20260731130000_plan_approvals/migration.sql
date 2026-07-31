-- Plan-derived approvals: link Approval to Workspace; make runId optional.
-- Additive + backwards compatible (existing run-linked rows untouched).
BEGIN;




-- AlterTable
ALTER TABLE "approvals" ADD COLUMN     "workspaceId" TEXT,
ALTER COLUMN "runId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "approvals_workspaceId_status_createdAt_idx" ON "approvals"("workspaceId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
