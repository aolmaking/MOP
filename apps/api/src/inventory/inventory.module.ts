import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { StockService } from "./stock.service";

/**
 * Inventory. `StockService` is exported as the ONLY way a balance
 * changes -- the same shape as OperationsModule exporting
 * WorkOrderLifecycleService as the only writer of work-order status.
 */
@Module({
  imports: [DatabaseModule],
  providers: [StockService],
  exports: [StockService],
})
export class InventoryModule {}
