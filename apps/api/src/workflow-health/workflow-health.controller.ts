import { BadRequestException, Controller, ForbiddenException, Get, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../auth/session.guard";
import { CurrentSession } from "../auth/current-session.decorator";
import { EffectiveAccessService } from "../access/effective-access.service";
import { WorkflowIntegrityService, type IntegrityReport } from "./workflow-integrity.service";
import { WorkflowBottlenecksService, type BottlenecksReport } from "./workflow-bottlenecks.service";

/**
 * Workflow Health / Operations Integrity
 * (docs/detailed-specs/tenant-owner.md). Two facets under one page: real
 * consistency checks (`/issues`) and cause-attributed bottleneck/SLA
 * diagnostics (`/bottlenecks`) -- both permission-gated the same way,
 * both consumers of facts a future Data Analyst surface could read too.
 */
@Controller("organization/workflow-health")
@UseGuards(SessionGuard)
export class WorkflowHealthController {
  constructor(
    private readonly integrity: WorkflowIntegrityService,
    private readonly bottlenecks: WorkflowBottlenecksService,
    private readonly access: EffectiveAccessService,
  ) {}

  @Get("issues")
  async getIssues(@CurrentSession() session: SessionContext): Promise<IntegrityReport> {
    const tenantId = await this.require(session);
    return this.integrity.build(tenantId);
  }

  @Get("bottlenecks")
  async getBottlenecks(
    @CurrentSession() session: SessionContext,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<BottlenecksReport> {
    const tenantId = await this.require(session);
    try {
      return await this.bottlenecks.build(tenantId, { from, to });
    } catch (error) {
      if (error instanceof Error && (error.message === "invalid_date_range" || error.message === "date_range_reversed")) {
        throw new BadRequestException({ code: error.message, message: "Check the date range and try again." });
      }
      throw error;
    }
  }

  private async require(session: SessionContext): Promise<string> {
    const allowed = await this.access.can(session, "organization.workflow_health.view");
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({ code: "forbidden", message: "You do not have access to Workflow Health." });
    }
    return session.tenantId;
  }
}
