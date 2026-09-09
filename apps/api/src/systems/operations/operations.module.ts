import { Module } from "@nestjs/common";
import { PoliciesModule } from "../../control/policies/policies.module";
import { StockModule } from "../inventory/stock.module";
import { FormsModule } from "../forms/forms.module";
import { DatabaseModule } from "../../runtime/database/database.module";
import { CapabilitiesModule } from "../../control/capabilities/capabilities.module";
import { OperationEventsModule } from "./operation-events.module";
import { GateEvaluatorService } from "./gate-evaluator.service";
import { WorkOrderLifecycleService } from "./work-order-lifecycle.service";
import { IntakeService } from "./intake.service";
import { TechnicianWorkService } from "./technician-work.service";
import { WorkOrderDossierService } from "./work-order-dossier.service";
import { ChargeableItemsService } from "./chargeable-items.service";
import { WorkflowJourneyService } from "./workflow-journey.service";
import { JourneyFactsService } from "./journey-facts.service";
import { JourneyEventsService } from "./journey-events.service";

import { InspectionRepository } from "./inspection/inspection.repository";
import { RuleEvaluatorService } from "./inspection/recommendations/rule-evaluator.service";

/**
 * The operations spine: the work-order lifecycle and the gates that guard
 * it. WorkOrderLifecycleService is the only exported way to change a work
 * order's status, which is what keeps transitions in the capability graph
 * rather than scattered through the services that happen to need them.
 */
@Module({
    // StockModule: a work order reaching a terminal state settles whatever
  // stock it had reserved, and this service is the only thing that can move a
  // work order to one.
  imports: [
    // A leaf: the workshop's own extra questions on the inspection form.
    // A leaf: the workshop's own extra questions on the inspection form.
    FormsModule,
    DatabaseModule, CapabilitiesModule, OperationEventsModule, PoliciesModule, StockModule],
  providers: [
    GateEvaluatorService,
    WorkOrderLifecycleService,
    IntakeService,
    TechnicianWorkService,
    WorkOrderDossierService,
    ChargeableItemsService,
    WorkflowJourneyService,
    JourneyFactsService,
    JourneyEventsService,
    InspectionRepository,
    RuleEvaluatorService,
  ],
  exports: [
    WorkOrderLifecycleService,
    GateEvaluatorService,
    IntakeService,
    TechnicianWorkService,
    WorkOrderDossierService,
    ChargeableItemsService,
    WorkflowJourneyService,
    JourneyFactsService,
    JourneyEventsService,
    InspectionRepository,
    RuleEvaluatorService,
  ],
})
export class OperationsModule {}
