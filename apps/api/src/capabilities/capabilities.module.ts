import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CapabilityResolutionService } from "./capability-resolution.service";

/**
 * The runtime half of the capability engine. The pure half -- registry,
 * workflow graphs, reachability validator -- lives in @mop/shared and has
 * no framework or database dependency, so it stays exhaustively testable
 * in isolation.
 */
@Module({
  imports: [DatabaseModule],
  providers: [CapabilityResolutionService],
  exports: [CapabilityResolutionService],
})
export class CapabilitiesModule {}
