-- Phase 18: TenantStakeholder (18.A), TenantGroup/TenantGroupMember
-- (18.E, summary-only), and Tenant.archivedAt/retentionUntil (18.D's
-- two-clocks decision). See docs/phases/PHASE_18.md.

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "retentionUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "tenant_stakeholders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "permissions" TEXT[],
    "branchScope" TEXT[],
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "tenant_stakeholders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_group_members" (
    "id" TEXT NOT NULL,
    "tenantGroupId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_stakeholders_tenantId_revokedAt_idx" ON "tenant_stakeholders"("tenantId", "revokedAt");

-- CreateIndex
CREATE INDEX "tenant_stakeholders_accountId_idx" ON "tenant_stakeholders"("accountId");

-- CreateIndex
CREATE INDEX "tenant_group_members_tenantId_idx" ON "tenant_group_members"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_group_members_tenantGroupId_tenantId_key" ON "tenant_group_members"("tenantGroupId", "tenantId");

-- AddForeignKey
ALTER TABLE "tenant_stakeholders" ADD CONSTRAINT "tenant_stakeholders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_stakeholders" ADD CONSTRAINT "tenant_stakeholders_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_group_members" ADD CONSTRAINT "tenant_group_members_tenantGroupId_fkey" FOREIGN KEY ("tenantGroupId") REFERENCES "tenant_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_group_members" ADD CONSTRAINT "tenant_group_members_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

