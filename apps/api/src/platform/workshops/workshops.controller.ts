import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../auth/session.guard";
import { PlatformGuard } from "../../auth/platform.guard";
import { CurrentSession } from "../../auth/current-session.decorator";
import { ListWorkshopsQueryDto } from "./list-workshops.dto";
import { ReasonDto } from "./reason.dto";
import { WorkshopsService } from "./workshops.service";

// Every route here is suffixed (/:id/details, /:id/freeze, ...), never a
// bare GET /platform/workshops/:id -- PlatformController registers real
// literal routes under the same /platform/workshops prefix
// (name-availability, slug-availability, ...), and a bare :id would risk
// swallowing them as a param if controller registration order ever
// changed. A suffixed path can never collide with a 2-segment literal
// route, so this is correct regardless of registration order, not
// dependent on it.
@Controller("platform/workshops")
@UseGuards(SessionGuard, PlatformGuard)
export class WorkshopsController {
  constructor(private readonly workshopsService: WorkshopsService) {}

  @Get()
  list(@Query() query: ListWorkshopsQueryDto) {
    return this.workshopsService.list(query);
  }

  @Get(":id/details")
  details(@Param("id") id: string) {
    return this.workshopsService.getDetails(id);
  }

  @Get(":id/freeze-impact-preview")
  freezeImpactPreview(@Param("id") id: string) {
    return this.workshopsService.freezeImpactPreview(id);
  }

  @Post(":id/freeze")
  async freeze(@Param("id") id: string, @Body() dto: ReasonDto, @CurrentSession() session: SessionContext): Promise<{ ok: true }> {
    await this.workshopsService.freeze(id, dto.reason, { accountId: session.accountId, displayName: session.displayName });
    return { ok: true };
  }

  @Post(":id/reactivate")
  async reactivate(@Param("id") id: string, @Body() dto: ReasonDto, @CurrentSession() session: SessionContext): Promise<{ ok: true }> {
    await this.workshopsService.reactivate(id, dto.reason, { accountId: session.accountId, displayName: session.displayName });
    return { ok: true };
  }
}
