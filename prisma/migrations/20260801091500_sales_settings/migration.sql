BEGIN;

-- CreateTable
CREATE TABLE "sales_workspace_settings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "icpProfile" JSONB NOT NULL DEFAULT '{}',
    "defaultSendWindow" JSONB NOT NULL DEFAULT '{}',
    "senderName" TEXT,
    "senderTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_workspace_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_workspace_settings_workspaceId_key" ON "sales_workspace_settings"("workspaceId");

-- AddForeignKey
ALTER TABLE "sales_workspace_settings" ADD CONSTRAINT "sales_workspace_settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
