-- RETURN_PENDING is the one bucket meant to be opened and then reversed --
-- a return requested, then accepted or rejected -- rather than a standing,
-- one-directional fact the way ISSUE or RETURN_TO_STOCK are. A negative
-- RETURN_PENDING movement is "this pending return has now been resolved",
-- not a correction, so it needs the same exemption ADJUSTMENT already has
-- from movement_quantity_sign (see 20260809203000_stock_never_negative).
--
-- The application-level check in StockService.record() was updated
-- alongside this migration; the two must never drift, per this project's
-- own stated reason for having both -- service code is a promise, a
-- constraint is a fact.
ALTER TABLE "stock_movements"
  DROP CONSTRAINT "movement_quantity_sign",
  ADD CONSTRAINT "movement_quantity_sign" CHECK (
    "quantity" > 0 OR "type" = 'ADJUSTMENT' OR "type" = 'RETURN_PENDING'
  );
