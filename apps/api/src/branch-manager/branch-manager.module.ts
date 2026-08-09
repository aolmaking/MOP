import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AccessModule } from "../access/access.module";
import { BranchManagerController } from "./branch-manager.controller";
import { AttentionQueueService } from "./attention-queue.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule],
  controllers: [BranchManagerController],
  providers: [AttentionQueueService],
  exports: [AttentionQueueService],
})
export class BranchManagerModule {}
