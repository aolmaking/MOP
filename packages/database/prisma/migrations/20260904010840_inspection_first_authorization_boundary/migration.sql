-- AlterTable
ALTER TABLE "customer_decision_items" ADD COLUMN     "faultId" TEXT,
ADD COLUMN     "serviceKey" TEXT;

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "actualMinutes" INTEGER,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "part_requests" ADD COLUMN     "inspectionId" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "customer_decision_items_faultId_idx" ON "customer_decision_items"("faultId");

-- AddForeignKey
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_decision_items" ADD CONSTRAINT "customer_decision_items_faultId_fkey" FOREIGN KEY ("faultId") REFERENCES "faults"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "inventory_item_attribute_values_tenantId_attributeId_valueId_id" RENAME TO "inventory_item_attribute_values_tenantId_attributeId_valueI_idx";

-- Backfill: every inspection that already exists was written whole, at
-- completion, by TechnicianWorkService.recordInspection -- there was no
-- in-progress state to be in. `createdAt` is therefore the true moment
-- both for when it started and when it finished, and leaving `startedAt`
-- on its CURRENT_TIMESTAMP default would stamp historical rows with the
-- time of this migration: a fabricated timestamp in the exact ordering
-- check these columns exist to make honest.
UPDATE "inspections"
SET "startedAt" = "createdAt",
    "completedAt" = "createdAt"
WHERE "completedAt" IS NULL;
