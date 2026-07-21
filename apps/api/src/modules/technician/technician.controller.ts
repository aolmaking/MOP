import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AccessService } from "../../access/access.service";
import { SessionGuard } from "../../auth/session.guard";
import type { RequestWithSession } from "../../tenancy/session-context";
import { TechnicianService } from "./technician.service";

@Controller("technician")
@UseGuards(SessionGuard)
export class TechnicianController {
  constructor(
    private readonly technician: TechnicianService,
    private readonly access: AccessService
  ) {}

  @Get("home")
  home(@Req() req: RequestWithSession) {
    this.access.assert("task.view_assigned", req.session);
    return this.technician.home(req.session);
  }

  @Get("my-work")
  myWork(@Req() req: RequestWithSession) {
    this.access.assert("task.view_assigned", req.session);
    return this.technician.myWork(req.session);
  }

  @Get("work-card")
  workCard(@Req() req: RequestWithSession, @Query("taskId") taskId?: string) {
    this.access.assert("task.view_assigned", req.session);
    return this.technician.workCard(req.session, taskId);
  }

  @Get("diagnostic-code")
  diagnosticCode(@Req() req: RequestWithSession, @Query("code") code = "") {
    this.access.assert("task.view_assigned", req.session);
    return this.technician.diagnosticCode(code);
  }

  @Post("action")
  recordAction(@Req() req: RequestWithSession, @Body() body: any) {
    this.access.assert("task.view_assigned", req.session);
    return this.technician.recordAction(req.session, body);
  }
}
