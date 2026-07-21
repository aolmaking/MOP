import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { PlatformAddWorkshopOwnerDto, PlatformControlRequestDto } from "@mop/shared";
import { AccessService } from "../../access/access.service";
import { SessionGuard } from "../../auth/session.guard";
import type { RequestWithSession } from "../../tenancy/session-context";
import { PlatformService } from "./platform.service";

@Controller("platform")
@UseGuards(SessionGuard)
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly access: AccessService
  ) {}

  @Get("command-center")
  commandCenter(@Req() req: RequestWithSession) {
    this.access.assert("platform.tenant.read", req.session);
    return this.platform.commandCenter(req.session);
  }

  @Post("workshops")
  addWorkshop(@Req() req: RequestWithSession, @Body() body: PlatformAddWorkshopOwnerDto) {
    this.access.assert("platform.tenant.create", req.session);
    return this.platform.addWorkshopOwner(req.session, body);
  }

  @Post("workshops/:tenantId/freeze")
  freeze(@Req() req: RequestWithSession, @Param("tenantId") tenantId: string, @Body() body: { reason?: string; freezeType?: string; internalNote?: string; notifyOwner?: boolean; confirmed?: boolean }) {
    this.access.assert("platform.tenant.update", req.session);
    return this.platform.freezeWorkshop(req.session, tenantId, body);
  }

  @Post("workshops/:tenantId/reactivate")
  reactivate(@Req() req: RequestWithSession, @Param("tenantId") tenantId: string, @Body() body: { reason?: string; confirmed?: boolean }) {
    this.access.assert("platform.tenant.update", req.session);
    return this.platform.reactivateWorkshop(req.session, tenantId, body);
  }

  @Post("live-view/session")
  liveViewSession(@Req() req: RequestWithSession, @Body() body: { tenantId: string; roleViewed: string; userPersona?: string }) {
    this.access.assert("platform.tenant.read", req.session);
    return this.platform.logLiveViewSession(req.session, body);
  }

  @Post("control/preview")
  previewControl(@Req() req: RequestWithSession, @Body() body: PlatformControlRequestDto) {
    this.access.assert("control.manage", req.session);
    return this.platform.previewControl(req.session, body);
  }

  @Post("control/apply")
  applyControl(@Req() req: RequestWithSession, @Body() body: PlatformControlRequestDto) {
    this.access.assert("control.manage", req.session);
    return this.platform.applyControl(req.session, body);
  }

  @Post("control/rollback")
  rollbackControl(@Req() req: RequestWithSession, @Body() body: { policyId: string; reason?: string; confirmed?: boolean }) {
    this.access.assert("control.manage", req.session);
    return this.platform.rollbackControl(req.session, body);
  }

  @Get("control/effective")
  effective(@Req() req: RequestWithSession, @Query("tenantId") tenantId?: string, @Query("controlKey") controlKey?: string) {
    this.access.assert("platform.tenant.read", req.session);
    return this.platform.resolveEffectiveControls(tenantId, controlKey);
  }
}
