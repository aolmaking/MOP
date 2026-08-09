import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AccessModule } from "../access/access.module";
import { OperationsModule } from "../operations/operations.module";
import { BranchManagerController } from "./branch-manager.controller";
import { AttentionQueueService } from "./attention-queue.service";
import { IntakeLookupService } from "./intake-lookup.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, OperationsModule],
  controllers: [BranchManagerController],
  providers: [AttentionQueueService, IntakeLookupService],
  exports: [AttentionQueueService],
})
export class BranchManagerModule {}
