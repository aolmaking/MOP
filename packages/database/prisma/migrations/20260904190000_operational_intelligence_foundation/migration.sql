-- AlterTable: add completedAt to tasks
ALTER TABLE "tasks" ADD COLUMN "completedAt" TIMESTAMP(3);
CREATE INDEX "tasks_tenantId_status_completedAt_idx" ON "tasks"("tenantId", "status", "completedAt");

-- Backfill completedAt for existing DONE tasks
UPDATE "tasks"
SET "completedAt" = "updatedAt"
WHERE "status" = 'DONE' AND "completedAt" IS NULL;

-- AlterTable: add workOrderId and branchId to operation_events
ALTER TABLE "operation_events" ADD COLUMN "workOrderId" TEXT;
ALTER TABLE "operation_events" ADD COLUMN "branchId" TEXT;
CREATE INDEX "operation_events_tenantId_eventKey_createdAt_idx" ON "operation_events"("tenantId", "eventKey", "createdAt");
CREATE INDEX "operation_events_tenantId_branchId_eventKey_createdAt_idx" ON "operation_events"("tenantId", "branchId", "eventKey", "createdAt");
CREATE INDEX "operation_events_tenantId_workOrderId_createdAt_idx" ON "operation_events"("tenantId", "workOrderId", "createdAt");

-- Backfill workOrderId on operation_events from payload
UPDATE "operation_events"
SET "workOrderId" = ("payload"->>'workOrderId')
WHERE "workOrderId" IS NULL AND "payload"->>'workOrderId' IS NOT NULL;

-- Backfill branchId on operation_events by joining work_orders
UPDATE "operation_events" oe
SET "branchId" = w."branchId"
FROM "work_orders" w
WHERE oe."workOrderId" = w."id" AND oe."branchId" IS NULL;

-- Indexes on work_orders for date and branch volume queries
CREATE INDEX "work_orders_tenantId_createdAt_idx" ON "work_orders"("tenantId", "createdAt");
CREATE INDEX "work_orders_tenantId_closedAt_idx" ON "work_orders"("tenantId", "closedAt");
CREATE INDEX "work_orders_tenantId_branchId_createdAt_idx" ON "work_orders"("tenantId", "branchId", "createdAt");
CREATE INDEX "work_orders_tenantId_branchId_closedAt_idx" ON "work_orders"("tenantId", "branchId", "closedAt");
