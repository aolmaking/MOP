import { Module } from "@nestjs/common";
import { PoliciesModule } from "../../control/policies/policies.module";
import { DatabaseModule } from "../../runtime/database/database.module";
import { AuthModule } from "../../identity/auth/auth.module";
import { AccessModule } from "../../identity/access/access.module";
import { CapabilitiesModule } from "../../control/capabilities/capabilities.module";
import { OperationEventsModule } from "../operations/operation-events.module";
import { OperationsModule } from "../operations/operations.module";
import { AuditModule } from "../../audit/audit.module";
import { BillingModule } from "../billing/billing.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { FinanceConfigurationModule } from "./finance-configuration.module";

/**
 * Finance Core. `FinanceService` is the only writer of invoices and
 * payments, the same shape as WorkOrderLifecycleService owning status and
 * StockService owning balances.
 *
 * Imports BillingModule for the same reason Inventory imports nothing
 * from Finance to price a part: Billing is downstream, never upstream.
 * FinanceService calls BillingService with a typed contract payload; it
 * never reaches into Billing's tables, and Billing never reaches into
 * Finance's.
 */
@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AccessModule,
    CapabilitiesModule,
    OperationEventsModule,
    // Finance PULLS what Operations says is billable, through the
    // ChargeableWorkItem contract. The reverse direction stays closed:
    // Operations and Inventory never import Finance.
    OperationsModule,
    BillingModule,
    AuditModule,
    PoliciesModule,
    // The settings leaf, which Inventory and the technician surface also read.
    FinanceConfigurationModule,
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService, FinanceConfigurationModule],
})
export class FinanceModule {}
