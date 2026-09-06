-- CreateTable
CREATE TABLE "workshop_specializations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "specializationKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BUILT_IN',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workshop_specializations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workshop_specializations_tenantId_specializationKey_key" ON "workshop_specializations"("tenantId", "specializationKey");

-- CreateIndex
CREATE INDEX "workshop_specializations_tenantId_idx" ON "workshop_specializations"("tenantId");

-- AddForeignKey
ALTER TABLE "workshop_specializations" ADD CONSTRAINT "workshop_specializations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
