import { Module } from "@nestjs/common";
import { AuditEventService } from "./services/audit-event.service";
import { BranchWarehouseAccessService } from "./services/branch-warehouse-access.service";
import { CustomerDecisionDomainService } from "./services/customer-decision-domain.service";
import { CustomerSafeTimelineService } from "./services/customer-safe-timeline.service";
import { InventoryLedgerService } from "./services/inventory-ledger.service";
import { LifecycleTransitionService } from "./services/lifecycle-transition.service";
import { PartLifecycleService } from "./services/part-lifecycle.service";
import { ReturnLifecycleService } from "./services/return-lifecycle.service";
import { TechnicianFinishGateService } from "./services/technician-finish-gate.service";
import { WarehouseResolutionService } from "./services/warehouse-resolution.service";
import { WorkOrderStatusService } from "./services/work-order-status.service";

const domainServices = [
  AuditEventService,
  BranchWarehouseAccessService,
  CustomerDecisionDomainService,
  CustomerSafeTimelineService,
  InventoryLedgerService,
  LifecycleTransitionService,
  PartLifecycleService,
  ReturnLifecycleService,
  TechnicianFinishGateService,
  WarehouseResolutionService,
  WorkOrderStatusService
];

@Module({
  providers: domainServices,
  exports: domainServices
})
export class DomainServicesModule {}
