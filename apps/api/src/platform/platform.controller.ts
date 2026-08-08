import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../auth/session.guard";
import { PlatformGuard } from "../auth/platform.guard";
import { CurrentSession } from "../auth/current-session.decorator";
import { CreateWorkshopDto } from "./create-workshop.dto";
import { PlatformService, type CreateWorkshopResult } from "./platform.service";

interface AvailabilityResult {
  available: boolean;
}

@Controller("platform")
@UseGuards(SessionGuard, PlatformGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  /** Populates Add Workshop Owner's Plan dropdown with real plans. */
  @Get("plans")
  listPlans() {
    return this.platformService.listPlans();
  }

  // Debounced-on-blur checks the Add Workshop Owner form calls per field --
  // see platform-super-admin.md's "async (500ms) call on blur" note. Each
  // is re-checked for real at submit time too (translateUniquenessError in
  // the service), since a value can be claimed between the blur check and
  // submit -- these endpoints are a UX convenience, not the enforcement.
  @Get("workshops/name-availability")
  async nameAvailability(@Query("name") name: string): Promise<AvailabilityResult> {
    return { available: await this.platformService.isNameAvailable(name) };
  }

  @Get("workshops/slug-availability")
  async slugAvailability(@Query("slug") slug: string): Promise<AvailabilityResult> {
    return { available: await this.platformService.isSlugAvailable(slug) };
  }

  @Get("workshops/owner-email-availability")
  async ownerEmailAvailability(@Query("email") email: string): Promise<AvailabilityResult> {
    return { available: await this.platformService.isOwnerEmailAvailable(email) };
  }

  @Post("workshops")
  createWorkshop(@Body() dto: CreateWorkshopDto, @CurrentSession() session: SessionContext): Promise<CreateWorkshopResult> {
    return this.platformService.createWorkshop(dto, {
      accountId: session.accountId,
      displayName: session.displayName,
    });
  }
}
