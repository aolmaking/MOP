import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { WorkOrdersController } from "./work-orders.controller";
import { WorkOrdersService } from "./work-orders.service";

@Module({
  imports: [AuthModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService]
})
export class WorkOrdersModule {}
