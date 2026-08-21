import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../runtime/database/database.module";
import { AuthModule } from "../../../identity/auth/auth.module";
import { AccessModule } from "../../../identity/access/access.module";
import { AuditModule } from "../../../audit/audit.module";
import { TeamModule } from "../team/team.module";
import { OrganizationController } from "./organization.controller";
import { StaffService } from "./staff.service";
import { BranchWarehouseService } from "./branch-warehouse.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, AuditModule, TeamModule],
  controllers: [OrganizationController],
  providers: [StaffService, BranchWarehouseService],
})
export class OrganizationModule {}
