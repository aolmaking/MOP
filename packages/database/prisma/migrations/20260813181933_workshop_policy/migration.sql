-- CreateEnum
CREATE TYPE "PolicySource" AS ENUM ('PLATFORM', 'DEFAULT', 'MIGRATION', 'SYSTEM');

-- CreateTable
CREATE TABLE "workshop_policies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "policyKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "source" "PolicySource" NOT NULL,
    "configuredBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workshop_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workshop_policies_tenantId_effectiveTo_idx" ON "workshop_policies"("tenantId", "effectiveTo");

-- CreateIndex
CREATE INDEX "workshop_policies_tenantId_policyKey_effectiveFrom_idx" ON "workshop_policies"("tenantId", "policyKey", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "workshop_policies" ADD CONSTRAINT "workshop_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
