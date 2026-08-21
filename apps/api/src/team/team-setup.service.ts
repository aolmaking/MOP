import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@mop/database";
import { PrismaService } from "../runtime/database/prisma.service";
import { AuditService } from "../audit/audit.service";

export interface TeamMemberView {
  readonly membershipId: string;
  readonly technicianId: string;
  readonly fullName: string;
  readonly startedAt: string;
  /** Null while they are still on the team. */
  readonly endedAt: string | null;
}

export interface TeamView {
  readonly id: string;
  readonly name: string;
  readonly branchId: string | null;
  readonly branchName: string | null;
  readonly isActive: boolean;
  readonly leader: { id: string; fullName: string } | null;
  readonly members: readonly TeamMemberView[];
  /** Everyone who has ever been on it, newest departure first. */
  readonly past: readonly TeamMemberView[];
}

export interface TeamSetupPage {
  readonly teams: readonly TeamView[];
  readonly branches: readonly { id: string; name: string }[];
  /** Team leaders this manager may pick from -- their branches only. */
  readonly eligibleLeaders: readonly { id: string; fullName: string }[];
  /** Technicians in scope, with the team they are on right now. */
  readonly technicians: readonly { id: string; fullName: string; currentTeamId: string | null }[];
}

export interface Actor {
  readonly staffUserId: string;
  readonly accountId: string;
  readonly displayName: string;
}

/**
 * Team Setup, delegated.
 *
 * The owner owns team structure. A branch manager reaches this only
 * where the owner has handed it over, which the permission layer decides
 * -- by the time a call arrives here, the delegation question is settled
 * and this service's job is the second one: **within their branches, and
 * nowhere else.**
 *
 * Scope is enforced on every read AND every write, against the database
 * rather than against what the caller sent. A manager who posts another
 * branch's team id gets the same "not found" as one who posts a team id
 * that never existed -- the response must not confirm that a team they
 * cannot touch exists.
 *
 * Every write is audited with the acting branch manager as actor.
 * Delegation changes who may act; it never changes who is accountable
 * for what happened, and an owner reading their history must see the
 * real name, not their own.
 */
@Injectable()
export class TeamSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async page(tenantId: string, branchScope: readonly string[]): Promise<TeamSetupPage> {
    const branchFilter = this.branchFilter(branchScope);

