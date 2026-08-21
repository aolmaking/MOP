import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../runtime/database/database.module";
import { AuthModule } from "../../identity/auth/auth.module";
import { AccessModule } from "../../identity/access/access.module";
import { OperationsModule } from "../../systems/operations/operations.module";
import { CustomerModule } from "../../systems/customer/customer.module";
import { BranchManagerController } from "./branch-manager.controller";
import { AttentionQueueService } from "./attention-queue.service";
import { IntakeLookupService } from "./intake-lookup.service";
import { WorkOrderBoardService } from "./work-order-board.service";
import { ApprovalsService } from "./approvals.service";
import { DeliveryService } from "./delivery.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, OperationsModule, CustomerModule],
  controllers: [BranchManagerController],
  providers: [AttentionQueueService, IntakeLookupService, WorkOrderBoardService, ApprovalsService, DeliveryService],
  exports: [AttentionQueueService],
})
export class BranchManagerModule {}
