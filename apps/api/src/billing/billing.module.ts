import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { GenericBillingAdapter } from "./generic-billing-adapter.service";
import { BillingService } from "./billing.service";

/**
 * Billing -- a separate bounded system from Finance Core, per this
 * project's own recorded decision. Exports only `BillingService`;
 * nothing outside this module ever talks to an adapter directly.
 */
@Module({
  imports: [DatabaseModule],
  providers: [GenericBillingAdapter, BillingService],
  exports: [BillingService],
})
export class BillingModule {}
