-- Phase 16: promised time + expected duration on WorkOrder (16.A/16.E),
-- and a generic Attachment table (16.H). See docs/phases/PHASE_16.md.

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "expectedDurationMinutes" INTEGER,
ADD COLUMN     "promisedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_tenantId_targetType_targetId_idx" ON "attachments"("tenantId", "targetType", "targetId");

