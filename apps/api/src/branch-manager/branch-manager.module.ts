import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AccessModule } from "../access/access.module";
import { OperationsModule } from "../operations/operations.module";
import { BranchManagerController } from "./branch-manager.controller";
import { AttentionQueueService } from "./attention-queue.service";
import { IntakeLookupService } from "./intake-lookup.service";
import { WorkOrderBoardService } from "./work-order-board.service";
import { ApprovalsService } from "./approvals.service";
import { DeliveryService } from "./delivery.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, OperationsModule],
  controllers: [BranchManagerController],
  providers: [AttentionQueueService, IntakeLookupService, WorkOrderBoardService, ApprovalsService, DeliveryService],
  exports: [AttentionQueueService],
})
export class BranchManagerModule {}
