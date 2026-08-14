import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../auth/session.guard";
import { CurrentSession } from "../auth/current-session.decorator";
import { EffectiveAccessService } from "../access/effective-access.service";
import { TeamLeaderService } from "./team-leader.service";
import { SupervisionNoteDto } from "./team-leader.dto";

/**
 * Team Leader's four pages. Every method scopes strictly to
 * `session.managedTechnicianIds` -- never `session.branchScope` -- so a
 * Team Leader managing technicians across branches sees all of them, and
 * nothing outside that roster is ever reachable through this controller.
 */
@Controller("team-leader")
@UseGuards(SessionGuard)
export class TeamLeaderController {
  constructor(
    private readonly service: TeamLeaderService,
    private readonly access: EffectiveAccessService,
  ) {}

  @Get("home")
  async home(@CurrentSession() session: SessionContext) {
    const tenantId = await this.require(session, "team.home.view");
    return this.service.home(tenantId, session.managedTechnicianIds);
  }

  @Get("technicians")
  async technicians(@CurrentSession() session: SessionContext) {
    const tenantId = await this.require(session, "team.technicians.view");
    return this.service.technicians(tenantId, session.managedTechnicianIds);
  }

  @Get("technicians/:id")
  async technicianDetail(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const tenantId = await this.require(session, "team.technicians.view");
    return this.service.technicianDetail(tenantId, session.managedTechnicianIds, id);
  }

  @Post("technicians/:id/notes")
  async addNote(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: SupervisionNoteDto,
  ) {
    const tenantId = await this.require(session, "team.supervision_note.create");
    return this.service.addSupervisionNote(
      tenantId,
      session.managedTechnicianIds,
      id,
      session.accountId,
      dto.body,
      dto.escalate ?? false,
    );
  }

  @Get("work-orders")
  async workOrders(@CurrentSession() session: SessionContext) {
    const tenantId = await this.require(session, "team.workorders.view");
    return this.service.workOrders(tenantId, session.managedTechnicianIds);
  }

  /** "Previous history detected" -- P-81, docs/POLICY_DECISION_INVENTORY.md §8.B. */
  @Get("work-orders/:id/vehicle-history")
  async vehicleHistory(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const tenantId = await this.require(session, "team.workorders.view");
    return this.service.vehicleHistory(tenantId, session.managedTechnicianIds, id);
  }

  @Get("reports")
  async reports(@CurrentSession() session: SessionContext) {
    const tenantId = await this.require(session, "reports.team.view");
    return this.service.reports(tenantId, session.managedTechnicianIds);
  }

  private async require(session: SessionContext, permission: string): Promise<string> {
    const allowed = await this.access.can(session, permission);
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({ code: "forbidden", message: "You do not have access to this page." });
    }
    return session.tenantId;
  }
}
