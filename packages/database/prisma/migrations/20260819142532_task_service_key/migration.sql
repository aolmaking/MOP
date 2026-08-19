-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "serviceKey" TEXT;

-- CreateIndex
CREATE INDEX "tasks_tenantId_serviceKey_idx" ON "tasks"("tenantId", "serviceKey");
