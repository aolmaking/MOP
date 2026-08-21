import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../runtime/database/database.module";
import { AuditModule } from "../../audit/audit.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { PolicyResolutionService } from "./policy-resolution.service";

/**
 * The runtime half of the policy model. The pure half -- POLICY_REGISTRY,
 * option types, the relevance/acyclicity validator -- lives in
 * @mop/shared, same split as the capability engine. Imports
 * CapabilitiesModule because `isRelevant()` reads a workshop's real
 * capability profile -- relevance is capabilities + specializations +
 * prior answers together (PHASE_21.md S3.2), not policy answers alone.
 */
@Module({
  imports: [DatabaseModule, AuditModule, CapabilitiesModule],
  providers: [PolicyResolutionService],
  exports: [PolicyResolutionService],
})
export class PoliciesModule {}
