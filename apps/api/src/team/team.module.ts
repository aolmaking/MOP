import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AccessModule } from "../access/access.module";
import { AuditModule } from "../audit/audit.module";
import { TeamSetupService } from "./team-setup.service";
import { TeamSetupController } from "./team-setup.controller";

@Module({
  // AuthModule for SessionGuard, which every route here is behind.
  imports: [DatabaseModule, AuthModule, AccessModule, AuditModule],
  controllers: [TeamSetupController],
  providers: [TeamSetupService],
})
export class TeamModule {}
