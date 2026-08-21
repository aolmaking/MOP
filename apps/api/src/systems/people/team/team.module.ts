import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../runtime/database/database.module";
import { AuthModule } from "../../../identity/auth/auth.module";
import { AccessModule } from "../../../identity/access/access.module";
import { AuditModule } from "../../../audit/audit.module";
import { TeamSetupService } from "./team-setup.service";
import { TeamSetupController } from "./team-setup.controller";

@Module({
  // AuthModule for SessionGuard, which every route here is behind.
  imports: [DatabaseModule, AuthModule, AccessModule, AuditModule],
  controllers: [TeamSetupController],
  providers: [TeamSetupService],
  // Reused by OrganizationModule for the Owner's own (unscoped) Teams tab
  // -- same service, branchScope: [] reads/means "every branch".
  exports: [TeamSetupService],
})
export class TeamModule {}
