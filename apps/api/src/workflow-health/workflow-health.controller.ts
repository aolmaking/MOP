import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { IsIn, IsString, Length } from "class-validator";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../auth/session.guard";
import { CurrentSession } from "../auth/current-session.decorator";
import { EffectiveAccessService } from "../access/effective-access.service";
import { WorkflowIntegrityService, type IntegrityIssueSeverity, type IntegrityReport } from "./workflow-integrity.service";
import { WorkflowBottlenecksService, type BottlenecksReport } from "./workflow-bottlenecks.service";

/**
 * Workflow Health / Operations Integrity
 * (docs/detailed-specs/tenant-owner.md). Two facets under one page: real
 * consistency checks (`/issues`) and cause-attributed bottleneck/SLA
 * diagnostics (`/bottlenecks`) -- both permission-gated the same way,
 * both consumers of facts a future Data Analyst surface could read too.
 */

/**
 * A note is required, not optional: an acknowledgement with no reason is
 * indistinguishable from nobody having looked, and the whole point of the
 * status is telling those two apart.
 */
export class AcknowledgeIssueDto {
  @IsIn(["ACKNOWLEDGED", "INVESTIGATING", "ESCALATED"])
  status!: "ACKNOWLEDGED" | "INVESTIGATING" | "ESCALATED";

  @IsString()
  @Length(3, 1000)
  note!: string;
}

@Controller("organization/workflow-health")
@UseGuards(SessionGuard)
export class WorkflowHealthController {
  constructor(
    private readonly integrity: WorkflowIntegrityService,
    private readonly bottlenecks: WorkflowBottlenecksService,
    private readonly access: EffectiveAccessService,
  ) {}

  /**
   * `severity`, `type` and `status` narrow the list only. The report's
   * `totals` always describe every detected issue, so the filter controls
   * can say what they would reveal instead of collapsing to whatever is
   * currently on screen.
   */
  @Get("issues")
  async getIssues(
    @CurrentSession() session: SessionContext,
    @Query("severity") severity?: string,
    @Query("type") type?: string,
    @Query("status") status?: string,
  ): Promise<IntegrityReport> {
    const tenantId = await this.require(session);
    return this.integrity.build(tenantId, {
      severity: this.parseSeverity(severity),
      type: type || undefined,
      status: status === "open" || status === "handled" ? status : undefined,
    });
  }

  /**
   * Records what somebody decided about one issue.
   *
   * Deliberately not a "resolve": an integrity issue is resolved when the
   * records stop producing it, so the only thing a person can add is what
   * they found or what they are doing -- which is exactly what an Owner
   * looking at the same list tomorrow needs to know.
   */
  @Post("issues/:fingerprint/acknowledge")
  @HttpCode(200)
  async acknowledgeIssue(
    @CurrentSession() session: SessionContext,
    @Param("fingerprint") fingerprint: string,
    @Body() dto: AcknowledgeIssueDto,
  ) {
    const tenantId = await this.require(session);
    return this.integrity.acknowledge(
      tenantId,
      decodeURIComponent(fingerprint),
      { status: dto.status, note: dto.note },
      { accountId: session.accountId, displayName: session.displayName },
    );
  }

  private parseSeverity(value: string | undefined): IntegrityIssueSeverity | undefined {
    return value === "CRITICAL" || value === "WARNING" || value === "INFO" ? value : undefined;
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
