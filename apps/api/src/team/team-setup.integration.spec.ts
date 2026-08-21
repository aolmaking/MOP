/**
 * Team Setup, against a real database.
 *
 * Two properties carry this page, and neither is provable against a
 * mock.
 *
 * **Scope holds on writes, not just reads.** A branch manager who posts
 * another branch's team id must be refused by the query, not by a filter
 * applied to what they were shown.
 *
 * **A move ends a membership, never deletes it.** Membership is the
 * record of who was responsible for a job at the time, so moving someone
 * must leave the old row behind with an end date -- and both writes must
 * land together, or one technician ends up on two teams.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { TeamSetupService } from "./team-setup.service";
import { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const teams = new TeamSetupService(asService, new AuditService(asService));

const SUFFIX = `team-${Date.now()}`;
const ACTOR = { staffUserId: "staff-bm", accountId: "acc-bm", displayName: "Amira Hassan" };

let tenantId: string;
let planId: string;
let mineId: string;
let theirsId: string;
let leaderId: string;
let otherLeaderId: string;
let outOfScopeLeaderId: string;
let techAId: string;
let techBId: string;
let outOfScopeTechId: string;
let myTeamId: string;
let theirTeamId: string;

/** The manager covers one branch. Everything else is somebody else's. */
const SCOPE = (): string[] => [mineId];

async function staff(fullName: string, role: "TEAM_LEADER" | "TECHNICIAN", branchScope: string[]): Promise<string> {
  const account = await prisma.account.create({
    data: {
      accountType: "TENANT_STAFF",
      tenantId,
      email: `${fullName.toLowerCase().replace(/\s/g, ".")}.${SUFFIX}@test.local`,
      passwordHash: "x",
      status: "ACTIVE",
    },
  });
  const user = await prisma.staffUser.create({
    data: { accountId: account.id, tenantId, fullName, role, branchScope, warehouseScope: [], categoryScope: ["CARS"] },
  });
  return user.id;
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Teams",
      maxBranches: 5,
      maxUsers: 50,
      maxWarehouses: 5,
      allowedCategories: ["CARS"],
      allowedModules: [],
      allowedFeatures: [],
      allowedReports: [],
      monthlyPrice: 0,
    },
  });
  planId = plan.id;

  const tenant = await prisma.tenant.create({
    data: {
      name: `Teams WS ${SUFFIX}`,
      nameNormalized: `teams ws ${SUFFIX}`,
      slug: `teams-ws-${SUFFIX}`,
      customerRegistrationCode: `TM-${SUFFIX}`,
      status: "ACTIVE",
      planId,
      country: "EG",
      city: "Cairo",
      businessType: "Garage",
      primaryCategory: "CARS",
      currency: "EGP",
      timezone: "Africa/Cairo",
    },
  });
  tenantId = tenant.id;

  mineId = (await prisma.branch.create({ data: { tenantId, name: "Downtown", code: "DT" } })).id;
  theirsId = (await prisma.branch.create({ data: { tenantId, name: "Airport road", code: "AR" } })).id;

  leaderId = await staff("Nadia Kamal", "TEAM_LEADER", [mineId]);
  otherLeaderId = await staff("Omar Zaki", "TEAM_LEADER", [mineId]);
  outOfScopeLeaderId = await staff("Farid Sami", "TEAM_LEADER", [theirsId]);
  techAId = await staff("Hassan Fathy", "TECHNICIAN", [mineId]);
  techBId = await staff("Youssef Adel", "TECHNICIAN", [mineId]);
  outOfScopeTechId = await staff("Karim Nour", "TECHNICIAN", [theirsId]);

  myTeamId = (await prisma.team.create({ data: { tenantId, branchId: mineId, name: "Bay One", teamLeaderId: leaderId } }))
    .id;
  theirTeamId = (
    await prisma.team.create({ data: { tenantId, branchId: theirsId, name: "Bay Two", teamLeaderId: outOfScopeLeaderId } })
  ).id;
}, 180_000);

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.teamMembership.deleteMany({ where: { tenantId } });
  await prisma.team.deleteMany({ where: { tenantId } });
  await prisma.staffUser.deleteMany({ where: { tenantId } });
  await prisma.account.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 180_000);

