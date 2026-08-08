-- CreateEnum
CREATE TYPE "PartProvenance" AS ENUM ('INVENTORY', 'EXTERNAL_PURCHASE', 'CUSTOMER_SUPPLIED');

-- AlterTable
ALTER TABLE "finance_configuration" ADD COLUMN     "externalBillingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "externalInvoiceReference" TEXT;

-- CreateTable
CREATE TABLE "work_order_part_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "taskId" TEXT,
    "provenance" "PartProvenance" NOT NULL,
    "inventoryItemId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sellingPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cost" DECIMAL(12,2),
    "workshopWarranted" BOOLEAN NOT NULL DEFAULT true,
    "partRequestId" TEXT,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_part_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_order_part_lines_partRequestId_key" ON "work_order_part_lines"("partRequestId");

-- CreateIndex
CREATE INDEX "work_order_part_lines_workOrderId_idx" ON "work_order_part_lines"("workOrderId");

-- CreateIndex
CREATE INDEX "work_order_part_lines_tenantId_provenance_idx" ON "work_order_part_lines"("tenantId", "provenance");

-- AddForeignKey
ALTER TABLE "work_order_part_lines" ADD CONSTRAINT "work_order_part_lines_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_part_lines" ADD CONSTRAINT "work_order_part_lines_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_part_lines" ADD CONSTRAINT "work_order_part_lines_partRequestId_fkey" FOREIGN KEY ("partRequestId") REFERENCES "part_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
