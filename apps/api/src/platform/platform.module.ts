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

@Module({
  imports: [AuditModule, AuthModule, CapabilitiesModule],
  // PlatformController owns Add Workshop Owner + the availability-check
  // endpoints (Phase 2 step 2); WorkshopsController owns the Workshops
  // list/details/freeze/reactivate endpoints (step 3). Both sit under the
  // same "platform/workshops" URL space -- see WorkshopsController's own
  // comment for why its routes are all suffixed to stay collision-safe
  // regardless of which controller Nest registers first.
  controllers: [PlatformController, WorkshopsController, CapabilitiesController],
  // PlatformGuard isn't exported by AuthModule (only AuthService and
  // SessionGuard are) -- it's small and stateless, so it's simplest to
  // just provide it directly here rather than widen AuthModule's exports
  // for one consumer.
  providers: [PlatformService, PlatformGuard, WorkshopsService, WorkshopHealthService],
})
export class PlatformModule {}