describe("scope", () => {
  it("shows only teams in this manager's branches", async () => {
    const page = await teams.page(tenantId, SCOPE());

    expect(page.teams.map((team) => team.name)).toEqual(["Bay One"]);
  });

  it("offers only leaders and technicians from those branches", async () => {
    const page = await teams.page(tenantId, SCOPE());

    expect(page.eligibleLeaders.map((leader) => leader.fullName)).not.toContain("Farid Sami");
    expect(page.technicians.map((technician) => technician.fullName)).not.toContain("Karim Nour");
  });

  it("refuses a write against another branch's team the same way as one that does not exist", async () => {
    // Two different errors would confirm the team is real, which is
    // itself a leak.
    await expect(teams.assignLeader(tenantId, SCOPE(), theirTeamId, leaderId, ACTOR)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(teams.assignLeader(tenantId, SCOPE(), "team-that-never-existed", leaderId, ACTOR)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("refuses to create a team in a branch this manager does not cover", async () => {
    await expect(
      teams.createTeam(tenantId, SCOPE(), { name: "Smuggled", branchId: theirsId, teamLeaderId: leaderId }, ACTOR),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Asserted separately, because the first version of this service
    // wrote the team and only failed afterwards on the read-back -- the
    // rejection above passed while the row existed.
    expect(await prisma.team.count({ where: { tenantId, name: "Smuggled" } })).toBe(0);
  });

  it("refuses to move a technician from outside the manager's branches", async () => {
    await expect(teams.moveTechnician(tenantId, SCOPE(), outOfScopeTechId, myTeamId, ACTOR)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("treats an empty scope as the whole workshop, not as nothing", async () => {
    const page = await teams.page(tenantId, []);

    expect(page.teams.map((team) => team.name).sort()).toEqual(["Bay One", "Bay Two"]);
  });
});

describe("creating a team", () => {
  it("requires a leader who already holds the role", async () => {
    // This page assigns people to teams. Promoting anyone is the owner's.
    await expect(
      teams.createTeam(tenantId, SCOPE(), { name: "Bay Three", branchId: mineId, teamLeaderId: techAId }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires a leader from this manager's branches", async () => {
    await expect(
      teams.createTeam(tenantId, SCOPE(), { name: "Bay Three", branchId: mineId, teamLeaderId: outOfScopeLeaderId }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses a duplicate name in the same branch", async () => {
    await expect(
      teams.createTeam(tenantId, SCOPE(), { name: "Bay One", branchId: mineId, teamLeaderId: leaderId }, ACTOR),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("creates a team with its leader", async () => {
    const team = await teams.createTeam(
      tenantId,
      SCOPE(),
      { name: "Bay Four", branchId: mineId, teamLeaderId: otherLeaderId },
      ACTOR,
    );

    expect(team.name).toBe("Bay Four");
    expect(team.leader?.fullName).toBe("Omar Zaki");
    expect(team.members).toEqual([]);
  });
});

describe("moving technicians", () => {
  it("puts a technician on a team", async () => {
    const page = await teams.moveTechnician(tenantId, SCOPE(), techAId, myTeamId, ACTOR);
    const team = page.teams.find((candidate) => candidate.id === myTeamId);

    expect(team?.members.map((member) => member.fullName)).toEqual(["Hassan Fathy"]);
  });

  it("ends the old membership rather than deleting it", async () => {
    const other = await prisma.team.findFirst({ where: { tenantId, name: "Bay Four" } });

    await teams.moveTechnician(tenantId, SCOPE(), techAId, other!.id, ACTOR);

    const rows = await prisma.teamMembership.findMany({
      where: { tenantId, technicianId: techAId },
      orderBy: { startedAt: "asc" },
    });

    // Two rows: the history of where this person has worked survives.
    expect(rows).toHaveLength(2);
    expect(rows[0]?.endedAt).not.toBeNull();
    expect(rows[1]?.endedAt).toBeNull();
  });

  it("never leaves one technician on two teams", async () => {
    const active = await prisma.teamMembership.count({ where: { tenantId, technicianId: techAId, endedAt: null } });

    expect(active).toBe(1);
  });

  it("shows the ended membership as history on the team they left", async () => {
    const page = await teams.page(tenantId, SCOPE());
    const bayOne = page.teams.find((team) => team.id === myTeamId);

    expect(bayOne?.members).toEqual([]);
    expect(bayOne?.past.map((member) => member.fullName)).toContain("Hassan Fathy");
  });

  it("takes someone off every team when the target is null", async () => {
    await teams.moveTechnician(tenantId, SCOPE(), techAId, null, ACTOR);

    const active = await prisma.teamMembership.count({ where: { tenantId, technicianId: techAId, endedAt: null } });
    expect(active).toBe(0);
  });

  it("is a no-op when the technician is already where they are being sent", async () => {
    await teams.moveTechnician(tenantId, SCOPE(), techBId, myTeamId, ACTOR);
    await teams.moveTechnician(tenantId, SCOPE(), techBId, myTeamId, ACTOR);

    const rows = await prisma.teamMembership.count({ where: { tenantId, technicianId: techBId } });
    // A second identical move must not write a churn row.
    expect(rows).toBe(1);
  });

  it("reports who is on no team at all", async () => {
    const page = await teams.page(tenantId, SCOPE());
    const loose = page.technicians.filter((technician) => technician.currentTeamId === null);

    expect(loose.map((technician) => technician.fullName)).toContain("Hassan Fathy");
  });
});

describe("accountability", () => {
  it("records the branch manager who acted, not the owner who delegated", async () => {
    const rows = await prisma.auditLog.findMany({
      where: { tenantId, action: { startsWith: "team." } },
      orderBy: { createdAt: "desc" },
    });

    expect(rows.length).toBeGreaterThan(0);
    // Delegation moves the hand, never the name.
    expect(rows.every((row) => row.actorName === "Amira Hassan")).toBe(true);
    expect(rows.every((row) => row.actorType === "TENANT_STAFF")).toBe(true);
  });

  it("keeps the before and after of a move, so the owner can see what changed", async () => {
    const row = await prisma.auditLog.findFirst({
      where: { tenantId, action: "team.member_assigned" },
      orderBy: { createdAt: "desc" },
    });

    expect(row?.after).not.toBeNull();
  });

  it("audits a leader change with both leaders", async () => {
    await teams.assignLeader(tenantId, SCOPE(), myTeamId, otherLeaderId, ACTOR);

    const row = await prisma.auditLog.findFirst({
      where: { tenantId, action: "team.leader_assigned" },
      orderBy: { createdAt: "desc" },
    });

    expect(row?.before).toEqual({ teamLeaderId: leaderId });
    expect(row?.after).toEqual({ teamLeaderId: otherLeaderId });
  });
});

describe("H8 -- a genuine double-click cannot land a technician on two teams at once", () => {
  it("resolves two simultaneous moves to exactly one active membership", async () => {
    // A fresh technician and two fresh teams, isolated from the
    // sequential state the describes above depend on. Two callers
    // moving the SAME technician at the same instant -- a double-click
    // on a slow connection, or two managers acting together -- used to
    // both read the same "current" membership before either wrote,
    // since that read happened before this method's own transaction
    // opened. docs/scenarios3/EDGE_CASE_REGISTER.md, H8.
    const raceTechId = await staff("Laila Fouad", "TECHNICIAN", [mineId]);
    const teamX = await prisma.team.create({ data: { tenantId, branchId: mineId, name: `Race X ${SUFFIX}`, teamLeaderId: leaderId } });
    const teamY = await prisma.team.create({ data: { tenantId, branchId: mineId, name: `Race Y ${SUFFIX}`, teamLeaderId: leaderId } });

    const results = await Promise.allSettled([
      teams.moveTechnician(tenantId, SCOPE(), raceTechId, teamX.id, ACTOR),
      teams.moveTechnician(tenantId, SCOPE(), raceTechId, teamY.id, ACTOR),
    ]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const active = await prisma.teamMembership.findMany({ where: { tenantId, technicianId: raceTechId, endedAt: null } });
    // Never two -- whichever call actually landed last, exactly one
    // active membership survives, on exactly one of the two teams.
    expect(active).toHaveLength(1);
    expect([teamX.id, teamY.id]).toContain(active[0]?.teamId);
  });
});
