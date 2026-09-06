import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../identity/auth/session.guard";
import { CurrentSession } from "../../identity/auth/current-session.decorator";
import { EffectiveAccessService } from "../../identity/access/effective-access.service";
import { TeamLeaderService } from "./team-leader.service";
import { WorkflowJourneyService } from "../../systems/operations/workflow-journey.service";
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
    private readonly journey: WorkflowJourneyService,
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

  /**
   * One job's live journey, in the managerial vocabulary.
   *
   * The SAME projection the technician and the customer read -- the
   * words differ, the state does not, which is what stops a Team Leader
   * chasing a job their technician is being told something else about.
   *
   * Scoped through `requireInTeam` FIRST, so a work-order id belonging
   * to a technician outside this roster is refused before any journey is
   * built. The id in the path is never a capability: the session's
   * managed roster is.
   *
   * No viewer is passed, and so no actions come back. A Team Leader's
   * levers on a job -- reassigning it, clearing a blocker -- belong to
   * the branch manager's surface and are gated by permissions this
   * controller does not hold; offering them here would be a button that
   * the other controller then refuses.
   */
  @Get("work-orders/:id/journey")
  async workOrderJourney(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const tenantId = await this.require(session, "team.workorders.view");
    await this.service.requireInTeam(tenantId, session.managedTechnicianIds, id);
    return this.journey.forWorkOrder(tenantId, id, "MANAGER");
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
