import { Module } from "@nestjs/common";
import { PoliciesModule } from "../../control/policies/policies.module";
import { DatabaseModule } from "../../runtime/database/database.module";
import { AuthModule } from "../../identity/auth/auth.module";
import { AccessModule } from "../../identity/access/access.module";
import { CapabilitiesModule } from "../../control/capabilities/capabilities.module";
import { OperationEventsModule } from "../operations/operation-events.module";
import { OperationsModule } from "../operations/operations.module";
import { AuditModule } from "../../audit/audit.module";
import { InventoryController } from "./inventory.controller";
import { InventoryViewService } from "./inventory-view.service";
import { StockService } from "./stock.service";
import { PartRequestService } from "./part-request.service";
import { InventoryHomeService } from "./inventory-home.service";
import { CatalogService } from "./catalog.service";
import { InventoryReportsService } from "./inventory-reports.service";
import { WarehouseService } from "./warehouse.service";
import { CatalogConfigService } from "./catalog-config.service";
import { CatalogBrowseService } from "./catalog-browse.service";
import { WorkshopCatalogProvisioningService } from "./master-catalog/workshop-catalog-provisioning.service";
import { SmartSuggestionEngine } from "./master-catalog/smart-suggestion.engine";
import { MasterCatalogMigrationService } from "./master-catalog/master-catalog-migration.service";
import { VehicleFitmentService } from "./fitment/vehicle-fitment.service";

/**
 * Inventory.
 *
 * `StockService` is exported as the ONLY way a balance changes, and
 * `PartRequestService` as the only way a request's status changes -- the
 * same shape as OperationsModule exporting WorkOrderLifecycleService as
 * the sole writer of work-order status.
 */
@Module({
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
    CatalogConfigService,
    CatalogBrowseService,
    InventoryReportsService,
    WarehouseService,
    WorkshopCatalogProvisioningService,
    SmartSuggestionEngine,
    MasterCatalogMigrationService,
    VehicleFitmentService,
  ],
  exports: [
    StockService,
    PartRequestService,
    InventoryReportsService,
    CatalogService,
    CatalogBrowseService,
    WorkshopCatalogProvisioningService,
    SmartSuggestionEngine,
    MasterCatalogMigrationService,
    VehicleFitmentService,
  ],
})
export class InventoryModule {}
