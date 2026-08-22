import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../../../identity/auth/session.guard";
import { PlatformGuard } from "../../../identity/auth/platform.guard";
import { ListWorkshopsQueryDto } from "../workshops/list-workshops.dto";
import { UsageOverviewQueryDto } from "./usage-overview-query.dto";
import { PlatformReportsService } from "./platform-reports.service";

@Controller("platform/reports")
@UseGuards(SessionGuard, PlatformGuard)
export class PlatformReportsController {
  constructor(private readonly reports: PlatformReportsService) {}

  @Get()
  overview(@Query() query: ListWorkshopsQueryDto) {
    return this.reports.overview(query);
  }

  @Get(":id/usage")
  usage(@Param("id") id: string, @Query() query: UsageOverviewQueryDto) {
    return this.reports.usageOverview(id, query.window);
  }

  @Get(":id")
  detail(@Param("id") id: string, @Query() query: UsageOverviewQueryDto) {
    return this.reports.detail(id, query.window);
  }
}
