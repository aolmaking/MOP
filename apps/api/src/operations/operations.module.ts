import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OperationEventsModule } from "./operation-events.module";
import { GateEvaluatorService } from "./gate-evaluator.service";
import { WorkOrderLifecycleService } from "./work-order-lifecycle.service";

/**
 * The operations spine: the work-order lifecycle and the gates that guard
 * it. WorkOrderLifecycleService is the only exported way to change a work
 * order's status, which is what keeps transitions in the capability graph
 * rather than scattered through the services that happen to need them.
 */
@Module({
  imports: [DatabaseModule, CapabilitiesModule, OperationEventsModule],
  providers: [GateEvaluatorService, WorkOrderLifecycleService],
  exports: [WorkOrderLifecycleService, GateEvaluatorService],
})
export class OperationsModule {}
