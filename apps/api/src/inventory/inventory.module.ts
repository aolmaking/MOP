import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OperationEventsModule } from "../operations/operation-events.module";
import { StockService } from "./stock.service";
import { PartRequestService } from "./part-request.service";

/**
 * Inventory.
 *
 * `StockService` is exported as the ONLY way a balance changes, and
 * `PartRequestService` as the only way a request's status changes -- the
 * same shape as OperationsModule exporting WorkOrderLifecycleService as
 * the sole writer of work-order status.
 */
@Module({
  imports: [DatabaseModule, CapabilitiesModule, OperationEventsModule],
  providers: [StockService, PartRequestService],
  exports: [StockService, PartRequestService],
})
export class InventoryModule {}
