import { Module } from "@nestjs/common";
import { AuditModule } from "../../audit/audit.module";
import { AuthModule } from "../../identity/auth/auth.module";
import { PlatformGuard } from "../../identity/auth/platform.guard";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";
import { WorkshopsController } from "./workshops/workshops.controller";
import { CapabilitiesController } from "./workshops/capabilities.controller";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { WorkshopsService } from "./workshops/workshops.service";
import { WorkshopHealthService } from "./workshops/workshop-health.service";
import { SpecializationModule } from "../../systems/people/specialization/specialization.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { PlatformReportsController } from "./reports/platform-reports.controller";
import { PlatformReportsService } from "./reports/platform-reports.service";
import { LiveViewController } from "./live-view.controller";
import { LiveViewService } from "./live-view.service";
import { OnboardingController } from "./onboarding/onboarding.controller";
import { OnboardingService } from "./onboarding/onboarding.service";

@Module({
  imports: [AuditModule, AuthModule, CapabilitiesModule, SpecializationModule, EntitlementsModule],
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
    // platform/onboarding -- its own literal prefix, so registration
    // order against platform/workshops never matters.
    OnboardingController,
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
    OnboardingService,
  ],
})
export class PlatformModule {}
