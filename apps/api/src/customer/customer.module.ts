import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { OperationEventsModule } from "../operations/operation-events.module";
import { AuthModule } from "../auth/auth.module";
import { PoliciesModule } from "../policies/policies.module";
import { CustomerDecisionController } from "./decision.controller";
import { CustomerDecisionService } from "./decision.service";
import { CustomerPortalController } from "./customer-portal.controller";
import { CustomerPortalService } from "./customer-portal.service";

/**
 * The customer-facing surface.
 *
 * `CustomerDecisionController` stays public by design -- the decision
 * link must open without a login -- while `CustomerPortalController`
 * needs `AuthModule` for `SessionGuard`, since the portal proper IS an
 * authenticated customer session. Both live in one module because they
 * are the same bounded concern (what a customer, not a staff member,
 * gets to see), not because they share an access model.
 */
@Module({
  imports: [DatabaseModule, OperationEventsModule, AuthModule, PoliciesModule],
  controllers: [CustomerDecisionController, CustomerPortalController],
  providers: [CustomerDecisionService, CustomerPortalService],
  // CustomerDecisionService is needed by BranchManagerModule's staff-facing
  // counter-approval endpoint (P-18) -- exported rather than duplicated.
  exports: [CustomerDecisionService],
})
export class CustomerModule {}
