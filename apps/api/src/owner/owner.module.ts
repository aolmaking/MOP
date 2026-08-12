import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AccessModule } from "../access/access.module";
import { AuditController } from "./audit.controller";
import { AuditQueryService } from "./audit-query.service";

/**
 * The Tenant Owner's surfaces.
 *
 * Reading the audit log lives here rather than in AuditModule, which has
 * to stay a dependency-free leaf because nearly everything imports it.
 * The remaining seven Owner pages arrive in Phase 10.
 */
@Module({
  imports: [DatabaseModule, AuthModule, AccessModule],
  controllers: [AuditController],
  providers: [AuditQueryService],
})
export class OwnerModule {}
