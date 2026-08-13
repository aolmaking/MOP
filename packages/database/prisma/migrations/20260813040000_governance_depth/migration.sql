-- Phase 19: PartRequest.approvedById (19.A separation of duties),
-- RefundRequest.reasonCategory (19.C), StaffUser restriction fields
-- (19.D), WorkOrderDispute (19.B). See docs/phases/PHASE_19.md.

-- CreateEnum
CREATE TYPE "RefundReasonCategory" AS ENUM ('ROUTINE', 'DISPUTE_REMEDIATION');

-- CreateEnum
CREATE TYPE "StaffRestrictionStatus" AS ENUM ('NONE', 'RESTRICTED_PENDING_INVESTIGATION');

-- AlterTable
ALTER TABLE "part_requests" ADD COLUMN     "approvedById" TEXT;

-- AlterTable
ALTER TABLE "refund_requests" ADD COLUMN     "reasonCategory" "RefundReasonCategory" NOT NULL DEFAULT 'ROUTINE';

-- AlterTable
ALTER TABLE "staff_users" ADD COLUMN     "restrictedAt" TIMESTAMP(3),
ADD COLUMN     "restrictedReason" TEXT,
ADD COLUMN     "restrictionStatus" "StaffRestrictionStatus" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "work_order_disputes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,

    CONSTRAINT "work_order_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_order_disputes_tenantId_workOrderId_idx" ON "work_order_disputes"("tenantId", "workOrderId");

-- CreateIndex
CREATE INDEX "work_order_disputes_tenantId_status_idx" ON "work_order_disputes"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "work_order_disputes" ADD CONSTRAINT "work_order_disputes_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

