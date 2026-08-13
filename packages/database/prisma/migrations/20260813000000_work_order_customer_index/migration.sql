-- Phase 14: WorkOrder had no index on customerId despite Phase 11's
-- Customer Portal filtering by (tenantId, customerId, status) on every
-- page load (my assets, current service, invoices) -- a gap in the
-- original Phase 11 pass, closed here.

-- CreateIndex
CREATE INDEX "work_orders_tenantId_customerId_idx" ON "work_orders"("tenantId", "customerId");
