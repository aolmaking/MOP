import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { OperationEventsModule } from "../../operations/operation-events.module";
import { CustomerDecisionsController } from "./customer-decisions.controller";
import { CustomerDecisionsService } from "./customer-decisions.service";

@Module({
  imports: [AuthModule, OperationEventsModule],
  controllers: [CustomerDecisionsController],
  providers: [CustomerDecisionsService]
})
export class CustomerDecisionsModule {}
