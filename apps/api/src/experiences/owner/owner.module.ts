import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../runtime/database/database.module";
import { AuthModule } from "../../identity/auth/auth.module";
import { AccessModule } from "../../identity/access/access.module";
import { AuditController } from "./audit.controller";
import { AuditQueryService } from "./audit-query.service";
import { OwnerHomeController } from "./owner-home.controller";
import { OwnerHomeService } from "./owner-home.service";
import { OwnerHistoryController } from "./history.controller";
import { WorkshopHistoryModule } from "../../systems/operations/history/history.module";

/**
 * The Tenant Owner's surfaces.
 *
 * Reading the audit log lives here rather than in AuditModule, which has
 * to stay a dependency-free leaf because nearly everything imports it.
 *
 * History is a THIRD thing, next to Audit and next to Home, and is kept
 * that way on purpose: Audit answers "who changed the system", History
 * answers "what happened to this customer's vehicle". Merging them would
 * lose both questions.
 */
@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, WorkshopHistoryModule],
  controllers: [AuditController, OwnerHomeController, OwnerHistoryController],
  providers: [AuditQueryService, OwnerHomeService],
})
export class OwnerModule {}
