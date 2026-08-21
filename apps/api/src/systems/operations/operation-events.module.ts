import { Module } from "@nestjs/common";
import { AuditModule } from "../../audit/audit.module";
import { CustomerSafeProjectionService } from "./customer-safe-projection.service";
import { OperationEventsService } from "./operation-events.service";

@Module({
  imports: [AuditModule],
  providers: [OperationEventsService, CustomerSafeProjectionService],
  exports: [OperationEventsService, CustomerSafeProjectionService],
})
export class OperationEventsModule {}
