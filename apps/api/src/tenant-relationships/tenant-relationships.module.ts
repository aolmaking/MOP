import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { TenantLifecycleService } from "./tenant-lifecycle.service";
import { TenantStakeholderService } from "./tenant-stakeholder.service";
import { TenantGroupService } from "./tenant-group.service";

/**
 * Phase 18's tenant-relationship primitives. No controller yet -- like
 * Phase 15's specialization module, this is schema and services proven
 * by direct integration test; a platform-admin page for archiving a
 * tenant, granting a stakeholder, or building a portfolio group is
 * follow-on UI work, not this pass's deliverable.
 */
@Module({
  imports: [DatabaseModule],
  providers: [TenantLifecycleService, TenantStakeholderService, TenantGroupService],
  exports: [TenantLifecycleService, TenantStakeholderService, TenantGroupService],
})
export class TenantRelationshipsModule {}
