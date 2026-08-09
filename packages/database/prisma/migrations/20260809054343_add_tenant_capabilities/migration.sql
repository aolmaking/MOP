-- CreateEnum
CREATE TYPE "TenantCapabilityStatus" AS ENUM ('ENABLED', 'DISABLED', 'READ_ONLY', 'EXTERNAL', 'LOCKED');

-- CreateEnum
CREATE TYPE "CapabilitySource" AS ENUM ('PLATFORM', 'PLAN', 'OWNER_CONFIGURATION', 'MIGRATION', 'SYSTEM');

-- CreateTable
CREATE TABLE "tenant_capabilities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "status" "TenantCapabilityStatus" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "source" "CapabilitySource" NOT NULL,
    "lockedByPlatform" BOOLEAN NOT NULL DEFAULT false,
    "configuredBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_capabilities_tenantId_effectiveTo_idx" ON "tenant_capabilities"("tenantId", "effectiveTo");

-- CreateIndex
CREATE INDEX "tenant_capabilities_tenantId_capabilityKey_effectiveFrom_idx" ON "tenant_capabilities"("tenantId", "capabilityKey", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "tenant_capabilities" ADD CONSTRAINT "tenant_capabilities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
