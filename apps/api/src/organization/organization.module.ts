import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AccessModule } from "../access/access.module";
import { AuditModule } from "../audit/audit.module";
import { OrganizationController } from "./organization.controller";
import { StaffService } from "./staff.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, AuditModule],
  controllers: [OrganizationController],
  providers: [StaffService],
})
export class OrganizationModule {}
