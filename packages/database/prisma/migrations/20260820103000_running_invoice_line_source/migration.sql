-- Where a running-invoice line came from in Operations.
--
-- Finance needs to fold an operational fact -- a part left the store for
-- this job -- into the running total exactly once, without reaching into
-- Inventory's tables to ask what it has already billed. The unique index
-- is what makes that reconciliation idempotent rather than additive.
--
-- Nullable because most lines are typed in by hand and have no
-- operational source at all. Postgres treats NULLs as distinct in a
-- unique index, so hand-entered lines are unconstrained by design.

ALTER TABLE "running_invoice_lines" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "running_invoice_lines" ADD COLUMN "sourceId" TEXT;

CREATE UNIQUE INDEX "running_invoice_lines_runningInvoiceId_sourceType_sourceId_key"
  ON "running_invoice_lines"("runningInvoiceId", "sourceType", "sourceId");
