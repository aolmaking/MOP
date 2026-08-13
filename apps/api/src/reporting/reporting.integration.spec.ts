/**
 * Company-wide reporting -- the property that matters most is that this
 * is genuinely un-scoped: it must include technicians outside any one
 * Team Leader's managed roster, which is what makes it the company-wide
 * counterpart to Phase 10's managedTechnicianIds-scoped report rather
 * than a re-export of it.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { ReportingService } from "./reporting.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const service = new ReportingService(prisma as unknown as PrismaService);

const SUFFIX = `rep-${Date.now()}`;
let planId: string;
let tenantId: string;
let branchId: string;
let managedTech: string;
let unmanagedTech: string;

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
      name: "Reporting",
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
      name: `Rep ${SUFFIX}`,
      nameNormalized: `rep ${SUFFIX}`,
      slug: `rep-${SUFFIX}`,
      customerRegistrationCode: `REP-${SUFFIX}`,
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

  const branch = await prisma.branch.create({ data: { tenantId, name: "Main", code: `B-${SUFFIX}` } });
  branchId = branch.id;

  const [leaderAcc, managedAcc, unmanagedAcc] = await Promise.all([account(), account(), account()]);

  const leader = await prisma.staffUser.create({
    data: { accountId: leaderAcc, tenantId, fullName: "Leader", role: "TEAM_LEADER", branchScope: [branchId] },
  });
  const [managed, unmanaged] = await Promise.all([
    prisma.staffUser.create({
      data: { accountId: managedAcc, tenantId, fullName: "Managed Tech", role: "TECHNICIAN", branchScope: [branchId] },
    }),
    prisma.staffUser.create({
      data: { accountId: unmanagedAcc, tenantId, fullName: "Unmanaged Tech", role: "TECHNICIAN", branchScope: [branchId] },
    }),
  ]);
  managedTech = managed.id;
  unmanagedTech = unmanaged.id;

  const team = await prisma.team.create({ data: { tenantId, branchId, name: "One Crew", teamLeaderId: leader.id } });
  await prisma.teamMembership.create({ data: { tenantId, teamId: team.id, technicianId: managedTech } });
  // unmanagedTech is deliberately NOT added to any team.

  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Customer", phone: "0100000020" } });
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS" } });

  const [woA, woB] = await Promise.all([
    prisma.workOrder.create({ data: { tenantId, branchId, assetId: asset.id, customerId: customer.id, status: "IN_PROGRESS" } }),
    prisma.workOrder.create({ data: { tenantId, branchId, assetId: asset.id, customerId: customer.id, status: "WAITING_PARTS" } }),
  ]);

  const [taskA, taskB] = await Promise.all([
    prisma.task.create({ data: { tenantId, workOrderId: woA.id, title: "Managed's task", status: "DONE" } }),
    prisma.task.create({ data: { tenantId, workOrderId: woB.id, title: "Unmanaged's task", status: "DONE" } }),
  ]);

  await Promise.all([
    prisma.taskAssignment.create({ data: { tenantId, taskId: taskA.id, staffUserId: managedTech } }),
    prisma.taskAssignment.create({ data: { tenantId, taskId: taskB.id, staffUserId: unmanagedTech } }),
  ]);

  await prisma.invoice.create({
    data: {
      tenantId,
      workOrderId: woA.id,
      invoiceNumber: `INV-${SUFFIX}`,
      subtotal: "200.00",
      total: "200.00",
      paid: "150.00",
      balance: "50.00",
      issuedById: "staff-1",
    },
  });
}, 180_000);

afterAll(async () => {
  await prisma.invoice.deleteMany({ where: { tenantId } });
  await prisma.taskAssignment.deleteMany({ where: { tenantId } });
  await prisma.task.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.teamMembership.deleteMany({ where: { tenantId } });
  await prisma.team.deleteMany({ where: { tenantId } });
  await prisma.staffUser.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 180_000);

describe("company-wide technician performance", () => {
  it("includes a technician who is not on any team leader's roster", async () => {
    const report = await service.companyReport(tenantId);
    const ids = report.technicianPerformance.map((r) => r.staffUserId);
    expect(ids).toContain(managedTech);
    expect(ids).toContain(unmanagedTech);
  });
});

describe("work order throughput", () => {
  it("groups by status company-wide", async () => {
    const report = await service.companyReport(tenantId);
    const statuses = report.workOrderThroughput.map((r) => r.status);
    expect(statuses).toContain("IN_PROGRESS");
    expect(statuses).toContain("WAITING_PARTS");
  });
});

describe("finance summary", () => {
  it("returns every figure as a string, summed via @mop/shared/money", async () => {
    const report = await service.companyReport(tenantId);
    expect(report.finance.totalInvoiced).toBe("200.00");
    expect(report.finance.totalCollected).toBe("150.00");
    expect(report.finance.outstandingBalance).toBe("50.00");
    expect(typeof report.finance.totalInvoiced).toBe("string");
  });
});
