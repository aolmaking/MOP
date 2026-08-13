import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../auth/session.guard";
import { CurrentSession } from "../auth/current-session.decorator";
import { EffectiveAccessService } from "../access/effective-access.service";
import { TeamSetupService } from "../team/team-setup.service";
import { AssignLeaderDto, CreateTeamDto, MoveTechnicianDto } from "../team/team-setup.dto";
import { InviteStaffDto, UpdateStaffScopeDto } from "./staff.dto";
import { StaffPage, StaffService } from "./staff.service";
import { CreateBranchDto, CreateWarehouseDto, SetLinkDto } from "./branch-warehouse.dto";
import { BranchWarehouseService, OrganizationInfrastructure } from "./branch-warehouse.service";

/**
 * Organization & Access -- the Owner's own people, branches, and
 * warehouses (docs/detailed-specs/tenant-owner.md). All four tabs:
 * Staff, Branches, Warehouses, Teams.
 *
 * The Teams tab reuses TeamSetupService verbatim -- it already implements
 * everything the spec asks for (create, assign leader, move technician
 * with preserved history), built for Branch Manager's *delegated*, scoped
 * view. The Owner's view is the same operations with an empty
 * branchScope, which the service already reads as "every branch" -- no
 * second implementation.
 */
@Controller("organization")
@UseGuards(SessionGuard)
export class OrganizationController {
  constructor(
    private readonly staff: StaffService,
    private readonly infra: BranchWarehouseService,
    private readonly teams: TeamSetupService,
    private readonly access: EffectiveAccessService,
  ) {}

  // -- Staff --------------------------------------------------------

  @Get("staff")
  async listStaff(@CurrentSession() session: SessionContext, @Query("cursor") cursor?: string): Promise<StaffPage> {
    await this.requireAccess(session);
    return this.staff.list(session.tenantId!, cursor);
  }

  @Post("staff")
  async inviteStaff(
    @CurrentSession() session: SessionContext,
    @Body() dto: InviteStaffDto,
  ): Promise<{ staffId: string }> {
    await this.requireAccess(session);
    return this.staff.invite(session.tenantId!, dto, this.actorOf(session));
  }

  @Patch("staff/:id/scope")
  async updateScope(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: UpdateStaffScopeDto,
  ): Promise<{ ok: true }> {
    await this.requireAccess(session);
    await this.staff.updateScope(session.tenantId!, id, dto, this.actorOf(session));
    return { ok: true };
  }

  @Patch("staff/:id/active")
  async setActive(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() body: { isActive: boolean },
  ): Promise<{ ok: true }> {
    await this.requireAccess(session);
    await this.staff.setActive(session.tenantId!, id, body.isActive, this.actorOf(session));
    return { ok: true };
  }

  @Patch("staff/:id/locked")
  async setLocked(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() body: { locked: boolean },
  ): Promise<{ ok: true }> {
    await this.requireAccess(session);
    await this.staff.setLocked(session.tenantId!, id, body.locked, this.actorOf(session));
    return { ok: true };
  }

  // -- Branches / Warehouses / matrix --------------------------------

  @Get("infrastructure")
  async infrastructure(@CurrentSession() session: SessionContext): Promise<OrganizationInfrastructure> {
    await this.requireAccess(session);
    return this.infra.page(session.tenantId!);
  }

  @Post("branches")
  async createBranch(
    @CurrentSession() session: SessionContext,
    @Body() dto: CreateBranchDto,
  ): Promise<{ id: string }> {
    await this.requireAccess(session);
    return this.infra.createBranch(session.tenantId!, dto, this.actorOf(session));
  }

  @Patch("branches/:id/active")
  async setBranchActive(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() body: { isActive: boolean },
  ): Promise<{ ok: true }> {
    await this.requireAccess(session);
    await this.infra.setBranchActive(session.tenantId!, id, body.isActive, this.actorOf(session));
    return { ok: true };
  }

  @Post("warehouses")
  async createWarehouse(
    @CurrentSession() session: SessionContext,
    @Body() dto: CreateWarehouseDto,
  ): Promise<{ id: string }> {
    await this.requireAccess(session);
    return this.infra.createWarehouse(session.tenantId!, dto, this.actorOf(session));
  }

  @Post("branch-warehouse-links")
  async setLink(@CurrentSession() session: SessionContext, @Body() dto: SetLinkDto): Promise<{ ok: true }> {
    await this.requireAccess(session);
    await this.infra.setLink(session.tenantId!, dto.branchId, dto.warehouseId, dto.linked, this.actorOf(session));
    return { ok: true };
  }

  // -- Teams (reuses TeamSetupService, unscoped) -----------------------

  @Get("teams")
  async teamsPage(@CurrentSession() session: SessionContext) {
    await this.requireAccess(session);
    return this.teams.page(session.tenantId!, []);
  }

  @Post("teams")
  async createTeam(@CurrentSession() session: SessionContext, @Body() dto: CreateTeamDto) {
    await this.requireAccess(session);
    return this.teams.createTeam(session.tenantId!, [], dto, this.teamActorOf(session));
  }

  @Post("teams/:id/leader")
  async assignLeader(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: AssignLeaderDto,
  ) {
    await this.requireAccess(session);
    return this.teams.assignLeader(session.tenantId!, [], id, dto.teamLeaderId, this.teamActorOf(session));
  }

  @Post("teams/members")
  async moveTechnician(@CurrentSession() session: SessionContext, @Body() dto: MoveTechnicianDto) {
    await this.requireAccess(session);
    return this.teams.moveTechnician(session.tenantId!, [], dto.technicianId, dto.teamId ?? null, this.teamActorOf(session));
  }

  private async requireAccess(session: SessionContext): Promise<void> {
    const allowed = await this.access.can(session, "organization.access.manage");
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({
        code: "forbidden",
        message: "You do not have access to Organization & Access.",
      });
    }
  }

  private actorOf(session: SessionContext) {
    return { accountId: session.accountId, displayName: session.displayName };
  }

  private teamActorOf(session: SessionContext) {
    return { staffUserId: session.staffUserId ?? "", accountId: session.accountId, displayName: session.displayName };
  }
}
