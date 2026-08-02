CREATE TYPE "AccessStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED');

ALTER TABLE "users"
  ADD COLUMN "accessStatus" "AccessStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "accessUntil" TIMESTAMP(3),
  ADD COLUMN "accessNote" TEXT;

-- The existing private-launch cohort (including the two founder seats) retains
-- uninterrupted access. New registrations use the schema default: PENDING.
UPDATE "users" SET "accessStatus" = 'ACTIVE', "accessUntil" = NULL;

CREATE INDEX "users_accessStatus_accessUntil_idx" ON "users"("accessStatus", "accessUntil");
