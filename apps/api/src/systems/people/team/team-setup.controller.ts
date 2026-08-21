import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../../identity/auth/session.guard";
import { CurrentSession } from "../../../identity/auth/current-session.decorator";
import { EffectiveAccessService } from "../../../identity/access/effective-access.service";
import { TeamSetupService } from "./team-setup.service";
import { AssignLeaderDto, CreateTeamDto, MoveTechnicianDto } from "./team-setup.dto";

/**
 * Team Setup -- the branch manager's delegated view of team structure.
 *
 * Every route asks the same question first. The permission is
 * delegation-gated, so a workshop whose owner has not handed team
 * management over gets a 403 here and no navigation entry at all: this
 * page is absent, not shown-and-locked.
 */
@Controller("branch/teams")
@UseGuards(SessionGuard)
export class TeamSetupController {
  constructor(
    private readonly teams: TeamSetupService,
    private readonly access: EffectiveAccessService,
  ) {}

  @Get()
  async page(@CurrentSession() session: SessionContext) {
    const tenantId = await this.require(session);
    return this.teams.page(tenantId, session.branchScope);
  }

  @Post()
  async create(@CurrentSession() session: SessionContext, @Body() dto: CreateTeamDto) {
    const tenantId = await this.require(session);
    return this.teams.createTeam(tenantId, session.branchScope, dto, this.actor(session));
  }

  @Post(":id/leader")
  async assignLeader(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: AssignLeaderDto,
  ) {
    const tenantId = await this.require(session);
    return this.teams.assignLeader(tenantId, session.branchScope, id, dto.teamLeaderId, this.actor(session));
  }

  @Post("members")
  async move(@CurrentSession() session: SessionContext, @Body() dto: MoveTechnicianDto) {
    const tenantId = await this.require(session);
    return this.teams.moveTechnician(
      tenantId,
      session.branchScope,
      dto.technicianId,
      dto.teamId ?? null,
      this.actor(session),
    );
  }

  private actor(session: SessionContext) {
    return {
      // The person who actually acted. An owner reading their history
      // must see this name, not their own.
      staffUserId: session.staffUserId ?? "",
      accountId: session.accountId,
      displayName: session.displayName,
    };
  }

  private async require(session: SessionContext): Promise<string> {
    const decision = await this.access.check(session, "team_setup.branch.manage");
    if (!decision.allowed || !session.tenantId) {
      throw new ForbiddenException({
        code: "forbidden",
        // The delegation layer's own reason, so a manager who is refused
        // learns it is the owner's switch rather than a bug.
        message: decision.reason ?? "You do not have access to team setup.",
      });
    }
    return session.tenantId;
  }
}
