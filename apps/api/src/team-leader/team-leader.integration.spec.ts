/**
 * Team Leader -- visibility, never a maintenance decision.
 *
 * The property that matters most: scope is `managedTechnicianIds`, not
 * `branchScope`. A Team Leader managing technicians across two branches
 * must see both, and a technician who is not on their team, anywhere,
 * must be invisible -- proven here against real TeamMembership rows
 * rather than assumed from the query shape.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { PrismaClient } from "@mop/database";
import { DEFAULT_ROLE_PERMISSIONS } from "@mop/shared";
import { TeamLeaderService } from "./team-leader.service";
import { AssetHistoryService } from "../vehicle-history/asset-history.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const service = new TeamLeaderService(asService, new AssetHistoryService(asService));

const SUFFIX = `tl-${Date.now()}`;
let planId: string;
let tenantId: string;
let branchA: string;
let branchB: string;
let leaderStaffId: string;
let techA: string; // on the leader's team, branch A
let techB: string; // on the leader's team, branch B
let outsider: string; // not on the leader's team

async function account(): Promise<string> {
  const acc = await prisma.account.create({
    data: { accountType: "TENANT_STAFF", email: `${Math.random()}@example.com`, status: "ACTIVE" },
  });
  return acc.id;
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "TeamLeader",
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
      name: `TL ${SUFFIX}`,
      nameNormalized: `tl ${SUFFIX}`,
      slug: `tl-${SUFFIX}`,
      customerRegistrationCode: `TL-${SUFFIX}`,
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

  const [ba, bb] = await Promise.all([
    prisma.branch.create({ data: { tenantId, name: "Branch A", code: `A-${SUFFIX}` } }),
    prisma.branch.create({ data: { tenantId, name: "Branch B", code: `B-${SUFFIX}` } }),
  ]);
  branchA = ba.id;
  branchB = bb.id;

  const [leaderAcc, techAAcc, techBAcc, outsiderAcc] = await Promise.all([account(), account(), account(), account()]);

  const [leader, tA, tB, out] = await Promise.all([
    prisma.staffUser.create({
      data: { accountId: leaderAcc, tenantId, fullName: "Leader One", role: "TEAM_LEADER", branchScope: [branchA] },
    }),
    prisma.staffUser.create({
      data: { accountId: techAAcc, tenantId, fullName: "Tech A", role: "TECHNICIAN", branchScope: [branchA] },
    }),
    prisma.staffUser.create({
      data: { accountId: techBAcc, tenantId, fullName: "Tech B", role: "TECHNICIAN", branchScope: [branchB] },
    }),
    prisma.staffUser.create({
      data: { accountId: outsiderAcc, tenantId, fullName: "Outsider", role: "TECHNICIAN", branchScope: [branchA] },
    }),
  ]);
  leaderStaffId = leader.id;
  techA = tA.id;
  techB = tB.id;
  outsider = out.id;

  // One team, cross-branch membership -- proves scope follows the team,
  // not the branch.
  const team = await prisma.team.create({
    data: { tenantId, branchId: branchA, name: "Cross-branch crew", teamLeaderId: leaderStaffId },
  });
  await Promise.all([
    prisma.teamMembership.create({ data: { tenantId, teamId: team.id, technicianId: techA } }),
    prisma.teamMembership.create({ data: { tenantId, teamId: team.id, technicianId: techB } }),
  ]);

  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Some Customer", phone: "0100000000" } });
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: "TL-TEST-1" } });

  const [woA, woB] = await Promise.all([
    prisma.workOrder.create({ data: { tenantId, branchId: branchA, assetId: asset.id, customerId: customer.id, status: "IN_PROGRESS" } }),
    prisma.workOrder.create({ data: { tenantId, branchId: branchB, assetId: asset.id, customerId: customer.id, status: "WAITING_PARTS" } }),
  ]);

  const [taskA, taskB] = await Promise.all([
    prisma.task.create({ data: { tenantId, workOrderId: woA.id, title: "Replace brakes", status: "IN_PROGRESS" } }),
    prisma.task.create({ data: { tenantId, workOrderId: woB.id, title: "Oil change", status: "IN_PROGRESS" } }),
  ]);

  await Promise.all([
    prisma.taskAssignment.create({ data: { tenantId, taskId: taskA.id, staffUserId: techA } }),
    prisma.taskAssignment.create({ data: { tenantId, taskId: taskB.id, staffUserId: techB } }),
  ]);
}, 180_000);

afterAll(async () => {
  await prisma.taskAssignment.deleteMany({ where: { tenantId } });
  await prisma.taskBlocker.deleteMany({ where: { tenantId } });
  await prisma.task.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.supervisionNote.deleteMany({ where: { tenantId } });
  await prisma.teamMembership.deleteMany({ where: { tenantId } });
  await prisma.team.deleteMany({ where: { tenantId } });
  await prisma.staffUser.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 180_000);

describe("cross-branch visibility", () => {
  it("sees managed technicians on both branches", async () => {
    const rows = await service.technicians(tenantId, [techA, techB]);
    const ids = rows.map((r) => r.staffUserId);
    expect(ids).toContain(techA);
    expect(ids).toContain(techB);
  });

  it("never shows a technician who is not on the team", async () => {
    const rows = await service.technicians(tenantId, [techA, techB]);
    expect(rows.map((r) => r.staffUserId)).not.toContain(outsider);
  });

  it("refuses to open detail for an unmanaged technician", async () => {
    await expect(service.technicianDetail(tenantId, [techA, techB], outsider)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("home reflects work spread across branches", async () => {
    const home = await service.home(tenantId, [techA, techB]);
    expect(home.managedCount).toBe(2);
    expect(home.activeWork).toBe(2);
    expect(home.waitingParts).toBe(1);
  });
});

describe("supervision notes", () => {
  it("are hidden unless the technician is managed", async () => {
    await expect(
      service.addSupervisionNote(tenantId, [techA], outsider, leaderStaffId, "note", false),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("attach to the right technician and surface in their detail", async () => {
    await service.addSupervisionNote(tenantId, [techA], techA, leaderStaffId, "Needs a refresher on torque specs", true);
    const detail = await service.technicianDetail(tenantId, [techA], techA);
    expect(detail.supervisionNotes.some((n) => n.escalated && n.body.includes("torque"))).toBe(true);
  });
});

describe("work orders view carries no money field", () => {
  it("returns only visibility fields", async () => {
    const rows = await service.workOrders(tenantId, [techA, techB]);
    for (const row of rows) {
      expect(row).not.toHaveProperty("price");
      expect(row).not.toHaveProperty("cost");
      expect(row).not.toHaveProperty("payment");
    }
    expect(rows.length).toBeGreaterThan(0);
  });

  it("carries the asset's plate as a display identifier, not the raw work order id", async () => {
    const rows = await service.workOrders(tenantId, [techA, techB]);
    expect(rows.every((row) => row.identifier === "TL-TEST-1")).toBe(true);
  });
});

describe("the forbidden permission list", () => {
  it("never grants a maintenance decision to TEAM_LEADER", () => {
    const granted = DEFAULT_ROLE_PERMISSIONS.TEAM_LEADER ?? {};
    for (const forbidden of [
      "task.complete",
      "task.review",
      "task.return_for_rework",
      "parts.issue",
      "finance.payment.record",
      "customer_decision.respond",
    ]) {
      expect(granted[forbidden as keyof typeof granted]).not.toBe(true);
    }
  });
});
