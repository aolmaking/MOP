import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AccessService } from "../../access/access.service";
import { SessionGuard } from "../../auth/session.guard";
import type { RequestWithSession } from "../../tenancy/session-context";
import { ReportsService } from "./reports.service";

@Controller("reports")
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService, private readonly access: AccessService) {}

  @Get("overview")
  overview(@Req() req: RequestWithSession) {
    this.access.assert("reports.view", req.session);
    return this.reports.overview(req.session);
  }
}
