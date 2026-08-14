import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { WorkOrderDisputeService } from "./work-order-dispute.service";
import { StaffRestrictionService } from "./staff-restriction.service";
import { RolePermissionLockService } from "./role-permission-lock.service";
import { RolePermissionLockController } from "./role-permission-lock.controller";

/**
 * Phase 19's governance-depth primitives (19.B dispute state, 19.D
 * restricted-account state), plus the `role_permission_lock` write path
 * (the 53-page audit's highest-leverage missing subsystem): the read
 * side has existed in `apps/api/src/access/` since Phase 3, this module
 * is the writer.
 */
@Module({
  imports: [DatabaseModule, AuthModule, AuditModule],
  controllers: [RolePermissionLockController],
  providers: [WorkOrderDisputeService, StaffRestrictionService, RolePermissionLockService],
  exports: [WorkOrderDisputeService, StaffRestrictionService, RolePermissionLockService],
})
export class GovernanceModule {}
