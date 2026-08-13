import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuditModule } from "../audit/audit.module";
import { PolicyResolutionService } from "./policy-resolution.service";

/**
 * The runtime half of the policy model. The pure half -- POLICY_REGISTRY,
 * option types, the relevance/acyclicity validator -- lives in
 * @mop/shared, same split as the capability engine.
 */
@Module({
  imports: [DatabaseModule, AuditModule],
  providers: [PolicyResolutionService],
  exports: [PolicyResolutionService],
})
export class PoliciesModule {}
