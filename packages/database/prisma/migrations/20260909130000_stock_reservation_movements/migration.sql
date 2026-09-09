-- Reservations become real, replayable movements.
--
-- `WarehouseStockBalance.reservedQty` has existed since init, and so has
-- `StockBucket.reservedQty` in StockService -- but no StockMovementType ever
-- moved that bucket. The only thing writing it was a hand-rolled
-- `warehouseStockBalance.update` inside OperatorService.approveRepair, which
-- StockService's own header forbids in as many words ("nothing else in the
-- codebase is permitted to update WarehouseStockBalance"). The consequence was
-- narrow and total: `replay()` could reproduce every bucket except this one, so
-- the number the store sees for promised stock was the one number in inventory
-- with no ledger behind it.
ALTER TYPE "StockMovementType" ADD VALUE 'RESERVE';
ALTER TYPE "StockMovementType" ADD VALUE 'RELEASE_RESERVATION';
