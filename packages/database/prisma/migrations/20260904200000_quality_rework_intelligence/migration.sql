-- CreateEnum
CREATE TYPE "QcFailureReason" AS ENUM ('WORKMANSHIP', 'INCOMPLETE_REPAIR', 'INCORRECT_DIAGNOSIS', 'DEFECTIVE_PART', 'SAFETY_ISSUE', 'DOCUMENTATION', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskReworkReason" AS ENUM ('WORKMANSHIP', 'INCOMPLETE_WORK', 'INCORRECT_PROCEDURE', 'DEFECTIVE_PART', 'FAILED_INSPECTION', 'CUSTOMER_COMPLAINT', 'OTHER');

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN "qcFailureReason" "QcFailureReason";

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "originalTaskId" TEXT;
ALTER TABLE "tasks" ADD COLUMN "reworkReason" "TaskReworkReason";
ALTER TABLE "tasks" ADD COLUMN "reworkNote" TEXT;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_originalTaskId_fkey" FOREIGN KEY ("originalTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "tasks_originalTaskId_idx" ON "tasks"("originalTaskId");
