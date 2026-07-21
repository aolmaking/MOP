import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { CreateDecisionRequestDto, SubmitCustomerDecisionDto } from "@mop/shared";
import { AccessService } from "../../access/access.service";
import { SessionGuard } from "../../auth/session.guard";
import type { RequestWithSession } from "../../tenancy/session-context";
import { CustomerDecisionsService } from "./customer-decisions.service";

@Controller("customer-decisions")
export class CustomerDecisionsController {
  constructor(
    private readonly decisions: CustomerDecisionsService,
    private readonly access: AccessService
  ) {}

  @Get()
  @UseGuards(SessionGuard)
  list(@Req() req: RequestWithSession) {
    this.access.assert("customer_decision.view_staff", req.session);
    return this.decisions.list(req.session);
  }

  @Get("my")
  @UseGuards(SessionGuard)
  myList(@Req() req: RequestWithSession) {
    this.access.assert("customer_decision.view_own", req.session);
    return this.decisions.list(req.session);
  }

  @Post()
  @UseGuards(SessionGuard)
  create(@Req() req: RequestWithSession, @Body() body: CreateDecisionRequestDto) {
    this.access.assert("customer_decision.create", req.session);
    return this.decisions.create(req.session, body);
  }

  @Post(":id/send")
  @UseGuards(SessionGuard)
  send(@Req() req: RequestWithSession, @Param("id") id: string) {
    this.access.assert("customer_decision.send", req.session);
    return this.decisions.send(req.session, id);
  }

  @Get("asset/:assetId/timeline")
  @UseGuards(SessionGuard)
  assetTimeline(@Req() req: RequestWithSession, @Param("assetId") assetId: string) {
    this.access.assert("customer_decision.view_staff", req.session);
    return this.decisions.assetTimeline(req.session, assetId);
  }

  @Get("public/:token")
  publicDecision(@Param("token") token: string) {
    return this.decisions.publicDecision(token);
  }

  @Post("public/:token/submit")
  submitPublicDecision(@Param("token") token: string, @Body() body: SubmitCustomerDecisionDto) {
    return this.decisions.submitPublicDecision(token, body);
  }
}