    const [teams, branches, leaders, technicians] = await Promise.all([
      this.prisma.team.findMany({
        where: { tenantId, ...branchFilter },
        orderBy: { name: "asc" },
        include: {
          branch: { select: { name: true } },
          teamLeader: { select: { id: true, fullName: true } },
          members: {
            include: { technician: { select: { id: true, fullName: true } } },
            orderBy: { startedAt: "desc" },
          },
        },
      }),
      this.prisma.branch.findMany({
        where: { tenantId, ...(branchScope.length > 0 ? { id: { in: [...branchScope] } } : {}) },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      // A leader must already hold the role. This page assigns people to
      // teams; it does not promote anyone, which is the owner's call.
      this.prisma.staffUser.findMany({
        where: { tenantId, role: "TEAM_LEADER", isActive: true, ...this.staffScopeFilter(branchScope) },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      }),
      this.prisma.staffUser.findMany({
        where: { tenantId, role: "TECHNICIAN", isActive: true, ...this.staffScopeFilter(branchScope) },
        select: {
          id: true,
          fullName: true,
          teamMemberships: { where: { endedAt: null }, select: { teamId: true }, take: 1 },
        },
        orderBy: { fullName: "asc" },
      }),
    ]);

    return {
      teams: teams.map((team) => ({
        id: team.id,
        name: team.name,
        branchId: team.branchId,
        branchName: team.branch?.name ?? null,
        isActive: team.isActive,
        leader: team.teamLeader ? { id: team.teamLeader.id, fullName: team.teamLeader.fullName } : null,
        members: team.members.filter((m) => m.endedAt === null).map((m) => this.toMember(m)),
        past: team.members.filter((m) => m.endedAt !== null).map((m) => this.toMember(m)),
      })),
      branches,
      eligibleLeaders: leaders,
      technicians: technicians.map((technician) => ({
        id: technician.id,
        fullName: technician.fullName,
        currentTeamId: technician.teamMemberships[0]?.teamId ?? null,
      })),
    };
  }

  async createTeam(
    tenantId: string,
    branchScope: readonly string[],
    input: { name: string; branchId: string; teamLeaderId: string },
    actor: Actor,
  ): Promise<TeamView> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException({ code: "name_required", message: "A team needs a name." });

    await this.requireBranchInScope(tenantId, branchScope, input.branchId);
    await this.requireEligibleLeader(tenantId, branchScope, input.teamLeaderId);

    const clash = await this.prisma.team.findFirst({
      where: { tenantId, branchId: input.branchId, name },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException({
        code: "team_name_taken",
        message: "This branch already has a team by that name.",
      });
    }

    const team = await this.prisma.team.create({
      data: { tenantId, name, branchId: input.branchId, teamLeaderId: input.teamLeaderId },
    });

    await this.record(tenantId, actor, {
      action: "team.created",
      targetId: team.id,
      after: { name, branchId: input.branchId, teamLeaderId: input.teamLeaderId },
    });

    return this.oneTeam(tenantId, branchScope, team.id);
  }

  async assignLeader(
    tenantId: string,
    branchScope: readonly string[],
    teamId: string,
    teamLeaderId: string,
    actor: Actor,
  ): Promise<TeamView> {
    const team = await this.requireTeamInScope(tenantId, branchScope, teamId);
    await this.requireEligibleLeader(tenantId, branchScope, teamLeaderId);

    if (team.teamLeaderId === teamLeaderId) return this.oneTeam(tenantId, branchScope, teamId);

    await this.prisma.team.update({ where: { id: teamId }, data: { teamLeaderId } });

    await this.record(tenantId, actor, {
      action: "team.leader_assigned",
      targetId: teamId,
      before: { teamLeaderId: team.teamLeaderId },
      after: { teamLeaderId },
    });

    return this.oneTeam(tenantId, branchScope, teamId);
  }

  /**
   * Move a technician onto a team, or off every team when `teamId` is
   * null.
   *
   * The old membership is ENDED, never deleted, and both writes happen
   * in one transaction. Membership is the record of who was responsible
   * for a job at the time it was done -- deleting a row to move someone
   * would rewrite that history, and a half-applied move would put one
   * person on two teams, which the rest of the product reads as an
   * assignment conflict.
   *
   * The schema has no partial unique index enforcing "at most one active
   * membership per technician" (Prisma's `@@unique` cannot express a
   * `WHERE endedAt IS NULL` condition), so that guarantee lived entirely
   * in application logic -- and the `current` read used to happen before
   * this method's own transaction opened (H8,
   * `docs/scenarios3/EDGE_CASE_REGISTER.md`). A double-click, or two
   * managers moving the same technician within the same instant, could
   * both read the same "current" membership, both end it (harmless,
   * idempotent), and both create a brand-new membership row -- leaving
   * the technician on two teams at once despite this comment's own claim
   * that one transaction prevents it. Locking the `StaffUser` row first
   * and re-reading `current` inside that same locked transaction closes
   * the window, same discipline as the stock-balance and work-order
   * locks (H6/E16, H1).
   */
  async moveTechnician(
    tenantId: string,
    branchScope: readonly string[],
    technicianId: string,
    teamId: string | null,
    actor: Actor,
  ): Promise<TeamSetupPage> {
    const technician = await this.prisma.staffUser.findFirst({
      where: { id: technicianId, tenantId, role: "TECHNICIAN", ...this.staffScopeFilter(branchScope) },
      select: { id: true, fullName: true },
    });
    if (!technician) {
      throw new NotFoundException({ code: "technician_not_found", message: "That technician is not in your branches." });
    }

    if (teamId !== null) await this.requireTeamInScope(tenantId, branchScope, teamId);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "staff_users" WHERE id = ${technicianId} FOR UPDATE`;

      const current = await tx.teamMembership.findFirst({
        where: { tenantId, technicianId, endedAt: null },
        select: { id: true, teamId: true },
      });

      if (current?.teamId === teamId) return { moved: false as const, current };

      if (current) {
        await tx.teamMembership.update({ where: { id: current.id }, data: { endedAt: new Date() } });
      }
      if (teamId !== null) {
        await tx.teamMembership.create({ data: { tenantId, teamId, technicianId } });
      }

      return { moved: true as const, current };
    });

    if (!result.moved) return this.page(tenantId, branchScope);

    await this.record(tenantId, actor, {
      action: teamId === null ? "team.member_removed" : "team.member_assigned",
      targetType: "TeamMembership",
      targetId: technicianId,
      before: result.current ? { teamId: result.current.teamId } : null,
      after: teamId === null ? null : { teamId },
    });

    return this.page(tenantId, branchScope);
  }

  private async oneTeam(tenantId: string, branchScope: readonly string[], teamId: string): Promise<TeamView> {
    const page = await this.page(tenantId, branchScope);
    const team = page.teams.find((candidate) => candidate.id === teamId);
    if (!team) throw new NotFoundException({ code: "team_not_found", message: "That team is not in your branches." });
    return team;
  }

  /**
   * Empty scope means every branch -- a manager of the whole workshop.
   * The alternative reading, "no branches, see nothing", would make an
   * unscoped owner-delegated manager stare at an empty page.
   */
  private branchFilter(branchScope: readonly string[]) {
    return branchScope.length > 0 ? { branchId: { in: [...branchScope] } } : {};
  }

  /** A staff member is in scope if any of their branches is in ours. */
  private staffScopeFilter(branchScope: readonly string[]) {
    return branchScope.length > 0 ? { branchScope: { hasSome: [...branchScope] } } : {};
  }

  private async requireTeamInScope(tenantId: string, branchScope: readonly string[], teamId: string) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, tenantId, ...this.branchFilter(branchScope) },
      select: { id: true, teamLeaderId: true, name: true },
    });
    // Deliberately the same error as a team that does not exist: telling
    // a manager "that team is real but not yours" is itself a leak.
    if (!team) throw new NotFoundException({ code: "team_not_found", message: "That team is not in your branches." });
    return team;
  }

  /**
   * Scope is checked in code, then existence in the database.
   *
   * The obvious spread -- `{ id: branchId, ...{ id: { in: scope } } }` --
   * silently drops the first `id`, because a later key wins in an object
   * literal. That version accepted ANY branch and only failed later on
   * the read-back, by which point the team had already been written into
   * somebody else's branch. Two separate steps cannot collide.
   */
  private async requireBranchInScope(tenantId: string, branchScope: readonly string[], branchId: string) {
    const notFound = new NotFoundException({
      code: "branch_not_found",
      message: "That branch is not one of yours.",
    });

    if (branchScope.length > 0 && !branchScope.includes(branchId)) throw notFound;

    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } });
    if (!branch) throw notFound;
  }

  private async requireEligibleLeader(tenantId: string, branchScope: readonly string[], teamLeaderId: string) {
    const leader = await this.prisma.staffUser.findFirst({
      where: {
        id: teamLeaderId,
        tenantId,
        role: "TEAM_LEADER",
        isActive: true,
        ...this.staffScopeFilter(branchScope),
      },
      select: { id: true },
    });
    if (!leader) {
      throw new BadRequestException({
        code: "leader_not_eligible",
        message: "A team leader must already hold that role in one of your branches.",
      });
    }
  }

  private toMember(membership: {
    id: string;
    startedAt: Date;
    endedAt: Date | null;
    technician: { id: string; fullName: string };
  }): TeamMemberView {
    return {
      membershipId: membership.id,
      technicianId: membership.technician.id,
      fullName: membership.technician.fullName,
      startedAt: membership.startedAt.toISOString(),
      endedAt: membership.endedAt?.toISOString() ?? null,
    };
  }

  /**
   * Tagged with the branch manager who actually acted, never with the
   * owner who delegated. Delegation moves the hand, not the name.
   */
  private async record(
    tenantId: string,
    actor: Actor,
    entry: {
      action: string;
      targetId: string;
      targetType?: string;
      before?: Prisma.InputJsonValue | null;
      after?: Prisma.InputJsonValue | null;
    },
  ): Promise<void> {
    await this.audit.record({
      tenantId,
      actorId: actor.accountId,
      actorType: "TENANT_STAFF",
      actorName: actor.displayName,
      targetType: entry.targetType ?? "Team",
      targetId: entry.targetId,
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
      // Team structure decides who is accountable for a job. Getting it
      // wrong is not catastrophic, but it is never routine either.
      riskLevel: "MEDIUM",
    });
  }
}
