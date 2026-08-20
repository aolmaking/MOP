import { Module } from "@nestjs/common";
import { PoliciesModule } from "../policies/policies.module";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AccessModule } from "../access/access.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OperationEventsModule } from "../operations/operation-events.module";
import { OperationsModule } from "../operations/operations.module";
import { AuditModule } from "../audit/audit.module";
import { InventoryController } from "./inventory.controller";
import { InventoryViewService } from "./inventory-view.service";
import { StockService } from "./stock.service";
import { PartRequestService } from "./part-request.service";
import { InventoryHomeService } from "./inventory-home.service";
import { CatalogService } from "./catalog.service";
import { InventoryReportsService } from "./inventory-reports.service";
import { WarehouseService } from "./warehouse.service";

/**
 * Inventory.
 *
 * `StockService` is exported as the ONLY way a balance changes, and
 * `PartRequestService` as the only way a request's status changes -- the
 * same shape as OperationsModule exporting WorkOrderLifecycleService as
 * the sole writer of work-order status.
 */
@Module({
  // PoliciesModule: PartRequestService.approve reads P-07's
  // separation-of-duties rule, which is the policy Phase 19.A was
  // reverted for want of.
  //
  // OperationsModule: issuing a part moves the WORK ORDER too, and
  // WorkOrderLifecycleService is the only thing allowed to write a
  // work-order status.
  imports: [
    DatabaseModule,
    AuthModule,
    AccessModule,
    CapabilitiesModule,
    OperationEventsModule,
    OperationsModule,
    AuditModule,
    PoliciesModule,
  ],
  controllers: [InventoryController],
  providers: [
    StockService,
    PartRequestService,
    InventoryViewService,
    InventoryHomeService,
    CatalogService,
    InventoryReportsService,
    WarehouseService,
  ],
  exports: [StockService, PartRequestService, InventoryReportsService, CatalogService],
})
export class InventoryModule {}
