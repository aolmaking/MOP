import { Controller, ForbiddenException, Get, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../identity/auth/session.guard";
import { CurrentSession } from "../../identity/auth/current-session.decorator";
import { EffectiveAccessService } from "../../identity/access/effective-access.service";
import { resolveScope } from "../analytics/analytics-scope.util";
import { ReportingService } from "./reporting.service";

@Controller("reporting")
@UseGuards(SessionGuard)
export class ReportingController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly access: EffectiveAccessService,
  ) {}

  @Get("company")
  async company(@CurrentSession() session: SessionContext) {
    const allowed = await this.access.can(session, "reports.company.view");
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({ code: "forbidden", message: "You do not have access to this report." });
    }
    return this.reporting.companyReport(session.tenantId, resolveScope(session));
  }
}
