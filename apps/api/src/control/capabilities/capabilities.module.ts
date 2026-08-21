import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../runtime/database/database.module";
import { AuditModule } from "../../audit/audit.module";
import { CapabilityResolutionService } from "./capability-resolution.service";
import { CapabilityChangeService } from "./capability-change.service";

/**
 * The runtime half of the capability engine. The pure half -- registry,
 * workflow graphs, reachability validator -- lives in @mop/shared and has
 * no framework or database dependency, so it stays exhaustively testable
 * in isolation.
 */
@Module({
  imports: [DatabaseModule, AuditModule],
  providers: [CapabilityResolutionService, CapabilityChangeService],
  exports: [CapabilityResolutionService, CapabilityChangeService],
})
export class CapabilitiesModule {}
