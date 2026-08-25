import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../runtime/database/database.module";
import { PlanLimitsService } from "./plan-limits.service";

/**
 * A dependency-free leaf, deliberately: every system that creates a
 * Branch, a Warehouse, or a StaffUser needs this, and none of them
 * should have to pull in the rest of `PlatformModule` (workshop
 * creation, freeze/reactivate, live view) just to check a ceiling.
 */
@Module({
  imports: [DatabaseModule],
  providers: [PlanLimitsService],
  exports: [PlanLimitsService],
})
export class PlanLimitsModule {}
