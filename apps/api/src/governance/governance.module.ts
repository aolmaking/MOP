import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuditModule } from "../audit/audit.module";
import { WorkOrderDisputeService } from "./work-order-dispute.service";
import { StaffRestrictionService } from "./staff-restriction.service";

/**
 * Phase 19's governance-depth primitives (19.B dispute state, 19.D
 * restricted-account state). No controller yet, same "API/service
 * first, page follows" pattern as Phases 15/18.
 */
@Module({
  imports: [DatabaseModule, AuditModule],
  providers: [WorkOrderDisputeService, StaffRestrictionService],
  exports: [WorkOrderDisputeService, StaffRestrictionService],
})
export class GovernanceModule {}
