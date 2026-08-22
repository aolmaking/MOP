import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../runtime/database/database.module";
import { GenericBillingAdapter } from "./generic-billing-adapter.service";
import { BillingService } from "./billing.service";

/**
 * Billing -- a separate bounded system from Finance Core, per this
 * project's own recorded decision. Exports only `BillingService`;
 * nothing outside this module ever talks to an adapter directly.
 *
 * UNCOVERED_COUNTRY_BILLING decides whether issueDocument refuses to
 * issue at all, but is resolved by FinanceService before it opens its
 * transaction and handed in as a plain value -- see issueDocument's own
 * doc for why, so this module does not import PoliciesModule.
 */
@Module({
  imports: [DatabaseModule],
  providers: [GenericBillingAdapter, BillingService],
  exports: [BillingService],
})
export class BillingModule {}
