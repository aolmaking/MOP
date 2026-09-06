-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "branchId" TEXT;

-- CreateIndex
CREATE INDEX "invoices_tenantId_branchId_issuedAt_idx" ON "invoices"("tenantId", "branchId", "issuedAt");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill branchId from work_orders
UPDATE "invoices" i
SET "branchId" = w."branchId"
FROM "work_orders" w
WHERE w.id = i."workOrderId" AND i."branchId" IS NULL;
