import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../runtime/database/database.module";
import { AuditModule } from "../../audit/audit.module";
import { TenantEntitlementsService } from "./tenant-entitlements.service";

@Module({
  imports: [DatabaseModule, AuditModule],
  providers: [TenantEntitlementsService],
  exports: [TenantEntitlementsService],
})
export class EntitlementsModule {}
