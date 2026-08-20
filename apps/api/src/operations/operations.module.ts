import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OperationEventsModule } from "./operation-events.module";
import { GateEvaluatorService } from "./gate-evaluator.service";
import { WorkOrderLifecycleService } from "./work-order-lifecycle.service";
import { IntakeService } from "./intake.service";
import { TechnicianWorkService } from "./technician-work.service";
import { WorkOrderDossierService } from "./work-order-dossier.service";
import { ChargeableItemsService } from "./chargeable-items.service";

/**
 * The operations spine: the work-order lifecycle and the gates that guard
 * it. WorkOrderLifecycleService is the only exported way to change a work
 * order's status, which is what keeps transitions in the capability graph
 * rather than scattered through the services that happen to need them.
 */
@Module({
  imports: [DatabaseModule, CapabilitiesModule, OperationEventsModule],
  providers: [
    GateEvaluatorService,
    WorkOrderLifecycleService,
    IntakeService,
    TechnicianWorkService,
    WorkOrderDossierService,
    ChargeableItemsService,
  ],
  exports: [
    WorkOrderLifecycleService,
    GateEvaluatorService,
    IntakeService,
    TechnicianWorkService,
    WorkOrderDossierService,
    ChargeableItemsService,
  ],
})
export class OperationsModule {}
