import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { OperationEventsModule } from "../../operations/operation-events.module";
import { FinanceModule } from "../finance/finance.module";
import { BranchManagerController } from "./branch-manager.controller";
import { BranchManagerService } from "./branch-manager.service";

@Module({
  imports: [AuthModule, OperationEventsModule, FinanceModule],
  controllers: [BranchManagerController],
  providers: [BranchManagerService]
})
export class BranchManagerModule {}
