import { Module } from "@nestjs/common";
import { AccessModule } from "../../access/access.module";
import { AuthModule } from "../../auth/auth.module";
import { DatabaseModule } from "../../database/database.module";
import { OperationEventsModule } from "../../operations/operation-events.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";

@Module({
  imports: [DatabaseModule, AccessModule, AuthModule, OperationEventsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService]
})
export class FinanceModule {}
