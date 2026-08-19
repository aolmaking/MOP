import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PlatformGuard } from "../auth/platform.guard";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";
import { WorkshopsController } from "./workshops/workshops.controller";
import { CapabilitiesController } from "./workshops/capabilities.controller";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { WorkshopsService } from "./workshops/workshops.service";
import { WorkshopHealthService } from "./workshops/workshop-health.service";
import { SpecializationModule } from "../specialization/specialization.module";
import { PlatformReportsController } from "./reports/platform-reports.controller";
import { PlatformReportsService } from "./reports/platform-reports.service";
import { LiveViewController } from "./live-view.controller";
import { LiveViewService } from "./live-view.service";

@Module({
  imports: [AuditModule, AuthModule, CapabilitiesModule, SpecializationModule],
  // PlatformController owns Add Workshop Owner + the availability-check
  // endpoints (Phase 2 step 2); WorkshopsController owns the Workshops
  // list/details/freeze/reactivate endpoints (step 3); PlatformReportsController
  // owns Platform Reports (Level 1 + Usage Overview, see PAGE_INVENTORY.md
  // for what's deliberately not built yet). Each sits under its own
  // literal prefix (platform/workshops, platform/reports), so registration
  // order between them never matters.
  controllers: [
    PlatformController,
    WorkshopsController,
    CapabilitiesController,
    PlatformReportsController,
    LiveViewController,
  ],
  // PlatformGuard isn't exported by AuthModule (only AuthService and
  // SessionGuard are) -- it's small and stateless, so it's simplest to
  // just provide it directly here rather than widen AuthModule's exports
  // for one consumer.
  providers: [
    PlatformService,
    PlatformGuard,
    WorkshopsService,
    WorkshopHealthService,
    PlatformReportsService,
    LiveViewService,
  ],
})
export class PlatformModule {}
