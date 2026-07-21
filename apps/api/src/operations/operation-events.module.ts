import { Module } from "@nestjs/common";
import { AccessModule } from "../access/access.module";
import { AuthModule } from "../auth/auth.module";
import { CrossRoleActionContractsService } from "./cross-role-action-contracts.service";
import { CustomerSafeProjectionService } from "./customer-safe-projection.service";
import { NotificationRoutingService } from "./notification-routing.service";
import { OperationEventsService } from "./operation-events.service";
import { OperationsController } from "./operations.controller";
import { WorkflowHealthService } from "./workflow-health.service";
import { WorkflowStatusResolverService } from "./workflow-status-resolver.service";

@Module({
  imports: [AuthModule, AccessModule],
  controllers: [OperationsController],
  providers: [
    CrossRoleActionContractsService,
    CustomerSafeProjectionService,
    NotificationRoutingService,
    OperationEventsService,
    WorkflowHealthService,
    WorkflowStatusResolverService
  ],
  exports: [
    CrossRoleActionContractsService,
    CustomerSafeProjectionService,
    NotificationRoutingService,
    OperationEventsService,
    WorkflowHealthService,
    WorkflowStatusResolverService
  ]
})
export class OperationEventsModule {}
