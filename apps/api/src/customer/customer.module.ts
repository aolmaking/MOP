import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { OperationEventsModule } from "../operations/operation-events.module";
import { AuthModule } from "../auth/auth.module";
import { PoliciesModule } from "../policies/policies.module";
import { OperationsModule } from "../operations/operations.module";
import { CustomerDecisionController } from "./decision.controller";
import { CustomerDecisionService } from "./decision.service";
import { CustomerPortalController } from "./customer-portal.controller";
import { CustomerPortalService } from "./customer-portal.service";
import { RegisterController } from "./register.controller";
import { RegisterCustomerService } from "./register.service";

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
  // OperationsModule: the portal draws the same workflow strip the
  // technician and the manager see, generated from one projection.
  imports: [DatabaseModule, OperationEventsModule, AuthModule, PoliciesModule, OperationsModule],
  controllers: [CustomerDecisionController, CustomerPortalController, RegisterController],
  providers: [CustomerDecisionService, CustomerPortalService, RegisterCustomerService],
  // CustomerDecisionService is needed by BranchManagerModule's staff-facing
  // counter-approval endpoint (P-18) -- exported rather than duplicated.
  exports: [CustomerDecisionService],
})
export class CustomerModule {}
