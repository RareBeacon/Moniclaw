BEGIN;

-- Multi-key rotation: rest-window marker on provider configs
ALTER TABLE "ai_provider_configs" ADD COLUMN "rateLimitedUntil" TIMESTAMP(3);

-- In-app operational notifications
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dedupKey" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_workspaceId_readAt_createdAt_idx"
    ON "notifications"("workspaceId", "readAt", "createdAt");

ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
