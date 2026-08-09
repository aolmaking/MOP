-- Stock can never go negative, enforced by the database rather than only
-- by service code.
--
-- StockService already refuses a movement that would take a bucket below
-- zero, and that check is the one that produces a good error message. This
-- exists because service code is a promise and a constraint is a fact: a
-- seed script, a data fix, a future service written by someone who has not
-- read PHASE_7.md, or a bug in the service itself must all be unable to
-- write a negative quantity of a physical object.
--
-- Referenced by the schema comment above WarehouseStockBalance, which has
-- said "added in a follow-up migration" since Phase 2. This is it.

ALTER TABLE "warehouse_stock_balances"
  ADD CONSTRAINT "stock_available_not_negative" CHECK ("availableQty" >= 0),
  ADD CONSTRAINT "stock_reserved_not_negative" CHECK ("reservedQty" >= 0),
  ADD CONSTRAINT "stock_issued_not_negative" CHECK ("issuedQty" >= 0),
  ADD CONSTRAINT "stock_return_pending_not_negative" CHECK ("returnPendingQty" >= 0),
  ADD CONSTRAINT "stock_damaged_not_negative" CHECK ("damagedQty" >= 0);

-- A movement of zero changes nothing and is therefore a bug, not a record.
-- ADJUSTMENT is the only type allowed to be negative: it is the correction
-- mechanism, and SCENARIOS.md 3.4 requires corrections to be explicit and
-- audited rather than silent edits.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "movement_quantity_not_zero" CHECK ("quantity" <> 0),
  ADD CONSTRAINT "movement_quantity_sign" CHECK (
    "quantity" > 0 OR "type" = 'ADJUSTMENT'
  ),
  ADD CONSTRAINT "movement_after_not_negative" CHECK ("afterQty" >= 0);
