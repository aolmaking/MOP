-- Hand-written, not `prisma migrate dev` generated as-is: adding a
-- required unique column to `tenants` (which already has rows) needs the
-- classic add-nullable -> backfill -> constrain sequence, which `prisma
-- migrate dev` correctly refuses to generate unattended.

-- AlterTable: accounts (both new columns nullable, no backfill needed)
ALTER TABLE "accounts" ADD COLUMN "inviteTokenHash" TEXT;
ALTER TABLE "accounts" ADD COLUMN "inviteTokenExpiresAt" TIMESTAMP(3);

-- AlterTable: tenants -- add nullable, backfill, then constrain
ALTER TABLE "tenants" ADD COLUMN "nameNormalized" TEXT;
UPDATE "tenants" SET "nameNormalized" = lower("name") WHERE "nameNormalized" IS NULL;
ALTER TABLE "tenants" ALTER COLUMN "nameNormalized" SET NOT NULL;
CREATE UNIQUE INDEX "tenants_nameNormalized_key" ON "tenants"("nameNormalized");
