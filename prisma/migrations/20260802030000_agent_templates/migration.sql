BEGIN;

ALTER TABLE "agents" ADD COLUMN "templateSlug" TEXT;

CREATE TABLE "agent_templates" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "workerType" TEXT NOT NULL DEFAULT 'general',
    "icon" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "publisher" TEXT NOT NULL DEFAULT 'MoniClaw',
    "official" BOOLEAN NOT NULL DEFAULT true,
    "manifest" JSONB NOT NULL,
    "installs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_templates_slug_key" ON "agent_templates"("slug");

COMMIT;
