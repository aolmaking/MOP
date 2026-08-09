-- Settles SCENARIOS.md 3.5, open since Phase 2: "3 requested, 2 issued,
-- 1 issued later" could not be expressed, because one PartRequest could
-- only ever have one IssuedItem.
--
-- One request, many issues. The request is what was ASKED FOR; the issue
-- rows are what was actually handed over, and there can be several. The
-- rejected alternative -- splitting the request in two -- would invent a
-- record the technician never created and would split the charge on the
-- customer's invoice into two lines for one part.
--
-- Fulfilment becomes derived, never stored: requested is on the request,
-- issued is SUM(issued_items.quantity). Nothing may cache that sum.
--
-- Safe on a populated database: dropping a unique index removes a
-- restriction and touches no rows. The replacement index exists because
-- summing issues per request is now the hot path.
--
-- Reasoning in full: docs/phases/PHASE_7.md section 2.

-- DropIndex
DROP INDEX "issued_items_partRequestId_key";

-- CreateIndex
CREATE INDEX "issued_items_partRequestId_idx" ON "issued_items"("partRequestId");
