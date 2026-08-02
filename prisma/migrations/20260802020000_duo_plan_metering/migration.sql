-- PG cannot use a freshly-added enum value inside the same transaction that
-- created it — the ALTER commits alone, then the backfill runs separately.
BEGIN;
ALTER TYPE "WorkspacePlan" ADD VALUE IF NOT EXISTS 'DUO';
COMMIT;

BEGIN;
-- Private launch: the cohort (founders + first 20 seats) lands on Duo.
ALTER TABLE "workspaces" ALTER COLUMN "plan" SET DEFAULT 'DUO';
UPDATE "workspaces" SET "plan" = 'DUO';
COMMIT;
