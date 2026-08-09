import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AccessModule } from "../access/access.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { OperationEventsModule } from "../operations/operation-events.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";

/**
 * Finance Core. `FinanceService` is the only writer of invoices and
 * payments, the same shape as WorkOrderLifecycleService owning status and
 * StockService owning balances.
 */
@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, CapabilitiesModule, OperationEventsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
